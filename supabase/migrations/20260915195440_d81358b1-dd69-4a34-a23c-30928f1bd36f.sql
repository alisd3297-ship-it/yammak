ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS tiktok_url text;

ALTER TABLE public.providers
  DROP CONSTRAINT IF EXISTS providers_instagram_url_valid,
  DROP CONSTRAINT IF EXISTS providers_facebook_url_valid,
  DROP CONSTRAINT IF EXISTS providers_tiktok_url_valid;

ALTER TABLE public.providers
  ADD CONSTRAINT providers_instagram_url_valid CHECK (instagram_url IS NULL OR instagram_url = '' OR instagram_url ~* '^https://(www\.)?instagram\.com/'),
  ADD CONSTRAINT providers_facebook_url_valid CHECK (facebook_url IS NULL OR facebook_url = '' OR facebook_url ~* '^https://(www\.)?(facebook\.com|fb\.com)/'),
  ADD CONSTRAINT providers_tiktok_url_valid CHECK (tiktok_url IS NULL OR tiktok_url = '' OR tiktok_url ~* '^https://(www\.)?tiktok\.com/');

CREATE OR REPLACE FUNCTION public.admin_upsert_provider(
  _name text,
  _kind public.provider_kind,
  _provider_id uuid DEFAULT NULL,
  _description text DEFAULT '',
  _phone text DEFAULT '',
  _address_text text DEFAULT '',
  _city_id uuid DEFAULT NULL,
  _area_id uuid DEFAULT NULL,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL,
  _logo_url text DEFAULT '',
  _cover_url text DEFAULT '',
  _opening_time time DEFAULT NULL,
  _closing_time time DEFAULT NULL,
  _delivery_fee_override numeric DEFAULT NULL,
  _min_order_amount numeric DEFAULT 0,
  _status public.provider_status DEFAULT 'approved',
  _is_open boolean DEFAULT true,
  _keywords text[] DEFAULT '{}',
  _profession_category_id uuid DEFAULT NULL,
  _instagram_url text DEFAULT '',
  _facebook_url text DEFAULT '',
  _tiktok_url text DEFAULT ''
)
RETURNS public.providers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider public.providers;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF trim(coalesce(_name, '')) = '' THEN
    RAISE EXCEPTION 'missing_name';
  END IF;
  IF _kind = 'profession' AND _profession_category_id IS NULL THEN
    RAISE EXCEPTION 'missing_category';
  END IF;

  IF _provider_id IS NULL THEN
    INSERT INTO public.providers (
      name, kind, description, phone, address_text, city_id, area_id, lat, lng,
      logo_url, cover_url, opening_time, closing_time, delivery_fee_override,
      min_order_amount, status, is_open, keywords, profession_category_id,
      instagram_url, facebook_url, tiktok_url
    ) VALUES (
      trim(_name), _kind, nullif(trim(_description), ''), nullif(trim(_phone), ''),
      nullif(trim(_address_text), ''), _city_id, _area_id, _lat, _lng,
      nullif(trim(_logo_url), ''), nullif(trim(_cover_url), ''), _opening_time, _closing_time,
      _delivery_fee_override, greatest(coalesce(_min_order_amount, 0), 0), _status,
      _is_open, coalesce(_keywords, '{}'), _profession_category_id,
      nullif(trim(_instagram_url), ''), nullif(trim(_facebook_url), ''), nullif(trim(_tiktok_url), '')
    ) RETURNING * INTO v_provider;
  ELSE
    UPDATE public.providers SET
      name = trim(_name),
      kind = _kind,
      description = nullif(trim(_description), ''),
      phone = nullif(trim(_phone), ''),
      address_text = nullif(trim(_address_text), ''),
      city_id = _city_id,
      area_id = _area_id,
      lat = _lat,
      lng = _lng,
      logo_url = nullif(trim(_logo_url), ''),
      cover_url = nullif(trim(_cover_url), ''),
      opening_time = _opening_time,
      closing_time = _closing_time,
      delivery_fee_override = _delivery_fee_override,
      min_order_amount = greatest(coalesce(_min_order_amount, 0), 0),
      status = _status,
      is_open = _is_open,
      keywords = coalesce(_keywords, '{}'),
      profession_category_id = _profession_category_id,
      instagram_url = nullif(trim(_instagram_url), ''),
      facebook_url = nullif(trim(_facebook_url), ''),
      tiktok_url = nullif(trim(_tiktok_url), ''),
      updated_at = now()
    WHERE id = _provider_id
    RETURNING * INTO v_provider;

    IF v_provider.id IS NULL THEN
      RAISE EXCEPTION 'provider_not_found';
    END IF;
  END IF;

  RETURN v_provider;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_provider(text, public.provider_kind, uuid, text, text, text, uuid, uuid, double precision, double precision, text, text, time, time, numeric, numeric, public.provider_status, boolean, text[], uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_provider(text, public.provider_kind, uuid, text, text, text, uuid, uuid, double precision, double precision, text, text, time, time, numeric, numeric, public.provider_status, boolean, text[], uuid, text, text, text) TO authenticated, service_role;