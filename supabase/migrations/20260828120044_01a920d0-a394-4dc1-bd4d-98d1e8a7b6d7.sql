ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS opening_time time,
  ADD COLUMN IF NOT EXISTS closing_time time,
  ADD COLUMN IF NOT EXISTS min_order_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee_override numeric;

CREATE OR REPLACE FUNCTION public.compute_delivery_fee(_order_type order_type, _city_id uuid, _provider_id uuid, _distance_km double precision)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  fb jsonb;
  base numeric; perkm numeric; minfee numeric;
  km numeric := GREATEST(COALESCE(_distance_km, 0), 0);
  fee numeric;
  override_fee numeric;
BEGIN
  SELECT delivery_fee_override INTO override_fee
    FROM public.providers WHERE id = _provider_id;
  IF override_fee IS NOT NULL AND override_fee >= 0 THEN
    RETURN round(override_fee);
  END IF;

  SELECT * INTO r FROM public.pricing_rules
  WHERE is_active AND order_type = _order_type
    AND (provider_id IS NULL OR provider_id = _provider_id)
    AND (city_id IS NULL OR city_id = _city_id)
  ORDER BY (provider_id = _provider_id) DESC NULLS LAST, (city_id = _city_id) DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    base := r.base_fee; perkm := r.per_km_fee; minfee := r.min_fee;
  ELSE
    SELECT value INTO fb FROM public.app_settings WHERE key = 'delivery_fee_fallback';
    base   := COALESCE((fb->>'base_fee')::numeric, 2000);
    perkm  := COALESCE((fb->>'per_km_fee')::numeric, 500);
    minfee := COALESCE((fb->>'min_fee')::numeric, 2000);
  END IF;

  fee := base + (perkm * km);
  IF fee < minfee THEN fee := minfee; END IF;
  RETURN round(fee);
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_provider(
  _name text,
  _kind provider_kind,
  _provider_id uuid DEFAULT NULL,
  _description text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _address_text text DEFAULT NULL,
  _city_id uuid DEFAULT NULL,
  _area_id uuid DEFAULT NULL,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL,
  _logo_url text DEFAULT NULL,
  _cover_url text DEFAULT NULL,
  _opening_time time DEFAULT NULL,
  _closing_time time DEFAULT NULL,
  _delivery_fee_override numeric DEFAULT NULL,
  _min_order_amount numeric DEFAULT 0,
  _status provider_status DEFAULT 'approved',
  _is_open boolean DEFAULT true,
  _keywords text[] DEFAULT NULL,
  _profession_category_id uuid DEFAULT NULL
)
RETURNS providers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  before_row public.providers;
  pr public.providers;
BEGIN
  IF uid IS NULL OR NOT public.is_staff(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF COALESCE(btrim(_name), '') = '' THEN RAISE EXCEPTION 'missing_name'; END IF;
  IF _kind NOT IN ('restaurant','store','profession') THEN RAISE EXCEPTION 'kind_not_allowed'; END IF;

  IF _provider_id IS NOT NULL THEN
    SELECT * INTO before_row FROM public.providers WHERE id = _provider_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'provider_not_found'; END IF;

    UPDATE public.providers SET
      name = btrim(_name),
      kind = _kind,
      description = NULLIF(btrim(COALESCE(_description,'')),''),
      phone = NULLIF(btrim(COALESCE(_phone,'')),''),
      address_text = NULLIF(btrim(COALESCE(_address_text,'')),''),
      city_id = _city_id,
      area_id = _area_id,
      lat = _lat,
      lng = _lng,
      logo_url = NULLIF(btrim(COALESCE(_logo_url,'')),''),
      cover_url = NULLIF(btrim(COALESCE(_cover_url,'')),''),
      opening_time = _opening_time,
      closing_time = _closing_time,
      delivery_fee_override = _delivery_fee_override,
      min_order_amount = GREATEST(COALESCE(_min_order_amount, 0), 0),
      status = _status,
      is_open = CASE WHEN _status = 'approved' THEN COALESCE(_is_open, false) ELSE false END,
      keywords = COALESCE(_keywords, keywords),
      profession_category_id = CASE WHEN _kind = 'profession' THEN _profession_category_id ELSE NULL END,
      updated_at = now()
    WHERE id = _provider_id
    RETURNING * INTO pr;
  ELSE
    INSERT INTO public.providers (
      name, kind, description, phone, address_text, city_id, area_id, lat, lng,
      logo_url, cover_url, opening_time, closing_time, delivery_fee_override,
      min_order_amount, status, is_open, keywords, profession_category_id
    ) VALUES (
      btrim(_name), _kind,
      NULLIF(btrim(COALESCE(_description,'')),''),
      NULLIF(btrim(COALESCE(_phone,'')),''),
      NULLIF(btrim(COALESCE(_address_text,'')),''),
      _city_id, _area_id, _lat, _lng,
      NULLIF(btrim(COALESCE(_logo_url,'')),''),
      NULLIF(btrim(COALESCE(_cover_url,'')),''),
      _opening_time, _closing_time, _delivery_fee_override,
      GREATEST(COALESCE(_min_order_amount, 0), 0),
      _status,
      CASE WHEN _status = 'approved' THEN COALESCE(_is_open, true) ELSE false END,
      COALESCE(_keywords, '{}'::text[]),
      CASE WHEN _kind = 'profession' THEN _profession_category_id ELSE NULL END
    )
    RETURNING * INTO pr;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, before_data, after_data)
  VALUES (uid,
          CASE WHEN _provider_id IS NULL THEN 'provider_admin_create' ELSE 'provider_admin_update' END,
          'providers', pr.id, to_jsonb(before_row), to_jsonb(pr));

  RETURN pr;
END; $function$;

REVOKE ALL ON FUNCTION public.admin_upsert_provider(text, provider_kind, uuid, text, text, text, uuid, uuid, double precision, double precision, text, text, time, time, numeric, numeric, provider_status, boolean, text[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_provider(text, provider_kind, uuid, text, text, text, uuid, uuid, double precision, double precision, text, text, time, time, numeric, numeric, provider_status, boolean, text[], uuid) TO authenticated, service_role;