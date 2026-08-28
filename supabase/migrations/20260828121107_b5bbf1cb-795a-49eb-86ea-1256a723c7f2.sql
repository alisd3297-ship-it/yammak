CREATE OR REPLACE FUNCTION public.admin_link_provider_owner(_provider_id uuid, _owner_id uuid)
RETURNS public.providers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  before_row public.providers;
  pr public.providers;
  taken uuid;
BEGIN
  IF uid IS NULL OR NOT public.is_staff(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO before_row FROM public.providers WHERE id = _provider_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_not_found'; END IF;

  IF _owner_id IS NOT NULL THEN
    -- حساب واحد لا يملك أكثر من نشاط: يمنع الحساب المشترك بين المطاعم
    SELECT id INTO taken FROM public.providers
      WHERE owner_id = _owner_id AND id <> _provider_id LIMIT 1;
    IF taken IS NOT NULL THEN RAISE EXCEPTION 'owner_already_linked'; END IF;
  END IF;

  UPDATE public.providers
     SET owner_id = _owner_id, updated_at = now()
   WHERE id = _provider_id
  RETURNING * INTO pr;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, before_data, after_data)
  VALUES (
    uid,
    CASE WHEN _owner_id IS NULL THEN 'provider_owner_unlinked' ELSE 'provider_owner_linked' END,
    'providers', _provider_id,
    jsonb_build_object('owner_id', before_row.owner_id),
    jsonb_build_object('owner_id', _owner_id)
  );

  RETURN pr;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.admin_link_provider_owner(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_link_provider_owner(uuid, uuid) TO authenticated;