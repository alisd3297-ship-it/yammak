-- 1) أسرار داخلية للخادم فقط
CREATE TABLE IF NOT EXISTS public.internal_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.internal_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.internal_secrets TO service_role;
ALTER TABLE public.internal_secrets ENABLE ROW LEVEL SECURITY;

INSERT INTO public.internal_secrets(name, value) VALUES
  ('maintenance_cron_secret', encode(gen_random_bytes(32), 'hex')),
  ('maintenance_url', 'https://project--729acaeb-a297-44ff-bcda-163988b47b73-dev.lovable.app/api/public/maintenance')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.call_maintenance_endpoint()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text; u text;
BEGIN
  SELECT value INTO s FROM public.internal_secrets WHERE name = 'maintenance_cron_secret';
  SELECT value INTO u FROM public.internal_secrets WHERE name = 'maintenance_url';
  IF s IS NULL OR u IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := u,
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', s),
    body := '{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 8000
  );
END; $$;
REVOKE ALL ON FUNCTION public.call_maintenance_endpoint() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.call_maintenance_endpoint() TO service_role;

SELECT cron.unschedule('yammak-dispatch-maintenance')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'yammak-dispatch-maintenance');

SELECT cron.schedule('yammak-dispatch-maintenance', '* * * * *', $$SELECT public.call_maintenance_endpoint();$$);

-- 2) إرسال عرض توصيل بشكل ذري
CREATE OR REPLACE FUNCTION public.try_offer_delivery(
  _order_id uuid, _driver_id uuid, _distance_km numeric, _timeout_seconds integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order record; v_max int; v_active int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_order_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(_driver_id::text, 1));

  SELECT id, status, driver_id INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_order.driver_id IS NOT NULL OR v_order.status IN ('cancelled','completed') THEN
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

  SELECT COALESCE(max_active_orders, 2) INTO v_max FROM public.worker_profiles
   WHERE user_id = _driver_id AND is_approved AND is_available;
  IF v_max IS NULL THEN RETURN false; END IF;

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

-- 3) إرسال عرض رحلة تاكسي بشكل ذري
CREATE OR REPLACE FUNCTION public.try_offer_trip(
  _trip_id uuid, _driver_id uuid, _distance_km numeric, _timeout_seconds integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trip record; v_active int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_trip_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(_driver_id::text, 1));

  SELECT id, status, driver_id INTO v_trip FROM public.trips WHERE id = _trip_id FOR UPDATE;
  IF NOT FOUND OR v_trip.driver_id IS NOT NULL OR v_trip.status IN ('cancelled','completed') THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.trip_offers
             WHERE trip_id = _trip_id AND status = 'sent' AND expires_at > now()) THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.trip_offers WHERE trip_id = _trip_id AND driver_id = _driver_id) THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.worker_profiles
                 WHERE user_id = _driver_id AND is_approved AND is_available) THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO v_active FROM public.trips
   WHERE driver_id = _driver_id
     AND status IN ('driver_assigned','driver_arriving','driver_arrived','in_progress');
  v_active := v_active + (SELECT count(*) FROM public.trip_offers
                           WHERE driver_id = _driver_id AND status = 'sent' AND expires_at > now());
  IF v_active >= 1 THEN RETURN false; END IF;

  INSERT INTO public.trip_offers(trip_id, driver_id, distance_km, expires_at)
  VALUES (_trip_id, _driver_id, _distance_km, now() + make_interval(secs => GREATEST(_timeout_seconds, 30)));
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.try_offer_trip(uuid, uuid, numeric, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_offer_trip(uuid, uuid, numeric, integer) TO service_role;