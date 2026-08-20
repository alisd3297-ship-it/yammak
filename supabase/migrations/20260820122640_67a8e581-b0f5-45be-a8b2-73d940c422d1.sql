-- ============ ENUMS ============
CREATE TYPE public.trip_status AS ENUM (
  'requested','searching_driver','driver_assigned','driver_arriving',
  'driver_arrived','in_progress','completed','cancelled'
);
CREATE TYPE public.taxi_class AS ENUM ('economy','comfort','van');

-- ============ WORKER PROFILE (vehicle basics for taxi) ============
ALTER TABLE public.worker_profiles
  ADD COLUMN IF NOT EXISTS taxi_class public.taxi_class,
  ADD COLUMN IF NOT EXISTS taxi_seats integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS vehicle_make text,
  ADD COLUMN IF NOT EXISTS vehicle_model text,
  ADD COLUMN IF NOT EXISTS vehicle_color text,
  ADD COLUMN IF NOT EXISTS plate_number text;

-- ============ PRICING ============
ALTER TABLE public.pricing_rules ADD COLUMN IF NOT EXISTS taxi_class public.taxi_class;

INSERT INTO public.pricing_rules (name, order_type, city_id, taxi_class, base_fee, per_km_fee, min_fee, is_active)
SELECT 'تكسي بغداد - اقتصادي', 'taxi'::public.order_type, c.id, 'economy'::public.taxi_class, 2000, 500, 3000, true FROM public.cities c WHERE c.name = 'بغداد'
UNION ALL SELECT 'تكسي بغداد - مريح', 'taxi'::public.order_type, c.id, 'comfort'::public.taxi_class, 3000, 750, 5000, true FROM public.cities c WHERE c.name = 'بغداد'
UNION ALL SELECT 'تكسي بغداد - عائلي', 'taxi'::public.order_type, c.id, 'van'::public.taxi_class, 5000, 1000, 7000, true FROM public.cities c WHERE c.name = 'بغداد'
UNION ALL SELECT 'تكسي افتراضي - اقتصادي', 'taxi'::public.order_type, NULL::uuid, 'economy'::public.taxi_class, 2000, 500, 3000, true
UNION ALL SELECT 'تكسي افتراضي - مريح', 'taxi'::public.order_type, NULL::uuid, 'comfort'::public.taxi_class, 3000, 750, 5000, true
UNION ALL SELECT 'تكسي افتراضي - عائلي', 'taxi'::public.order_type, NULL::uuid, 'van'::public.taxi_class, 5000, 1000, 7000, true;

INSERT INTO public.app_settings (key, value)
VALUES ('taxi_offer_timeout_seconds', '90'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============ TRIPS ============
CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT ('T' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5))),
  customer_id uuid NOT NULL,
  driver_id uuid,
  city_id uuid REFERENCES public.cities(id),
  status public.trip_status NOT NULL DEFAULT 'requested',
  taxi_class public.taxi_class NOT NULL DEFAULT 'economy',
  passengers integer NOT NULL DEFAULT 1,
  pickup_text text NOT NULL,
  pickup_lat double precision,
  pickup_lng double precision,
  destination_text text NOT NULL,
  destination_lat double precision,
  destination_lng double precision,
  notes text,
  distance_km numeric NOT NULL DEFAULT 0,
  fare numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
GRANT SELECT ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.trip_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  status public.offer_status NOT NULL DEFAULT 'sent',
  distance_km numeric,
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  rejection_reason text
);
GRANT SELECT ON public.trip_offers TO authenticated;
GRANT ALL ON public.trip_offers TO service_role;
ALTER TABLE public.trip_offers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.trip_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  status public.trip_status NOT NULL,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trip_status_history TO authenticated;
GRANT ALL ON public.trip_status_history TO service_role;
ALTER TABLE public.trip_status_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.trip_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL UNIQUE REFERENCES public.trips(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  stars integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trip_ratings TO authenticated;
GRANT ALL ON public.trip_ratings TO service_role;
ALTER TABLE public.trip_ratings ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_trips_customer ON public.trips(customer_id, created_at DESC);
CREATE INDEX idx_trips_driver ON public.trips(driver_id, created_at DESC);
CREATE INDEX idx_trips_status ON public.trips(status);
CREATE INDEX idx_trip_offers_driver ON public.trip_offers(driver_id, status);
CREATE INDEX idx_trip_offers_trip ON public.trip_offers(trip_id, status);

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.can_see_trip(_user_id uuid, _trip_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = _trip_id AND (
      t.customer_id = _user_id
      OR t.driver_id = _user_id
      OR public.is_staff(_user_id)
      OR EXISTS (SELECT 1 FROM public.trip_offers f
                 WHERE f.trip_id = t.id AND f.driver_id = _user_id AND f.status = 'sent')
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.trip_actor(_user_id uuid, _trip_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  SELECT customer_id, driver_id INTO t FROM public.trips WHERE id = _trip_id;
  IF NOT FOUND OR _user_id IS NULL THEN RETURN NULL; END IF;
  IF public.is_staff(_user_id) THEN RETURN 'staff'; END IF;
  IF t.customer_id = _user_id THEN RETURN 'customer'; END IF;
  IF t.driver_id = _user_id THEN RETURN 'driver'; END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.is_allowed_trip_transition(_actor text, _from public.trip_status, _to public.trip_status)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF _from = _to THEN RETURN false; END IF;
  IF _to = 'cancelled' THEN
    RETURN CASE _actor
      WHEN 'customer' THEN _from IN ('requested','searching_driver','driver_assigned','driver_arriving','driver_arrived')
      WHEN 'driver'   THEN _from IN ('driver_assigned','driver_arriving','driver_arrived')
      WHEN 'staff'    THEN _from NOT IN ('completed','cancelled')
      ELSE false END;
  END IF;
  IF _from IN ('completed','cancelled') THEN RETURN false; END IF;
  IF _actor = 'staff' THEN RETURN true; END IF;
  RETURN CASE _actor
    WHEN 'driver' THEN
      (_from = 'driver_assigned' AND _to = 'driver_arriving')
      OR (_from = 'driver_arriving' AND _to = 'driver_arrived')
      OR (_from = 'driver_arrived' AND _to = 'in_progress')
      OR (_from = 'in_progress' AND _to = 'completed')
    WHEN 'system' THEN
      (_from = 'requested' AND _to = 'searching_driver')
      OR (_from = 'searching_driver' AND _to = 'driver_assigned')
    ELSE false END;
END; $$;

CREATE OR REPLACE FUNCTION public.taxi_class_rank(_c public.taxi_class)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _c WHEN 'economy' THEN 1 WHEN 'comfort' THEN 2 WHEN 'van' THEN 3 ELSE 1 END;
$$;

CREATE OR REPLACE FUNCTION public.compute_taxi_fare(_city_id uuid, _taxi_class public.taxi_class, _distance_km double precision)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; base numeric; perkm numeric; minfee numeric;
        km numeric := GREATEST(COALESCE(_distance_km, 0), 0); fare numeric;
BEGIN
  SELECT * INTO r FROM public.pricing_rules
   WHERE is_active AND order_type = 'taxi' AND provider_id IS NULL
     AND (taxi_class IS NULL OR taxi_class = _taxi_class)
     AND (city_id IS NULL OR city_id = _city_id)
   ORDER BY (taxi_class = _taxi_class) DESC NULLS LAST, (city_id = _city_id) DESC NULLS LAST
   LIMIT 1;
  IF FOUND THEN
    base := r.base_fee; perkm := r.per_km_fee; minfee := r.min_fee;
  ELSE
    base := 2000; perkm := 500; minfee := 3000;
  END IF;
  fare := base + (perkm * km);
  IF fare < minfee THEN fare := minfee; END IF;
  RETURN round(fare);
END; $$;

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.log_trip_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.trip_status_history (trip_id, status, changed_by) VALUES (NEW.id, NEW.status, auth.uid());
    IF NEW.status = 'in_progress' AND NEW.started_at IS NULL THEN NEW.started_at := now(); END IF;
    IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_trips_log_status BEFORE INSERT OR UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.log_trip_status();
CREATE TRIGGER trg_trips_touch BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ RLS POLICIES ============
CREATE POLICY trips_read ON public.trips FOR SELECT TO authenticated
  USING (public.can_see_trip(auth.uid(), id));
CREATE POLICY trip_offers_read ON public.trip_offers FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR public.is_staff(auth.uid())
         OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_offers.trip_id AND t.customer_id = auth.uid()));
CREATE POLICY trip_history_read ON public.trip_status_history FOR SELECT TO authenticated
  USING (public.can_see_trip(auth.uid(), trip_id));
CREATE POLICY trip_ratings_read ON public.trip_ratings FOR SELECT TO authenticated
  USING (rater_id = auth.uid() OR driver_id = auth.uid() OR public.is_staff(auth.uid()));

-- الراكب يتابع موقع سائقه المعيّن فقط أثناء الرحلة النشطة
CREATE POLICY wloc_track_trip ON public.worker_locations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.driver_id = worker_locations.user_id
      AND t.customer_id = auth.uid()
      AND t.status IN ('driver_assigned','driver_arriving','driver_arrived','in_progress')
  ));

-- الراكب يرى بيانات مركبة وتقييم سائقه المعيّن
CREATE POLICY worker_trip_passenger_read ON public.worker_profiles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.driver_id = worker_profiles.user_id
      AND t.customer_id = auth.uid()
      AND t.status IN ('driver_assigned','driver_arriving','driver_arrived','in_progress','completed')
  ));

-- طرفا الرحلة يريان الاسم/الهاتف للتواصل أثناء الرحلة النشطة
CREATE POLICY profiles_trip_counterpart_read ON public.profiles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.status IN ('driver_assigned','driver_arriving','driver_arrived','in_progress')
      AND ((t.driver_id = profiles.id AND t.customer_id = auth.uid())
        OR (t.customer_id = profiles.id AND t.driver_id = auth.uid()))
  ));

-- ============ RPCs ============
CREATE OR REPLACE FUNCTION public.quote_taxi_trip(
  _taxi_class public.taxi_class, _pickup_lat double precision, _pickup_lng double precision,
  _dest_lat double precision, _dest_lng double precision)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v_city uuid; km double precision; fare numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT city_id INTO v_city FROM public.profiles WHERE id = uid;
  IF v_city IS NULL THEN SELECT id INTO v_city FROM public.cities WHERE is_active ORDER BY sort_order LIMIT 1; END IF;
  km := COALESCE(public.haversine_km(_pickup_lat, _pickup_lng, _dest_lat, _dest_lng), 0);
  fare := public.compute_taxi_fare(v_city, _taxi_class, km);
  RETURN jsonb_build_object('km', km, 'fare', fare,
    'eta_minutes', GREATEST(5, ceil(km * 3)::int));
END; $$;

CREATE OR REPLACE FUNCTION public.create_taxi_trip(
  _taxi_class public.taxi_class, _pickup_text text, _pickup_lat double precision, _pickup_lng double precision,
  _destination_text text, _dest_lat double precision, _dest_lng double precision,
  _passengers integer DEFAULT 1, _notes text DEFAULT NULL)
RETURNS public.trips LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v_city uuid; km double precision; fare numeric; t public.trips;
        active_count int; pax int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND is_blocked) THEN RAISE EXCEPTION 'user_blocked'; END IF;
  IF _taxi_class IS NULL THEN RAISE EXCEPTION 'missing_class'; END IF;
  IF COALESCE(btrim(_pickup_text),'') = '' AND (_pickup_lat IS NULL OR _pickup_lng IS NULL) THEN
    RAISE EXCEPTION 'missing_pickup'; END IF;
  IF COALESCE(btrim(_destination_text),'') = '' AND (_dest_lat IS NULL OR _dest_lng IS NULL) THEN
    RAISE EXCEPTION 'missing_destination'; END IF;

  pax := COALESCE(_passengers, 1);
  IF pax < 1 OR pax > 6 THEN RAISE EXCEPTION 'invalid_passengers'; END IF;
  IF pax > 4 AND _taxi_class <> 'van' THEN RAISE EXCEPTION 'passengers_exceed_class'; END IF;

  SELECT count(*) INTO active_count FROM public.trips
   WHERE customer_id = uid AND status NOT IN ('completed','cancelled');
  IF active_count >= 2 THEN RAISE EXCEPTION 'too_many_active_trips'; END IF;

  SELECT city_id INTO v_city FROM public.profiles WHERE id = uid;
  IF v_city IS NULL THEN SELECT id INTO v_city FROM public.cities WHERE is_active ORDER BY sort_order LIMIT 1; END IF;

  km := COALESCE(public.haversine_km(_pickup_lat, _pickup_lng, _dest_lat, _dest_lng), 0);
  fare := public.compute_taxi_fare(v_city, _taxi_class, km);

  INSERT INTO public.trips (
    customer_id, city_id, status, taxi_class, passengers,
    pickup_text, pickup_lat, pickup_lng, destination_text, destination_lat, destination_lng,
    notes, distance_km, fare, payment_method
  ) VALUES (
    uid, v_city, 'searching_driver', _taxi_class, pax,
    COALESCE(NULLIF(btrim(COALESCE(_pickup_text,'')),''), 'موقع انطلاق على الخريطة'), _pickup_lat, _pickup_lng,
    COALESCE(NULLIF(btrim(COALESCE(_destination_text,'')),''), 'وجهة على الخريطة'), _dest_lat, _dest_lng,
    NULLIF(btrim(COALESCE(_notes,'')),''), round(km::numeric, 2), fare, 'cash'
  ) RETURNING * INTO t;

  RETURN t;
END; $$;

CREATE OR REPLACE FUNCTION public.change_trip_status(_trip_id uuid, _new_status public.trip_status, _reason text DEFAULT NULL)
RETURNS public.trips LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.trips; uid uuid := auth.uid(); actor text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO t FROM public.trips WHERE id = _trip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'trip_not_found'; END IF;

  actor := public.trip_actor(uid, _trip_id);
  IF actor IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.is_allowed_trip_transition(actor, t.status, _new_status) THEN
    RAISE EXCEPTION 'transition_not_allowed: % -> % (%)', t.status, _new_status, actor;
  END IF;

  UPDATE public.trips SET
    status = _new_status,
    cancel_reason = CASE WHEN _new_status = 'cancelled' THEN COALESCE(_reason, cancel_reason) ELSE cancel_reason END
  WHERE id = _trip_id RETURNING * INTO t;

  IF _new_status = 'cancelled' THEN
    UPDATE public.trip_offers SET status = 'cancelled', responded_at = now()
     WHERE trip_id = _trip_id AND status = 'sent';
  END IF;

  INSERT INTO public.notifications (user_id, title, body, kind)
  SELECT x.uid2, 'تحديث الرحلة', 'رحلتك #' || t.code || ' صارت: ' || _new_status::text, 'trip'
  FROM (SELECT t.customer_id AS uid2 UNION SELECT t.driver_id WHERE t.driver_id IS NOT NULL) x
  WHERE x.uid2 IS NOT NULL AND x.uid2 <> uid;

  RETURN t;
END; $$;

CREATE OR REPLACE FUNCTION public.system_change_trip_status(_trip_id uuid, _new_status public.trip_status)
RETURNS public.trips LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.trips;
BEGIN
  SELECT * INTO t FROM public.trips WHERE id = _trip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'trip_not_found'; END IF;
  IF NOT public.is_allowed_trip_transition('system', t.status, _new_status) THEN
    RAISE EXCEPTION 'transition_not_allowed: % -> % (system)', t.status, _new_status;
  END IF;
  UPDATE public.trips SET status = _new_status WHERE id = _trip_id RETURNING * INTO t;
  RETURN t;
END; $$;
REVOKE EXECUTE ON FUNCTION public.system_change_trip_status(uuid, public.trip_status) FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.accept_trip_offer(_offer_id uuid)
RETURNS public.trips LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); f public.trip_offers; t public.trips;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO f FROM public.trip_offers WHERE id = _offer_id FOR UPDATE;
  IF NOT FOUND OR f.driver_id <> uid THEN RAISE EXCEPTION 'offer_not_found'; END IF;
  IF f.status <> 'sent' THEN RAISE EXCEPTION 'offer_not_active'; END IF;
  IF f.expires_at < now() THEN
    UPDATE public.trip_offers SET status = 'expired', responded_at = now() WHERE id = f.id;
    RAISE EXCEPTION 'offer_expired';
  END IF;

  SELECT * INTO t FROM public.trips WHERE id = f.trip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'trip_not_found'; END IF;
  IF t.driver_id IS NOT NULL THEN RAISE EXCEPTION 'trip_already_assigned'; END IF;
  IF t.status <> 'searching_driver' THEN RAISE EXCEPTION 'trip_not_dispatchable'; END IF;

  UPDATE public.trip_offers SET status = 'accepted', responded_at = now() WHERE id = f.id;
  UPDATE public.trip_offers SET status = 'cancelled', responded_at = now()
   WHERE trip_id = t.id AND id <> f.id AND status = 'sent';

  UPDATE public.trips SET driver_id = uid, status = 'driver_assigned'
   WHERE id = t.id RETURNING * INTO t;

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (t.customer_id, 'تم قبول رحلتك', 'السائق بالطريق إلك، رحلة #' || t.code, 'trip');

  RETURN t;
END; $$;

CREATE OR REPLACE FUNCTION public.reject_trip_offer(_offer_id uuid, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); f public.trip_offers;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO f FROM public.trip_offers WHERE id = _offer_id FOR UPDATE;
  IF NOT FOUND OR f.driver_id <> uid THEN RAISE EXCEPTION 'offer_not_found'; END IF;
  IF f.status <> 'sent' THEN RAISE EXCEPTION 'offer_not_active'; END IF;

  UPDATE public.trip_offers
     SET status = CASE WHEN f.expires_at < now() THEN 'expired'::public.offer_status ELSE 'rejected'::public.offer_status END,
         rejection_reason = _reason, responded_at = now()
   WHERE id = f.id;
  RETURN f.trip_id;
END; $$;

CREATE OR REPLACE FUNCTION public.expire_stale_trip_offers(_trip_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected int;
BEGIN
  WITH ex AS (
    UPDATE public.trip_offers SET status = 'expired', responded_at = now()
     WHERE status = 'sent' AND expires_at < now() AND (_trip_id IS NULL OR trip_id = _trip_id)
    RETURNING trip_id
  ) SELECT count(*) INTO affected FROM ex;
  RETURN affected;
END; $$;

CREATE OR REPLACE FUNCTION public.rate_trip(_trip_id uuid, _stars integer, _comment text DEFAULT NULL)
RETURNS public.trip_ratings LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); t public.trips; rt public.trip_ratings;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _stars IS NULL OR _stars < 1 OR _stars > 5 THEN RAISE EXCEPTION 'invalid_stars'; END IF;
  SELECT * INTO t FROM public.trips WHERE id = _trip_id;
  IF NOT FOUND OR t.customer_id <> uid THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF t.status <> 'completed' THEN RAISE EXCEPTION 'trip_not_completed'; END IF;
  IF t.driver_id IS NULL THEN RAISE EXCEPTION 'no_driver'; END IF;
  IF EXISTS (SELECT 1 FROM public.trip_ratings WHERE trip_id = _trip_id) THEN RAISE EXCEPTION 'already_rated'; END IF;

  INSERT INTO public.trip_ratings (trip_id, rater_id, driver_id, stars, comment)
  VALUES (_trip_id, uid, t.driver_id, _stars, NULLIF(btrim(COALESCE(_comment,'')),''))
  RETURNING * INTO rt;

  UPDATE public.worker_profiles SET
    rating = ((rating * ratings_count) + _stars) / (ratings_count + 1),
    ratings_count = ratings_count + 1
  WHERE user_id = t.driver_id;

  RETURN rt;
END; $$;

-- ============ DRIVER ONBOARDING ============
CREATE OR REPLACE FUNCTION public.apply_as_driver(
  _worker_kind public.worker_kind, _city_id uuid DEFAULT NULL,
  _vehicle_make text DEFAULT NULL, _vehicle_model text DEFAULT NULL,
  _vehicle_color text DEFAULT NULL, _plate_number text DEFAULT NULL,
  _taxi_class public.taxi_class DEFAULT NULL, _taxi_seats integer DEFAULT 4,
  _vehicle_type public.vehicle_type DEFAULT NULL, _phone text DEFAULT NULL)
RETURNS public.worker_profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); w public.worker_profiles; seats int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _worker_kind IS NULL THEN RAISE EXCEPTION 'missing_kind'; END IF;
  IF _worker_kind = 'taxi' AND _taxi_class IS NULL THEN RAISE EXCEPTION 'missing_taxi_class'; END IF;
  IF EXISTS (SELECT 1 FROM public.worker_profiles WHERE user_id = uid AND is_approved) THEN
    RAISE EXCEPTION 'already_approved';
  END IF;
  seats := LEAST(GREATEST(COALESCE(_taxi_seats, 4), 1), 6);

  INSERT INTO public.worker_profiles (
    user_id, requested_kind, worker_kind, is_approved, is_available, city_id,
    vehicle_make, vehicle_model, vehicle_color, plate_number, taxi_class, taxi_seats, vehicle_type
  ) VALUES (
    uid, _worker_kind, NULL, false, false, _city_id,
    NULLIF(btrim(COALESCE(_vehicle_make,'')),''), NULLIF(btrim(COALESCE(_vehicle_model,'')),''),
    NULLIF(btrim(COALESCE(_vehicle_color,'')),''), NULLIF(btrim(COALESCE(_plate_number,'')),''),
    _taxi_class, seats, _vehicle_type
  )
  ON CONFLICT (user_id) DO UPDATE SET
    requested_kind = EXCLUDED.requested_kind,
    city_id = COALESCE(EXCLUDED.city_id, public.worker_profiles.city_id),
    vehicle_make = COALESCE(EXCLUDED.vehicle_make, public.worker_profiles.vehicle_make),
    vehicle_model = COALESCE(EXCLUDED.vehicle_model, public.worker_profiles.vehicle_model),
    vehicle_color = COALESCE(EXCLUDED.vehicle_color, public.worker_profiles.vehicle_color),
    plate_number = COALESCE(EXCLUDED.plate_number, public.worker_profiles.plate_number),
    taxi_class = COALESCE(EXCLUDED.taxi_class, public.worker_profiles.taxi_class),
    taxi_seats = EXCLUDED.taxi_seats,
    vehicle_type = COALESCE(EXCLUDED.vehicle_type, public.worker_profiles.vehicle_type),
    updated_at = now()
  RETURNING * INTO w;

  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'worker') ON CONFLICT DO NOTHING;
  IF _phone IS NOT NULL AND btrim(_phone) <> '' THEN
    UPDATE public.profiles SET phone = btrim(_phone) WHERE id = uid AND (phone IS NULL OR phone = '');
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
  VALUES (uid, 'driver_application', 'worker_profiles', uid, to_jsonb(w));

  RETURN w;
END; $$;

CREATE OR REPLACE FUNCTION public.set_worker_approval(_user_id uuid, _approve boolean, _reason text DEFAULT NULL)
RETURNS public.worker_profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); before_row public.worker_profiles; w public.worker_profiles;
BEGIN
  IF uid IS NULL OR NOT public.is_staff(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO before_row FROM public.worker_profiles WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'worker_not_found'; END IF;

  UPDATE public.worker_profiles SET
    is_approved = _approve,
    worker_kind = CASE WHEN _approve THEN COALESCE(before_row.requested_kind, before_row.worker_kind) ELSE before_row.worker_kind END,
    is_available = CASE WHEN _approve THEN is_available ELSE false END
  WHERE user_id = _user_id RETURNING * INTO w;

  IF NOT _approve THEN
    UPDATE public.worker_locations SET is_online = false WHERE user_id = _user_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, before_data, after_data)
  VALUES (uid, CASE WHEN _approve THEN 'worker_approved' ELSE 'worker_suspended' END,
          'worker_profiles', _user_id, to_jsonb(before_row), to_jsonb(w) || jsonb_build_object('reason', _reason));

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (_user_id, CASE WHEN _approve THEN 'تم اعتماد حسابك' ELSE 'تم تعليق حسابك' END,
          COALESCE(_reason, ''), 'worker');

  RETURN w;
END; $$;