CREATE TABLE public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact text NOT NULL,
  full_name text,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.account_deletion_requests TO anon;
GRANT INSERT, SELECT, UPDATE ON public.account_deletion_requests TO authenticated;
GRANT ALL ON public.account_deletion_requests TO service_role;

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can request deletion"
ON public.account_deletion_requests FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "staff can read deletion requests"
ON public.account_deletion_requests FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "staff can update deletion requests"
ON public.account_deletion_requests FOR UPDATE TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER update_account_deletion_requests_updated_at
BEFORE UPDATE ON public.account_deletion_requests
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.purge_user_personal_data(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_required';
  END IF;

  UPDATE public.providers SET owner_id = NULL WHERE owner_id = _user_id;
  UPDATE public.audit_logs SET actor_id = NULL WHERE actor_id = _user_id;

  DELETE FROM public.push_devices WHERE user_id = _user_id;
  DELETE FROM public.notifications WHERE user_id = _user_id;
  DELETE FROM public.addresses WHERE user_id = _user_id;
  DELETE FROM public.worker_locations WHERE user_id = _user_id;
  DELETE FROM public.worker_profiles WHERE user_id = _user_id;
  DELETE FROM public.plus_subscriptions WHERE user_id = _user_id;
  DELETE FROM public.family_members WHERE user_id = _user_id;
  DELETE FROM public.business_members WHERE user_id = _user_id;
  DELETE FROM public.marketplace_listings WHERE seller_id = _user_id;
  DELETE FROM public.ads WHERE owner_id = _user_id;
  DELETE FROM public.app_error_logs WHERE user_id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_user_personal_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_user_personal_data(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.purge_user_personal_data(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_user_personal_data(uuid) TO service_role;