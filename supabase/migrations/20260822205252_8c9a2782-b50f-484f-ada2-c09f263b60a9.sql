
ALTER TABLE public.worker_profiles
  ADD COLUMN IF NOT EXISTS application_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;

DO $$ BEGIN
  ALTER TABLE public.worker_profiles
    ADD CONSTRAINT worker_application_status_chk
    CHECK (application_status IN ('pending','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.worker_profiles SET application_status = 'approved' WHERE is_approved AND application_status <> 'approved';

-- منع المستخدم من تغيير حالة طلبه بنفسه
CREATE OR REPLACE FUNCTION public.guard_worker_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_staff(auth.uid()) THEN RETURN NEW; END IF;
  IF auth.uid() IS DISTINCT FROM OLD.user_id THEN RETURN NEW; END IF;
  NEW.worker_kind := OLD.worker_kind;
  NEW.is_approved := OLD.is_approved;
  NEW.application_status := OLD.application_status;
  NEW.rejection_reason := OLD.rejection_reason;
  NEW.reviewed_at := OLD.reviewed_at;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.max_active_orders := OLD.max_active_orders;
  NEW.rating := OLD.rating;
  NEW.ratings_count := OLD.ratings_count;
  IF NOT OLD.is_approved THEN NEW.is_available := false; END IF;
  RETURN NEW;
END; $function$;

-- تقديم الطلب: لا يمنح صلاحية المندوب
CREATE OR REPLACE FUNCTION public.apply_as_driver(_worker_kind worker_kind, _city_id uuid DEFAULT NULL::uuid, _vehicle_make text DEFAULT NULL::text, _vehicle_model text DEFAULT NULL::text, _vehicle_color text DEFAULT NULL::text, _plate_number text DEFAULT NULL::text, _taxi_class taxi_class DEFAULT NULL::taxi_class, _taxi_seats integer DEFAULT 4, _vehicle_type vehicle_type DEFAULT NULL::vehicle_type, _phone text DEFAULT NULL::text)
RETURNS worker_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    vehicle_make, vehicle_model, vehicle_color, plate_number, taxi_class, taxi_seats, vehicle_type,
    application_status, rejection_reason
  ) VALUES (
    uid, _worker_kind, NULL, false, false, _city_id,
    NULLIF(btrim(COALESCE(_vehicle_make,'')),''), NULLIF(btrim(COALESCE(_vehicle_model,'')),''),
    NULLIF(btrim(COALESCE(_vehicle_color,'')),''), NULLIF(btrim(COALESCE(_plate_number,'')),''),
    _taxi_class, seats, _vehicle_type, 'pending', NULL
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
    application_status = 'pending',
    rejection_reason = NULL,
    updated_at = now()
  RETURNING * INTO w;

  IF _phone IS NOT NULL AND btrim(_phone) <> '' THEN
    UPDATE public.profiles SET phone = btrim(_phone) WHERE id = uid AND (phone IS NULL OR phone = '');
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
  VALUES (uid, 'driver_application', 'worker_profiles', uid, to_jsonb(w));

  RETURN w;
END; $function$;

-- قرار الإدارة: منح أو سحب صلاحية المندوب
CREATE OR REPLACE FUNCTION public.set_worker_approval(_user_id uuid, _approve boolean, _reason text DEFAULT NULL::text)
RETURNS worker_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); before_row public.worker_profiles; w public.worker_profiles;
BEGIN
  IF uid IS NULL OR NOT public.is_staff(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO before_row FROM public.worker_profiles WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'worker_not_found'; END IF;

  UPDATE public.worker_profiles SET
    is_approved = _approve,
    application_status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    rejection_reason = CASE WHEN _approve THEN NULL ELSE NULLIF(btrim(COALESCE(_reason,'')),'') END,
    reviewed_at = now(),
    reviewed_by = uid,
    worker_kind = CASE WHEN _approve THEN COALESCE(before_row.requested_kind, before_row.worker_kind) ELSE before_row.worker_kind END,
    is_available = CASE WHEN _approve THEN is_available ELSE false END
  WHERE user_id = _user_id RETURNING * INTO w;

  IF _approve THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'worker') ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'worker';
    UPDATE public.worker_locations SET is_online = false WHERE user_id = _user_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, before_data, after_data)
  VALUES (uid, CASE WHEN _approve THEN 'worker_approved' ELSE 'worker_rejected' END,
          'worker_profiles', _user_id, to_jsonb(before_row), to_jsonb(w) || jsonb_build_object('reason', _reason));

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (_user_id,
          CASE WHEN _approve THEN 'تم اعتماد حسابك كمندوب' ELSE 'تم رفض طلب الانضمام كمندوب' END,
          COALESCE(_reason, ''), 'worker');

  RETURN w;
END; $function$;

-- سحب صلاحية العامل من الحسابات غير المعتمدة (طلبات قيد المراجعة قديمة)
DELETE FROM public.user_roles r
WHERE r.role = 'worker'
  AND EXISTS (SELECT 1 FROM public.worker_profiles w WHERE w.user_id = r.user_id AND NOT w.is_approved);

REVOKE ALL ON FUNCTION public.apply_as_driver(worker_kind, uuid, text, text, text, text, taxi_class, integer, vehicle_type, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_as_driver(worker_kind, uuid, text, text, text, text, taxi_class, integer, vehicle_type, text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_worker_approval(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_worker_approval(uuid, boolean, text) TO authenticated;
