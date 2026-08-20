-- 1) نوع المركبة
DO $$ BEGIN
  CREATE TYPE public.vehicle_type AS ENUM ('bike','car','pickup','small_truck');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) أعمدة الطلب الجديدة
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vehicle_type public.vehicle_type,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cargo_description text,
  ADD COLUMN IF NOT EXISTS cargo_weight_kg numeric;

ALTER TABLE public.worker_profiles
  ADD COLUMN IF NOT EXISTS vehicle_type public.vehicle_type;

ALTER TABLE public.pricing_rules
  ADD COLUMN IF NOT EXISTS vehicle_type public.vehicle_type;

-- 3) جدول نقاط التسليم
CREATE TABLE IF NOT EXISTS public.order_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  position integer NOT NULL,
  address_text text NOT NULL,
  lat double precision,
  lng double precision,
  recipient_name text,
  recipient_phone text,
  notes text,
  is_delivered boolean NOT NULL DEFAULT false,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, position)
);

GRANT SELECT ON public.order_stops TO authenticated;
GRANT ALL ON public.order_stops TO service_role;

ALTER TABLE public.order_stops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order stops visible to order parties" ON public.order_stops;
CREATE POLICY "order stops visible to order parties"
ON public.order_stops FOR SELECT TO authenticated
USING (public.can_see_order(auth.uid(), order_id));

CREATE INDEX IF NOT EXISTS idx_order_stops_order ON public.order_stops(order_id, position);

-- 4) تسعير يراعي نوع المركبة
CREATE OR REPLACE FUNCTION public.compute_delivery_fee_v(
  _order_type public.order_type,
  _city_id uuid,
  _vehicle_type public.vehicle_type,
  _distance_km double precision
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  r record; fb jsonb;
  base numeric; perkm numeric; minfee numeric;
  km numeric := GREATEST(COALESCE(_distance_km, 0), 0);
  fee numeric;
BEGIN
  SELECT * INTO r FROM public.pricing_rules
  WHERE is_active AND order_type = _order_type
    AND provider_id IS NULL
    AND (vehicle_type IS NULL OR vehicle_type = _vehicle_type)
    AND (city_id IS NULL OR city_id = _city_id)
  ORDER BY (vehicle_type = _vehicle_type) DESC NULLS LAST,
           (city_id = _city_id) DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    base := r.base_fee; perkm := r.per_km_fee; minfee := r.min_fee;
  ELSE
    SELECT value INTO fb FROM public.app_settings WHERE key = 'delivery_fee_fallback';
    base   := COALESCE((fb->>'base_fee')::numeric, 3000);
    perkm  := COALESCE((fb->>'per_km_fee')::numeric, 750);
    minfee := COALESCE((fb->>'min_fee')::numeric, 3000);
  END IF;

  fee := base + (perkm * km);
  IF fee < minfee THEN fee := minfee; END IF;
  RETURN round(fee);
END; $$;

-- 5) قواعد تسعير التوصيل الخاص (بغداد + افتراضي) لكل نوع مركبة
INSERT INTO public.pricing_rules (name, order_type, city_id, provider_id, vehicle_type, base_fee, per_km_fee, min_fee, is_active)
SELECT v.label, 'special_delivery'::public.order_type, c.id, NULL, v.vt, v.base, v.perkm, v.minf, true
FROM (VALUES
  ('توصيل خاص - دراجة', 'bike'::public.vehicle_type, 3000, 750, 3000),
  ('توصيل خاص - سيارة', 'car'::public.vehicle_type, 5000, 1000, 5000),
  ('توصيل خاص - بيك أب', 'pickup'::public.vehicle_type, 10000, 1500, 10000),
  ('توصيل خاص - شاحنة صغيرة', 'small_truck'::public.vehicle_type, 20000, 2500, 20000)
) AS v(label, vt, base, perkm, minf)
CROSS JOIN (SELECT id FROM public.cities WHERE name ILIKE '%بغداد%' LIMIT 1) c
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricing_rules p
  WHERE p.order_type = 'special_delivery' AND p.vehicle_type = v.vt AND p.city_id = c.id
);

INSERT INTO public.pricing_rules (name, order_type, city_id, provider_id, vehicle_type, base_fee, per_km_fee, min_fee, is_active)
SELECT v.label, 'special_delivery'::public.order_type, NULL, NULL, v.vt, v.base, v.perkm, v.minf, true
FROM (VALUES
  ('توصيل خاص افتراضي - دراجة', 'bike'::public.vehicle_type, 3000, 750, 3000),
  ('توصيل خاص افتراضي - سيارة', 'car'::public.vehicle_type, 5000, 1000, 5000),
  ('توصيل خاص افتراضي - بيك أب', 'pickup'::public.vehicle_type, 10000, 1500, 10000),
  ('توصيل خاص افتراضي - شاحنة صغيرة', 'small_truck'::public.vehicle_type, 20000, 2500, 20000)
) AS v(label, vt, base, perkm, minf)
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricing_rules p
  WHERE p.order_type = 'special_delivery' AND p.vehicle_type = v.vt AND p.city_id IS NULL
);

-- 6) حساب المسافة الكلية عبر نقاط مرتبة
CREATE OR REPLACE FUNCTION public.special_delivery_distance(
  _pickup_lat double precision,
  _pickup_lng double precision,
  _stops jsonb
) RETURNS double precision
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $$
DECLARE
  total double precision := 0;
  cur_lat double precision := _pickup_lat;
  cur_lng double precision := _pickup_lng;
  s jsonb; leg double precision;
BEGIN
  IF _stops IS NULL OR jsonb_typeof(_stops) <> 'array' THEN RETURN 0; END IF;
  FOR s IN SELECT jsonb_array_elements(_stops) LOOP
    leg := public.haversine_km(cur_lat, cur_lng, (s->>'lat')::double precision, (s->>'lng')::double precision);
    IF leg IS NOT NULL THEN
      total := total + leg;
      cur_lat := (s->>'lat')::double precision;
      cur_lng := (s->>'lng')::double precision;
    END IF;
  END LOOP;
  RETURN total;
END; $$;

-- 7) تسعير تقديري
CREATE OR REPLACE FUNCTION public.quote_special_delivery(
  _vehicle_type public.vehicle_type,
  _pickup_lat double precision,
  _pickup_lng double precision,
  _stops jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE uid uuid := auth.uid(); v_city uuid; km double precision; fee numeric; stops_n int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  stops_n := COALESCE(jsonb_array_length(COALESCE(_stops, '[]'::jsonb)), 0);

  SELECT city_id INTO v_city FROM public.profiles WHERE id = uid;
  IF v_city IS NULL THEN
    SELECT id INTO v_city FROM public.cities WHERE is_active ORDER BY sort_order LIMIT 1;
  END IF;

  km := public.special_delivery_distance(_pickup_lat, _pickup_lng, _stops);
  fee := public.compute_delivery_fee_v('special_delivery'::public.order_type, v_city, _vehicle_type, km);
  -- رسوم إضافية لكل نقطة تسليم بعد الأولى: 25% من الأجرة الأساسية للنقطة
  IF stops_n > 1 THEN
    fee := round(fee * (1 + (0.25 * (stops_n - 1))));
  END IF;

  RETURN jsonb_build_object('km', COALESCE(km,0), 'fee', fee, 'stops', stops_n);
END; $$;

-- 8) إنشاء طلب التوصيل الخاص
CREATE OR REPLACE FUNCTION public.create_special_delivery_order(
  _vehicle_type public.vehicle_type,
  _pickup_text text,
  _pickup_lat double precision,
  _pickup_lng double precision,
  _stops jsonb,
  _cargo_description text DEFAULT NULL,
  _cargo_weight_kg numeric DEFAULT NULL,
  _scheduled_at timestamptz DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  v_city uuid; km double precision; fee numeric; o public.orders;
  stops_n int; active_count int; s jsonb; i int := 0;
  last_text text; last_lat double precision; last_lng double precision;
  init_status public.order_status;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND is_blocked) THEN
    RAISE EXCEPTION 'user_blocked';
  END IF;
  IF _vehicle_type IS NULL THEN RAISE EXCEPTION 'missing_vehicle_type'; END IF;
  IF COALESCE(btrim(_pickup_text), '') = '' AND (_pickup_lat IS NULL OR _pickup_lng IS NULL) THEN
    RAISE EXCEPTION 'missing_pickup';
  END IF;

  stops_n := COALESCE(jsonb_array_length(COALESCE(_stops, '[]'::jsonb)), 0);
  IF stops_n < 1 THEN RAISE EXCEPTION 'missing_stops'; END IF;
  IF stops_n > 5 THEN RAISE EXCEPTION 'too_many_stops'; END IF;

  IF _scheduled_at IS NOT NULL AND _scheduled_at < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'invalid_schedule';
  END IF;
  IF _cargo_weight_kg IS NOT NULL AND (_cargo_weight_kg < 0 OR _cargo_weight_kg > 5000) THEN
    RAISE EXCEPTION 'invalid_weight';
  END IF;

  SELECT count(*) INTO active_count FROM public.orders
   WHERE customer_id = uid AND order_type = 'special_delivery'
     AND status NOT IN ('completed','cancelled');
  IF active_count >= 3 THEN RAISE EXCEPTION 'too_many_active_special_orders'; END IF;

  SELECT city_id INTO v_city FROM public.profiles WHERE id = uid;
  IF v_city IS NULL THEN
    SELECT id INTO v_city FROM public.cities WHERE is_active ORDER BY sort_order LIMIT 1;
  END IF;

  km := public.special_delivery_distance(_pickup_lat, _pickup_lng, _stops);
  fee := public.compute_delivery_fee_v('special_delivery'::public.order_type, v_city, _vehicle_type, km);
  IF stops_n > 1 THEN
    fee := round(fee * (1 + (0.25 * (stops_n - 1))));
  END IF;

  SELECT COALESCE(NULLIF(btrim(COALESCE(e->>'address_text','')),''), 'نقطة تسليم على الخريطة'),
         (e->>'lat')::double precision, (e->>'lng')::double precision
    INTO last_text, last_lat, last_lng
  FROM jsonb_array_elements(_stops) WITH ORDINALITY AS t(e, ord)
  ORDER BY ord DESC LIMIT 1;

  init_status := CASE
    WHEN _scheduled_at IS NOT NULL AND _scheduled_at > now() + interval '2 minutes'
      THEN 'new'::public.order_status
    ELSE 'searching_driver'::public.order_status END;

  INSERT INTO public.orders (
    customer_id, provider_id, order_type, status, city_id,
    pickup_text, pickup_lat, pickup_lng,
    dropoff_text, dropoff_lat, dropoff_lng, notes,
    subtotal, delivery_fee, total, payment_method,
    vehicle_type, scheduled_at, cargo_description, cargo_weight_kg
  ) VALUES (
    uid, NULL, 'special_delivery'::public.order_type, init_status, v_city,
    COALESCE(NULLIF(btrim(COALESCE(_pickup_text,'')), ''), 'موقع استلام محدد على الخريطة'), _pickup_lat, _pickup_lng,
    last_text, last_lat, last_lng,
    NULLIF(btrim(COALESCE(_notes, '')), ''),
    0, fee, fee, 'cash',
    _vehicle_type, _scheduled_at,
    NULLIF(btrim(COALESCE(_cargo_description,'')),''), _cargo_weight_kg
  ) RETURNING * INTO o;

  FOR s IN SELECT jsonb_array_elements(_stops) LOOP
    i := i + 1;
    INSERT INTO public.order_stops (order_id, position, address_text, lat, lng, recipient_name, recipient_phone, notes)
    VALUES (
      o.id, i,
      COALESCE(NULLIF(btrim(COALESCE(s->>'address_text','')),''), 'نقطة تسليم على الخريطة'),
      (s->>'lat')::double precision, (s->>'lng')::double precision,
      NULLIF(btrim(COALESCE(s->>'recipient_name','')),''),
      NULLIF(btrim(COALESCE(s->>'recipient_phone','')),''),
      NULLIF(btrim(COALESCE(s->>'notes','')),'')
    );
  END LOOP;

  RETURN o;
END; $$;

-- 9) تقدّم نقاط التسليم (المندوب المعيّن أو الإدارة فقط، بالترتيب)
CREATE OR REPLACE FUNCTION public.complete_order_stop(_stop_id uuid)
RETURNS public.order_stops
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE uid uuid := auth.uid(); st public.order_stops; o public.orders; pending_before int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO st FROM public.order_stops WHERE id = _stop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stop_not_found'; END IF;

  SELECT * INTO o FROM public.orders WHERE id = st.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT (o.driver_id = uid OR public.is_staff(uid)) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF o.status NOT IN ('picked_up','on_the_way') THEN RAISE EXCEPTION 'order_not_in_delivery'; END IF;
  IF st.is_delivered THEN RAISE EXCEPTION 'stop_already_delivered'; END IF;

  SELECT count(*) INTO pending_before FROM public.order_stops
   WHERE order_id = o.id AND NOT is_delivered AND position < st.position;
  IF pending_before > 0 THEN RAISE EXCEPTION 'stops_out_of_order'; END IF;

  UPDATE public.order_stops SET is_delivered = true, delivered_at = now()
   WHERE id = st.id RETURNING * INTO st;

  INSERT INTO public.notifications (user_id, title, body, kind, order_id)
  VALUES (o.customer_id, 'تم تسليم نقطة',
          'تم تسليم النقطة رقم ' || st.position || ' في طلبك #' || o.code, 'order', o.id);

  RETURN st;
END; $$;

GRANT EXECUTE ON FUNCTION public.quote_special_delivery(public.vehicle_type, double precision, double precision, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_special_delivery_order(public.vehicle_type, text, double precision, double precision, jsonb, text, numeric, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_order_stop(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_delivery_fee_v(public.order_type, uuid, public.vehicle_type, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.special_delivery_distance(double precision, double precision, jsonb) TO authenticated;