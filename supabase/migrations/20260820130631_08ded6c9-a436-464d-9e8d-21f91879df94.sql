-- 1) profiles.phone_verified_at
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin(auth.uid()) THEN RETURN NEW; END IF;
  -- only the backend (service role / SECURITY DEFINER otp functions) may set verification
  IF NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at THEN
    NEW.phone_verified_at := OLD.phone_verified_at;
  END IF;
  -- changing the phone number invalidates verification
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.phone_verified_at := NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_profiles_guard_self_update ON public.profiles;
CREATE TRIGGER trg_profiles_guard_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_update();

-- 2) phone verification challenges (hash only, never plaintext)
CREATE TABLE IF NOT EXISTS public.phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code_hash text NOT NULL,
  salt text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  send_count integer NOT NULL DEFAULT 1,
  channel text NOT NULL DEFAULT 'sms',
  delivered boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_user ON public.phone_verifications(user_id, created_at DESC);

-- backend-only table: no grants to anon/authenticated
GRANT ALL ON public.phone_verifications TO service_role;
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff can audit phone verifications"
  ON public.phone_verifications FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_phone_verifications_touch ON public.phone_verifications;
CREATE TRIGGER trg_phone_verifications_touch
BEFORE UPDATE ON public.phone_verifications
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) settings
INSERT INTO public.app_settings (key, value)
VALUES ('otp', '{"require_for_order_completion": false, "require_for_service_completion": false, "code_ttl_seconds": 300, "resend_cooldown_seconds": 60, "max_sends_per_hour": 5, "max_attempts": 5}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.otp_flag(_flag text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((value -> _flag)::boolean, false) FROM public.app_settings WHERE key = 'otp';
$$;

CREATE OR REPLACE FUNCTION public.is_phone_verified(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND phone_verified_at IS NOT NULL);
$$;

-- 4) issue challenge (backend only)
CREATE OR REPLACE FUNCTION public.otp_request(_user_id uuid, _phone text, _code_hash text, _salt text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg jsonb;
  ttl int; cooldown int; max_sends int; max_att int;
  last_row public.phone_verifications;
  sends_last_hour int;
  v public.phone_verifications;
BEGIN
  IF _user_id IS NULL OR _phone IS NULL OR length(btrim(_phone)) < 8 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;
  SELECT value INTO cfg FROM public.app_settings WHERE key = 'otp';
  ttl := COALESCE((cfg->>'code_ttl_seconds')::int, 300);
  cooldown := COALESCE((cfg->>'resend_cooldown_seconds')::int, 60);
  max_sends := COALESCE((cfg->>'max_sends_per_hour')::int, 5);
  max_att := COALESCE((cfg->>'max_attempts')::int, 5);

  SELECT * INTO last_row FROM public.phone_verifications
   WHERE user_id = _user_id ORDER BY created_at DESC LIMIT 1;

  IF last_row.id IS NOT NULL AND last_row.created_at > now() - make_interval(secs => cooldown) THEN
    RAISE EXCEPTION 'otp_cooldown: %', GREATEST(1, cooldown - EXTRACT(EPOCH FROM (now() - last_row.created_at))::int);
  END IF;

  SELECT count(*) INTO sends_last_hour FROM public.phone_verifications
   WHERE user_id = _user_id AND created_at > now() - interval '1 hour';
  IF sends_last_hour >= max_sends THEN
    INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
    VALUES (_user_id, 'otp_rate_limited', 'phone_verification', _user_id, jsonb_build_object('sends_last_hour', sends_last_hour));
    RAISE EXCEPTION 'otp_rate_limited';
  END IF;

  -- invalidate previous open challenges
  UPDATE public.phone_verifications SET consumed_at = now()
   WHERE user_id = _user_id AND consumed_at IS NULL;

  INSERT INTO public.phone_verifications (user_id, phone, code_hash, salt, max_attempts, send_count, expires_at)
  VALUES (_user_id, btrim(_phone), _code_hash, _salt, max_att, sends_last_hour + 1, now() + make_interval(secs => ttl))
  RETURNING * INTO v;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
  VALUES (_user_id, 'otp_requested', 'phone_verification', v.id, jsonb_build_object('phone_suffix', right(btrim(_phone), 4)));

  RETURN jsonb_build_object('id', v.id, 'expires_at', v.expires_at, 'max_attempts', v.max_attempts, 'cooldown_seconds', cooldown);
END; $$;

-- 5) verify (backend only)
CREATE OR REPLACE FUNCTION public.otp_verify(_user_id uuid, _code_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.phone_verifications;
BEGIN
  SELECT * INTO v FROM public.phone_verifications
   WHERE user_id = _user_id AND consumed_at IS NULL
   ORDER BY created_at DESC LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'otp_not_requested'; END IF;
  IF v.expires_at <= now() THEN
    UPDATE public.phone_verifications SET consumed_at = now() WHERE id = v.id;
    RAISE EXCEPTION 'otp_expired';
  END IF;
  IF v.attempts >= v.max_attempts THEN
    UPDATE public.phone_verifications SET consumed_at = now() WHERE id = v.id;
    INSERT INTO public.audit_logs (actor_id, action, entity, entity_id)
    VALUES (_user_id, 'otp_attempts_exceeded', 'phone_verification', v.id);
    RAISE EXCEPTION 'otp_attempts_exceeded';
  END IF;

  IF v.code_hash <> _code_hash THEN
    UPDATE public.phone_verifications SET attempts = attempts + 1 WHERE id = v.id RETURNING * INTO v;
    INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
    VALUES (_user_id, 'otp_failed', 'phone_verification', v.id, jsonb_build_object('attempts', v.attempts));
    RAISE EXCEPTION 'otp_invalid_code: %', GREATEST(0, v.max_attempts - v.attempts);
  END IF;

  UPDATE public.phone_verifications SET consumed_at = now(), attempts = attempts + 1 WHERE id = v.id;
  UPDATE public.profiles SET phone = v.phone, phone_verified_at = now() WHERE id = _user_id;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
  VALUES (_user_id, 'otp_verified', 'phone_verification', v.id, jsonb_build_object('phone_suffix', right(v.phone, 4)));

  RETURN jsonb_build_object('verified', true, 'phone', v.phone);
END; $$;

CREATE OR REPLACE FUNCTION public.otp_mark_delivered(_challenge_id uuid, _delivered boolean, _channel text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.phone_verifications SET delivered = _delivered, channel = COALESCE(_channel, channel) WHERE id = _challenge_id;
$$;

REVOKE ALL ON FUNCTION public.otp_request(uuid, text, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.otp_verify(uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.otp_mark_delivered(uuid, boolean, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.otp_request(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.otp_verify(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.otp_mark_delivered(uuid, boolean, text) TO service_role;
REVOKE ALL ON FUNCTION public.otp_flag(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.otp_flag(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_phone_verified(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_phone_verified(uuid) TO authenticated, service_role;

-- 6) enforce verification on sensitive customer confirmations
CREATE OR REPLACE FUNCTION public.change_order_status(_order_id uuid, _new_status order_status, _reason text DEFAULT NULL::text)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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

  IF actor = 'customer' AND _new_status = 'completed'
     AND public.otp_flag('require_for_order_completion')
     AND NOT public.is_phone_verified(uid) THEN
    INSERT INTO public.audit_logs (actor_id, action, entity, entity_id)
    VALUES (uid, 'otp_required_blocked', 'order', _order_id);
    RAISE EXCEPTION 'phone_verification_required';
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
$function$;

CREATE OR REPLACE FUNCTION public.change_service_request_status(_request_id uuid, _new_status service_request_status, _reason text DEFAULT NULL::text, _scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS service_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r public.service_requests; uid uuid := auth.uid(); actor text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO r FROM public.service_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;

  actor := public.service_request_actor(uid, _request_id);
  IF actor IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.is_allowed_service_transition(actor, r.status, _new_status) THEN
    RAISE EXCEPTION 'transition_not_allowed: % -> % (%)', r.status, _new_status, actor;
  END IF;

  IF actor = 'customer' AND _new_status = 'completed'
     AND public.otp_flag('require_for_service_completion')
     AND NOT public.is_phone_verified(uid) THEN
    INSERT INTO public.audit_logs (actor_id, action, entity, entity_id)
    VALUES (uid, 'otp_required_blocked', 'service_request', _request_id);
    RAISE EXCEPTION 'phone_verification_required';
  END IF;

  UPDATE public.service_requests SET
    status = _new_status,
    scheduled_at = CASE WHEN _new_status = 'scheduled' AND _scheduled_at IS NOT NULL THEN _scheduled_at ELSE scheduled_at END,
    cancel_reason = CASE WHEN _new_status IN ('cancelled','rejected') THEN COALESCE(_reason, cancel_reason) ELSE cancel_reason END,
    completed_at = CASE WHEN _new_status = 'completed' THEN now() ELSE completed_at END
  WHERE id = _request_id RETURNING * INTO r;

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (r.customer_id, 'تحديث طلب الخدمة', 'حالة طلبك #' || r.code || ' صارت: ' || _new_status::text, 'service');

  RETURN r;
END; $function$;