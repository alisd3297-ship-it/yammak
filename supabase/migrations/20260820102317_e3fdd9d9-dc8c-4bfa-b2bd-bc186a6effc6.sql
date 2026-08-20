-- 1) قاعدة تسعير لطلب المندوب المستقل
INSERT INTO public.pricing_rules (name, order_type, city_id, base_fee, per_km_fee, min_fee, is_active)
SELECT 'توصيل مندوب مستقل - بغداد', 'courier'::public.order_type, c.id, 3000, 750, 3000, true
FROM public.cities c WHERE c.name = 'بغداد'
AND NOT EXISTS (SELECT 1 FROM public.pricing_rules p WHERE p.order_type = 'courier' AND p.city_id = c.id);

INSERT INTO public.pricing_rules (name, order_type, city_id, base_fee, per_km_fee, min_fee, is_active)
SELECT 'توصيل مندوب مستقل - افتراضي', 'courier'::public.order_type, NULL, 3000, 750, 3000, true
WHERE NOT EXISTS (SELECT 1 FROM public.pricing_rules p WHERE p.order_type = 'courier' AND p.city_id IS NULL);

-- 2) قواعد الانتقال حسب نوع الطلب
CREATE OR REPLACE FUNCTION public.is_allowed_transition(
  _actor text,
  _from public.order_status,
  _to public.order_status,
  _order_type public.order_type
) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF _order_type NOT IN ('courier'::public.order_type, 'special_delivery'::public.order_type) THEN
    RETURN public.is_allowed_transition(_actor, _from, _to);
  END IF;

  IF _from = _to THEN RETURN false; END IF;

  IF _to = 'cancelled' THEN
    RETURN CASE _actor
      WHEN 'customer' THEN _from IN ('new','searching_driver','offered_to_driver','driver_accepted')
      WHEN 'driver'   THEN false
      WHEN 'staff'    THEN _from NOT IN ('completed','cancelled')
      ELSE false END;
  END IF;

  IF _from IN ('completed','cancelled') THEN RETURN false; END IF;

  IF _actor = 'staff' THEN RETURN true; END IF;

  RETURN CASE _actor
    WHEN 'driver' THEN
      (_from = 'driver_accepted' AND _to = 'driver_heading_pickup')
      OR (_from = 'driver_heading_pickup' AND _to = 'picked_up')
      OR (_from = 'picked_up' AND _to = 'on_the_way')
      OR (_from = 'on_the_way' AND _to = 'delivered')
    WHEN 'customer' THEN
      (_from = 'delivered' AND _to = 'completed')
    WHEN 'system' THEN
      (_from = 'new' AND _to = 'searching_driver')
      OR (_from = 'searching_driver' AND _to = 'offered_to_driver')
      OR (_from = 'offered_to_driver' AND _to IN ('searching_driver','driver_accepted'))
      OR (_from = 'delivered' AND _to = 'completed')
    ELSE false END;
END;
$$;

-- 3) تمرير نوع الطلب داخل المسار المركزي لتغيير الحالة
CREATE OR REPLACE FUNCTION public.change_order_status(
  _order_id uuid,
  _new_status public.order_status,
  _reason text DEFAULT NULL
) RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF NOT public.is_allowed_transition(actor, o.status, _new_status, o.order_type) THEN
    RAISE EXCEPTION 'transition_not_allowed: % -> % (%)', o.status, _new_status, actor;
  END IF;

  UPDATE public.orders SET
    status = _new_status,
    cancel_reason = CASE WHEN _new_status = 'cancelled' THEN COALESCE(_reason, cancel_reason) ELSE cancel_reason END,
    completed_at = CASE WHEN _new_status = 'completed' THEN now() ELSE completed_at END
  WHERE id = _order_id
  RETURNING * INTO o;

  IF _new_status = 'cancelled' THEN
    UPDATE public.delivery_offers SET status = 'cancelled', responded_at = now()
    WHERE order_id = _order_id AND status = 'sent';
  END IF;

  RETURN o;
END;
$$;

-- 4) تغيير الحالة من النظام يحترم نوع الطلب أيضاً
CREATE OR REPLACE FUNCTION public.system_change_order_status(
  _order_id uuid,
  _new_status public.order_status
) RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT public.is_allowed_transition('system', o.status, _new_status, o.order_type) THEN
    RAISE EXCEPTION 'transition_not_allowed: % -> % (system)', o.status, _new_status;
  END IF;
  UPDATE public.orders SET
    status = _new_status,
    completed_at = CASE WHEN _new_status = 'completed' THEN now() ELSE completed_at END
  WHERE id = _order_id RETURNING * INTO o;
  RETURN o;
END;
$$;

-- 5) إنشاء طلب مندوب مستقل بتسعير من الخادم فقط
CREATE OR REPLACE FUNCTION public.create_courier_order(
  _pickup_text text,
  _dropoff_text text,
  _pickup_lat double precision DEFAULT NULL,
  _pickup_lng double precision DEFAULT NULL,
  _dropoff_lat double precision DEFAULT NULL,
  _dropoff_lng double precision DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_city uuid;
  km double precision;
  fee numeric;
  o public.orders;
  active_count int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND is_blocked) THEN
    RAISE EXCEPTION 'user_blocked';
  END IF;
  IF COALESCE(btrim(_pickup_text), '') = '' AND (_pickup_lat IS NULL OR _pickup_lng IS NULL) THEN
    RAISE EXCEPTION 'missing_pickup';
  END IF;
  IF COALESCE(btrim(_dropoff_text), '') = '' AND (_dropoff_lat IS NULL OR _dropoff_lng IS NULL) THEN
    RAISE EXCEPTION 'missing_dropoff';
  END IF;

  SELECT count(*) INTO active_count FROM public.orders
   WHERE customer_id = uid AND order_type = 'courier'
     AND status NOT IN ('completed','cancelled');
  IF active_count >= 3 THEN RAISE EXCEPTION 'too_many_active_courier_orders'; END IF;

  SELECT city_id INTO v_city FROM public.profiles WHERE id = uid;
  IF v_city IS NULL THEN
    SELECT id INTO v_city FROM public.cities WHERE is_active ORDER BY sort_order LIMIT 1;
  END IF;

  km := public.haversine_km(_pickup_lat, _pickup_lng, _dropoff_lat, _dropoff_lng);
  fee := public.compute_delivery_fee('courier'::public.order_type, v_city, NULL, km);

  INSERT INTO public.orders (
    customer_id, provider_id, order_type, status, city_id,
    pickup_text, pickup_lat, pickup_lng,
    dropoff_text, dropoff_lat, dropoff_lng, notes,
    subtotal, delivery_fee, total, payment_method
  ) VALUES (
    uid, NULL, 'courier'::public.order_type, 'searching_driver'::public.order_status, v_city,
    COALESCE(NULLIF(btrim(_pickup_text), ''), 'موقع استلام محدد على الخريطة'), _pickup_lat, _pickup_lng,
    COALESCE(NULLIF(btrim(_dropoff_text), ''), 'موقع تسليم محدد على الخريطة'), _dropoff_lat, _dropoff_lng,
    NULLIF(btrim(COALESCE(_notes, '')), ''),
    0, fee, fee, 'cash'
  ) RETURNING * INTO o;

  RETURN o;
END;
$$;

REVOKE ALL ON FUNCTION public.create_courier_order(text, text, double precision, double precision, double precision, double precision, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_courier_order(text, text, double precision, double precision, double precision, double precision, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_allowed_transition(text, public.order_status, public.order_status, public.order_type) TO authenticated, service_role;