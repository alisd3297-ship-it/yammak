-- ============ 1) إعدادات التسعير الافتراضية ============
INSERT INTO public.app_settings (key, value) VALUES
  ('delivery_fee_fallback', '{"base_fee":2000,"per_km_fee":500,"min_fee":2000}'::jsonb),
  ('auto_complete_hours', '12'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============ 2) مسافة هافرساين ============
CREATE OR REPLACE FUNCTION public.haversine_km(
  a_lat double precision, a_lng double precision,
  b_lat double precision, b_lng double precision
) RETURNS double precision
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN a_lat IS NULL OR a_lng IS NULL OR b_lat IS NULL OR b_lng IS NULL THEN NULL
    ELSE 2 * 6371 * asin(sqrt(
      power(sin(radians(b_lat - a_lat) / 2), 2)
      + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2)
    ))
  END;
$$;

-- ============ 3) حساب أجرة التوصيل من pricing_rules / app_settings ============
CREATE OR REPLACE FUNCTION public.compute_delivery_fee(
  _order_type order_type,
  _city_id uuid,
  _provider_id uuid,
  _distance_km double precision
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  fb jsonb;
  base numeric; perkm numeric; minfee numeric;
  km numeric := GREATEST(COALESCE(_distance_km, 0), 0);
  fee numeric;
BEGIN
  SELECT * INTO r FROM public.pricing_rules
  WHERE is_active AND order_type = _order_type
    AND (provider_id IS NULL OR provider_id = _provider_id)
    AND (city_id IS NULL OR city_id = _city_id)
  ORDER BY (provider_id = _provider_id) DESC NULLS LAST, (city_id = _city_id) DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    base := r.base_fee; perkm := r.per_km_fee; minfee := r.min_fee;
  ELSE
    SELECT value INTO fb FROM public.app_settings WHERE key = 'delivery_fee_fallback';
    base   := COALESCE((fb->>'base_fee')::numeric, 2000);
    perkm  := COALESCE((fb->>'per_km_fee')::numeric, 500);
    minfee := COALESCE((fb->>'min_fee')::numeric, 2000);
  END IF;

  fee := base + (perkm * km);
  IF fee < minfee THEN fee := minfee; END IF;
  RETURN round(fee);
END; $$;

-- ============ 4) جدول الانتقالات المسموحة ============
CREATE OR REPLACE FUNCTION public.is_allowed_transition(
  _actor text, _from order_status, _to order_status
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF _from = _to THEN RETURN false; END IF;

  -- الإلغاء ضمن شروط واضحة
  IF _to = 'cancelled' THEN
    RETURN CASE _actor
      WHEN 'customer' THEN _from IN ('new','awaiting_provider','accepted')
      WHEN 'provider' THEN _from IN ('new','awaiting_provider','accepted','preparing')
      WHEN 'staff'    THEN _from NOT IN ('completed','cancelled')
      ELSE false END;
  END IF;

  IF _from IN ('completed','cancelled') THEN RETURN false; END IF;

  IF _actor = 'staff' THEN RETURN true; END IF;

  RETURN CASE _actor
    WHEN 'provider' THEN
      (_from = 'new' AND _to = 'awaiting_provider')
      OR (_from = 'awaiting_provider' AND _to = 'accepted')
      OR (_from = 'accepted' AND _to = 'preparing')
      OR (_from = 'preparing' AND _to = 'ready_for_pickup')
      OR (_from = 'ready_for_pickup' AND _to = 'searching_driver')
    WHEN 'driver' THEN
      (_from = 'driver_accepted' AND _to = 'driver_heading_pickup')
      OR (_from = 'driver_heading_pickup' AND _to = 'picked_up')
      OR (_from = 'picked_up' AND _to = 'on_the_way')
      OR (_from = 'on_the_way' AND _to = 'delivered')
    WHEN 'customer' THEN
      (_from = 'delivered' AND _to = 'completed')
    WHEN 'system' THEN
      (_from = 'ready_for_pickup' AND _to = 'searching_driver')
      OR (_from = 'searching_driver' AND _to = 'offered_to_driver')
      OR (_from = 'offered_to_driver' AND _to IN ('searching_driver','driver_accepted'))
      OR (_from = 'delivered' AND _to = 'completed')
    ELSE false END;
END; $$;

-- ============ 5) دور المستخدم بالنسبة للطلب ============
CREATE OR REPLACE FUNCTION public.order_actor(_user_id uuid, _order_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  SELECT customer_id, provider_id, driver_id INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND OR _user_id IS NULL THEN RETURN NULL; END IF;
  IF public.is_staff(_user_id) THEN RETURN 'staff'; END IF;
  IF o.customer_id = _user_id THEN RETURN 'customer'; END IF;
  IF public.owns_provider(_user_id, o.provider_id) THEN RETURN 'provider'; END IF;
  IF o.driver_id = _user_id THEN RETURN 'driver'; END IF;
  RETURN NULL;
END; $$;

-- ============ 6) المسار المركزي لتغيير الحالة ============
CREATE OR REPLACE FUNCTION public.change_order_status(
  _order_id uuid, _new_status order_status, _reason text DEFAULT NULL
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders;
  uid uuid := auth.uid();
  actor text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  actor := public.order_actor(uid, _order_id);
  IF actor IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF NOT public.is_allowed_transition(actor, o.status, _new_status) THEN
    RAISE EXCEPTION 'transition_not_allowed: % -> % (%)', o.status, _new_status, actor;
  END IF;

  UPDATE public.orders SET
    status = _new_status,
    cancel_reason = CASE WHEN _new_status = 'cancelled' THEN COALESCE(_reason, cancel_reason) ELSE cancel_reason END,
    completed_at = CASE WHEN _new_status = 'completed' THEN now() ELSE completed_at END
  WHERE id = _order_id
  RETURNING * INTO o;

  -- إلغاء أي عروض قائمة عند الإلغاء
  IF _new_status = 'cancelled' THEN
    UPDATE public.delivery_offers SET status = 'cancelled', responded_at = now()
    WHERE order_id = _order_id AND status = 'sent';
  END IF;

  RETURN o;
END; $$;

-- نسخة نظامية تُستدعى من الخادم الموثوق فقط (service_role)
CREATE OR REPLACE FUNCTION public.system_change_order_status(
  _order_id uuid, _new_status order_status
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT public.is_allowed_transition('system', o.status, _new_status) THEN
    RAISE EXCEPTION 'transition_not_allowed: % -> % (system)', o.status, _new_status;
  END IF;
  UPDATE public.orders SET status = _new_status,
    completed_at = CASE WHEN _new_status = 'completed' THEN now() ELSE completed_at END
  WHERE id = _order_id RETURNING * INTO o;
  RETURN o;
END; $$;

-- ============ 7) إنشاء الطلب بشكل آمن ============
CREATE OR REPLACE FUNCTION public.create_customer_order(
  _provider_id uuid,
  _items jsonb,
  _dropoff_text text,
  _dropoff_lat double precision DEFAULT NULL,
  _dropoff_lng double precision DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  p record;
  it record;
  prod record;
  subtotal numeric := 0;
  fee numeric;
  km double precision;
  o public.orders;
  n int := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;
  IF COALESCE(btrim(_dropoff_text), '') = '' AND (_dropoff_lat IS NULL OR _dropoff_lng IS NULL) THEN
    RAISE EXCEPTION 'missing_dropoff';
  END IF;

  SELECT id, city_id, address_text, lat, lng, status, is_open
    INTO p FROM public.providers WHERE id = _provider_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_not_found'; END IF;
  IF p.status <> 'approved' THEN RAISE EXCEPTION 'provider_not_approved'; END IF;
  IF NOT p.is_open THEN RAISE EXCEPTION 'provider_closed'; END IF;

  km := public.haversine_km(p.lat, p.lng, _dropoff_lat, _dropoff_lng);
  fee := public.compute_delivery_fee('restaurant', p.city_id, p.id, km);

  INSERT INTO public.orders (
    customer_id, provider_id, order_type, status, city_id,
    pickup_text, pickup_lat, pickup_lng,
    dropoff_text, dropoff_lat, dropoff_lng, notes,
    subtotal, delivery_fee, total
  ) VALUES (
    uid, p.id, 'restaurant', 'awaiting_provider', p.city_id,
    p.address_text, p.lat, p.lng,
    COALESCE(NULLIF(btrim(_dropoff_text), ''), 'موقع محدد على الخريطة'), _dropoff_lat, _dropoff_lng, _notes,
    0, fee, fee
  ) RETURNING * INTO o;

  FOR it IN
    SELECT (e->>'product_id')::uuid AS product_id,
           GREATEST(LEAST(COALESCE((e->>'quantity')::int, 0), 50), 0) AS quantity,
           NULLIF(btrim(COALESCE(e->>'notes','')), '') AS notes
    FROM jsonb_array_elements(_items) e
  LOOP
    IF it.quantity <= 0 THEN CONTINUE; END IF;
    SELECT id, name, price, provider_id, is_available, stock
      INTO prod FROM public.products WHERE id = it.product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found: %', it.product_id; END IF;
    IF prod.provider_id <> p.id THEN RAISE EXCEPTION 'product_provider_mismatch'; END IF;
    IF NOT prod.is_available THEN RAISE EXCEPTION 'product_unavailable: %', prod.name; END IF;
    IF prod.stock IS NOT NULL AND prod.stock < it.quantity THEN
      RAISE EXCEPTION 'product_out_of_stock: %', prod.name;
    END IF;

    INSERT INTO public.order_items (order_id, product_id, name, unit_price, quantity, notes)
    VALUES (o.id, prod.id, prod.name, prod.price, it.quantity, it.notes);

    subtotal := subtotal + (prod.price * it.quantity);
    n := n + 1;
  END LOOP;

  IF n = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;

  UPDATE public.orders SET subtotal = subtotal, total = subtotal + fee
  WHERE id = o.id RETURNING * INTO o;

  RETURN o;
END; $$;

-- ============ 8) العروض: انتهاء / قبول ذري / رفض ============
CREATE OR REPLACE FUNCTION public.expire_stale_offers(_order_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected int;
BEGIN
  WITH ex AS (
    UPDATE public.delivery_offers SET status = 'expired', responded_at = now()
    WHERE status = 'sent' AND expires_at < now()
      AND (_order_id IS NULL OR order_id = _order_id)
    RETURNING order_id
  )
  SELECT count(*) INTO affected FROM ex;

  UPDATE public.orders o SET status = 'searching_driver'
  WHERE o.status = 'offered_to_driver' AND o.driver_id IS NULL
    AND (_order_id IS NULL OR o.id = _order_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.delivery_offers f
      WHERE f.order_id = o.id AND f.status = 'sent' AND f.expires_at > now()
    );
  RETURN affected;
END; $$;

CREATE OR REPLACE FUNCTION public.accept_delivery_offer(_offer_id uuid)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  f public.delivery_offers;
  o public.orders;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT * INTO f FROM public.delivery_offers WHERE id = _offer_id FOR UPDATE;
  IF NOT FOUND OR f.driver_id <> uid THEN RAISE EXCEPTION 'offer_not_found'; END IF;
  IF f.status <> 'sent' THEN RAISE EXCEPTION 'offer_not_active'; END IF;
  IF f.expires_at < now() THEN
    UPDATE public.delivery_offers SET status = 'expired', responded_at = now() WHERE id = f.id;
    RAISE EXCEPTION 'offer_expired';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = f.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF o.driver_id IS NOT NULL THEN RAISE EXCEPTION 'order_already_assigned'; END IF;
  IF o.status NOT IN ('searching_driver','offered_to_driver') THEN
    RAISE EXCEPTION 'order_not_dispatchable';
  END IF;

  UPDATE public.delivery_offers SET status = 'accepted', responded_at = now() WHERE id = f.id;
  UPDATE public.delivery_offers SET status = 'cancelled', responded_at = now()
    WHERE order_id = o.id AND id <> f.id AND status = 'sent';

  UPDATE public.orders SET driver_id = uid, status = 'driver_accepted'
  WHERE id = o.id RETURNING * INTO o;

  INSERT INTO public.notifications (user_id, title, body, kind, order_id)
  VALUES (o.customer_id, 'تم تعيين مندوب', 'مندوب التوصيل بالطريق لاستلام طلبك', 'order', o.id);

  RETURN o;
END; $$;

CREATE OR REPLACE FUNCTION public.reject_delivery_offer(_offer_id uuid, _reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  f public.delivery_offers;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO f FROM public.delivery_offers WHERE id = _offer_id FOR UPDATE;
  IF NOT FOUND OR f.driver_id <> uid THEN RAISE EXCEPTION 'offer_not_found'; END IF;
  IF f.status <> 'sent' THEN RAISE EXCEPTION 'offer_not_active'; END IF;

  UPDATE public.delivery_offers
    SET status = CASE WHEN f.expires_at < now() THEN 'expired'::offer_status ELSE 'rejected'::offer_status END,
        rejection_reason = _reason, responded_at = now()
  WHERE id = f.id;

  UPDATE public.orders SET status = 'searching_driver'
  WHERE id = f.order_id AND driver_id IS NULL AND status IN ('offered_to_driver','searching_driver');

  RETURN f.order_id;
END; $$;

-- ============ 9) الإكمال التلقائي بعد التسليم ============
CREATE OR REPLACE FUNCTION public.auto_complete_delivered_orders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hrs numeric; affected int;
BEGIN
  SELECT COALESCE((value)::text::numeric, 12) INTO hrs FROM public.app_settings WHERE key = 'auto_complete_hours';
  hrs := COALESCE(hrs, 12);
  WITH done AS (
    UPDATE public.orders SET status = 'completed', completed_at = now()
    WHERE status = 'delivered' AND updated_at < now() - make_interval(hours => hrs::int)
    RETURNING id
  )
  SELECT count(*) INTO affected FROM done;
  RETURN affected;
END; $$;

-- ============ 10) الصلاحيات على الدوال ============
REVOKE ALL ON FUNCTION public.change_order_status(uuid, order_status, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_customer_order(uuid, jsonb, text, double precision, double precision, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_delivery_offer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_delivery_offer(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.system_change_order_status(uuid, order_status) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stale_offers(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_complete_delivered_orders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_actor(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.compute_delivery_fee(order_type, uuid, uuid, double precision) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.change_order_status(uuid, order_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_order(uuid, jsonb, text, double precision, double precision, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_delivery_offer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_delivery_offer(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_actor(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_delivery_fee(order_type, uuid, uuid, double precision) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.haversine_km(double precision, double precision, double precision, double precision) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.system_change_order_status(uuid, order_status) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_offers(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_complete_delivered_orders() TO service_role;

-- ============ 11) تشديد سياسات RLS ============
DROP POLICY IF EXISTS orders_update_involved ON public.orders;
DROP POLICY IF EXISTS orders_customer_insert ON public.orders;
DROP POLICY IF EXISTS items_insert ON public.order_items;
DROP POLICY IF EXISTS hist_insert ON public.order_status_history;
DROP POLICY IF EXISTS offers_driver_update ON public.delivery_offers;
DROP POLICY IF EXISTS offers_staff_insert ON public.delivery_offers;
DROP POLICY IF EXISTS notif_insert ON public.notifications;

REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_status_history FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.delivery_offers FROM authenticated;
REVOKE INSERT ON public.notifications FROM authenticated;

-- تتبّع موقع المندوب للطرف المعني بالطلب النشط فقط
DROP POLICY IF EXISTS wloc_track_order ON public.worker_locations;
CREATE POLICY wloc_track_order ON public.worker_locations
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.driver_id = worker_locations.user_id
    AND o.status IN ('driver_accepted','driver_heading_pickup','picked_up','on_the_way')
    AND (o.customer_id = auth.uid() OR public.owns_provider(auth.uid(), o.provider_id))
));

-- ============ 12) التحديث اللحظي ============
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.worker_locations REPLICA IDENTITY FULL;
ALTER TABLE public.delivery_offers REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.worker_locations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_offers;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;