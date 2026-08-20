
CREATE OR REPLACE FUNCTION public.apply_as_provider(
  _kind provider_kind, _name text, _description text DEFAULT NULL::text, _phone text DEFAULT NULL::text,
  _city_id uuid DEFAULT NULL::uuid, _area_id uuid DEFAULT NULL::uuid, _address_text text DEFAULT NULL::text,
  _lat double precision DEFAULT NULL::double precision, _lng double precision DEFAULT NULL::double precision,
  _profession_category_id uuid DEFAULT NULL::uuid)
RETURNS providers LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE uid uuid := auth.uid(); pr public.providers;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _kind NOT IN ('restaurant','store','profession') THEN RAISE EXCEPTION 'kind_not_allowed'; END IF;
  IF COALESCE(btrim(_name), '') = '' THEN RAISE EXCEPTION 'missing_name'; END IF;
  IF _kind = 'profession' AND _profession_category_id IS NULL THEN RAISE EXCEPTION 'missing_category'; END IF;
  IF EXISTS (SELECT 1 FROM public.providers WHERE owner_id = uid) THEN
    RAISE EXCEPTION 'provider_already_exists';
  END IF;

  INSERT INTO public.providers (owner_id, kind, name, description, phone, city_id, area_id, address_text, lat, lng, status, is_open, profession_category_id)
  VALUES (uid, _kind, btrim(_name), NULLIF(btrim(COALESCE(_description,'')),''), NULLIF(btrim(COALESCE(_phone,'')),''),
          _city_id, _area_id, NULLIF(btrim(COALESCE(_address_text,'')),''), _lat, _lng, 'pending', false,
          CASE WHEN _kind = 'profession' THEN _profession_category_id ELSE NULL END)
  RETURNING * INTO pr;

  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'provider') ON CONFLICT DO NOTHING;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
  VALUES (uid, 'provider_application', 'providers', pr.id, to_jsonb(pr));

  RETURN pr;
END; $function$;
