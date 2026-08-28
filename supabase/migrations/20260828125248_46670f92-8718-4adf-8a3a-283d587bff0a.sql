CREATE OR REPLACE FUNCTION public.try_offer_delivery(
  _order_id uuid, _driver_id uuid, _distance_km numeric, _timeout_seconds integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order record; v_max int; v_active int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_order_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(_driver_id::text, 1));

  SELECT id, status, driver_id, fulfillment INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_order.driver_id IS NOT NULL OR v_order.status IN ('cancelled','completed') THEN
    RETURN false;
  END IF;

  -- طلبات السفري/الصالة لا تُسند لمندوب
  IF v_order.fulfillment IS NOT NULL AND v_order.fulfillment <> 'delivery' THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.delivery_offers
             WHERE order_id = _order_id AND status = 'sent' AND expires_at > now()) THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.delivery_offers
             WHERE order_id = _order_id AND driver_id = _driver_id) THEN
    RETURN false;
  END IF;

  -- الأهلية الموحّدة: حساب توصيل معتمد ومتاح. نوع المركبة لا يستبعد المندوب.
  SELECT COALESCE(max_active_orders, 2) INTO v_max FROM public.worker_profiles
   WHERE user_id = _driver_id
     AND worker_kind = 'delivery'
     AND is_approved
     AND is_available;
  IF v_max IS NULL THEN RETURN false; END IF;

  -- متصل بموقع حديث (ضمن 40 دقيقة، مطابق لنافذة الاحتياط في الخادم)
  IF NOT EXISTS (
    SELECT 1 FROM public.worker_locations
     WHERE user_id = _driver_id AND is_online AND updated_at > now() - interval '40 minutes'
  ) THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO v_active FROM public.orders
   WHERE driver_id = _driver_id
     AND status IN ('driver_accepted','driver_heading_pickup','picked_up','on_the_way');
  v_active := v_active + (SELECT count(*) FROM public.delivery_offers
                           WHERE driver_id = _driver_id AND status = 'sent' AND expires_at > now());
  IF v_active >= v_max THEN RETURN false; END IF;

  INSERT INTO public.delivery_offers(order_id, driver_id, distance_km, expires_at)
  VALUES (_order_id, _driver_id, _distance_km, now() + make_interval(secs => GREATEST(_timeout_seconds, 30)));
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.try_offer_delivery(uuid, uuid, numeric, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_offer_delivery(uuid, uuid, numeric, integer) TO service_role;