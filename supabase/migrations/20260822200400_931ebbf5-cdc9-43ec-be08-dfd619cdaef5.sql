ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'IQD',
  ADD COLUMN IF NOT EXISTS governorate text;

ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_images_min_1;

ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_currency_valid;
ALTER TABLE public.ads ADD CONSTRAINT ads_currency_valid CHECK (currency IN ('IQD','USD'));

ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_governorate_valid;
ALTER TABLE public.ads ADD CONSTRAINT ads_governorate_valid CHECK (
  governorate IS NULL OR governorate IN (
    'بغداد','نينوى','البصرة','ذي قار','ميسان','المثنى','القادسية','واسط','بابل',
    'كربلاء','النجف','ديالى','الأنبار','صلاح الدين','كركوك','أربيل','السليمانية','دهوك'
  )
);

CREATE INDEX IF NOT EXISTS ads_governorate_idx ON public.ads (governorate);

CREATE OR REPLACE FUNCTION public.create_ad(
  _category_id uuid,
  _title text,
  _body text,
  _contact_phone text,
  _address_text text,
  _images text[],
  _price numeric DEFAULT NULL::numeric,
  _city_id uuid DEFAULT NULL::uuid,
  _currency text DEFAULT 'IQD',
  _governorate text DEFAULT NULL::text
)
RETURNS ads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.ads;
  _clean text[];
  _active_count integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ad_categories WHERE id = _category_id AND is_active) THEN
    RAISE EXCEPTION 'ad_category_not_found';
  END IF;

  IF coalesce(_currency, 'IQD') NOT IN ('IQD','USD') THEN
    RAISE EXCEPTION 'ad_currency_invalid';
  END IF;

  SELECT array_agg(img) INTO _clean
  FROM (
    SELECT DISTINCT btrim(img) AS img
    FROM unnest(coalesce(_images, '{}'::text[])) AS img
    WHERE btrim(img) <> ''
  ) s;

  _clean := coalesce(_clean, '{}'::text[]);

  IF array_length(_clean, 1) > 5 THEN
    RAISE EXCEPTION 'ad_images_limit';
  END IF;

  SELECT count(*) INTO _active_count
  FROM public.ads
  WHERE owner_id = _uid AND status IN ('pending', 'published');
  IF _active_count >= 10 THEN
    RAISE EXCEPTION 'too_many_active_ads';
  END IF;

  INSERT INTO public.ads (owner_id, category_id, city_id, title, body, price, currency, governorate, contact_phone, address_text, images, status)
  VALUES (_uid, _category_id, _city_id, btrim(_title), btrim(_body), _price, coalesce(_currency,'IQD'), nullif(btrim(coalesce(_governorate,'')), ''), btrim(_contact_phone), btrim(_address_text), _clean, 'pending')
  RETURNING * INTO _row;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
  VALUES (_uid, 'ad_created', 'ads', _row.id, to_jsonb(_row));

  RETURN _row;
END;
$function$;