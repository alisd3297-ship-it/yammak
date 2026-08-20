CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
BEGIN
  IF current_setting('app.otp_verify', true) = '1' THEN RETURN NEW; END IF;
  IF jwt_role = 'service_role' OR (auth.uid() IS NULL AND jwt_role = '') THEN RETURN NEW; END IF;
  IF public.is_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at THEN
    NEW.phone_verified_at := OLD.phone_verified_at;
  END IF;
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.phone_verified_at := NULL;
  END IF;
  RETURN NEW;
END; $function$;