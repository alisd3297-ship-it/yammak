-- 1) لا نستخدم RAISE بعد تحديث العدّاد لأن ذلك يلغي التحديث (تراجع المعاملة)
CREATE OR REPLACE FUNCTION public.otp_verify(_user_id uuid, _code_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v public.phone_verifications;
BEGIN
  SELECT * INTO v FROM public.phone_verifications
   WHERE user_id = _user_id AND consumed_at IS NULL
   ORDER BY created_at DESC LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('verified', false, 'reason', 'otp_not_requested', 'remaining', 0);
  END IF;

  IF v.expires_at <= now() THEN
    UPDATE public.phone_verifications SET consumed_at = now() WHERE id = v.id;
    RETURN jsonb_build_object('verified', false, 'reason', 'otp_expired', 'remaining', 0);
  END IF;

  IF v.attempts >= v.max_attempts THEN
    UPDATE public.phone_verifications SET consumed_at = now() WHERE id = v.id;
    INSERT INTO public.audit_logs (actor_id, action, entity, entity_id)
    VALUES (_user_id, 'otp_attempts_exceeded', 'phone_verification', v.id);
    RETURN jsonb_build_object('verified', false, 'reason', 'otp_attempts_exceeded', 'remaining', 0);
  END IF;

  IF v.code_hash <> _code_hash THEN
    UPDATE public.phone_verifications SET attempts = attempts + 1 WHERE id = v.id RETURNING * INTO v;
    IF v.attempts >= v.max_attempts THEN
      UPDATE public.phone_verifications SET consumed_at = now() WHERE id = v.id;
    END IF;
    INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
    VALUES (_user_id, 'otp_failed', 'phone_verification', v.id, jsonb_build_object('attempts', v.attempts));
    RETURN jsonb_build_object(
      'verified', false,
      'reason', CASE WHEN v.attempts >= v.max_attempts THEN 'otp_attempts_exceeded' ELSE 'otp_invalid_code' END,
      'remaining', GREATEST(0, v.max_attempts - v.attempts)
    );
  END IF;

  UPDATE public.phone_verifications SET consumed_at = now(), attempts = attempts + 1 WHERE id = v.id;

  -- علامة داخلية للجلسة تسمح للحارس بقبول تثبيت التوثيق مع تحديث الرقم
  PERFORM set_config('app.otp_verify', '1', true);
  UPDATE public.profiles SET phone = v.phone, phone_verified_at = now() WHERE id = _user_id;
  PERFORM set_config('app.otp_verify', '', true);

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
  VALUES (_user_id, 'otp_verified', 'phone_verification', v.id, jsonb_build_object('phone_suffix', right(v.phone, 4)));

  RETURN jsonb_build_object('verified', true, 'phone', v.phone);
END; $function$;

-- 2) الحارس يجب أن لا يلغي التوثيق عندما يكون التحديث صادراً من otp_verify نفسه
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.otp_verify', true) = '1' THEN RETURN NEW; END IF;
  IF public.is_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at THEN
    NEW.phone_verified_at := OLD.phone_verified_at;
  END IF;
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.phone_verified_at := NULL;
  END IF;
  RETURN NEW;
END; $function$;