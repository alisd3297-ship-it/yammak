-- ============ فئات الإعلانات ============
CREATE TABLE public.ad_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  icon text NOT NULL DEFAULT 'Megaphone',
  color text NOT NULL DEFAULT 'brand',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ad_categories TO anon;
GRANT SELECT ON public.ad_categories TO authenticated;
GRANT ALL ON public.ad_categories TO service_role;
ALTER TABLE public.ad_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_categories_public_read" ON public.ad_categories
  FOR SELECT USING (is_active = true);
CREATE POLICY "ad_categories_staff_manage" ON public.ad_categories
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

INSERT INTO public.ad_categories (name, icon, color, sort_order) VALUES
  ('عقارات', 'Building2', 'emerald', 1),
  ('سيارات', 'Car', 'sky', 2),
  ('وظائف', 'Briefcase', 'amber', 3),
  ('إلكترونيات', 'Smartphone', 'violet', 4),
  ('أثاث ومنزل', 'Sofa', 'rose', 5),
  ('متنوع', 'Megaphone', 'brand', 6);

-- ============ حالات الإعلان ============
CREATE TYPE public.ad_status AS ENUM ('pending', 'published', 'rejected', 'paused', 'expired');

CREATE TABLE public.ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  category_id uuid NOT NULL REFERENCES public.ad_categories(id) ON DELETE RESTRICT,
  city_id uuid REFERENCES public.cities(id),
  title text NOT NULL,
  body text NOT NULL,
  price numeric(12,2),
  contact_phone text NOT NULL,
  address_text text NOT NULL,
  images text[] NOT NULL DEFAULT '{}',
  status public.ad_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  sort_order integer NOT NULL DEFAULT 0,
  reviewed_by uuid,
  reviewed_at timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ads_title_len CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  CONSTRAINT ads_body_len CHECK (char_length(btrim(body)) BETWEEN 5 AND 2000),
  CONSTRAINT ads_phone_len CHECK (char_length(btrim(contact_phone)) BETWEEN 7 AND 20),
  CONSTRAINT ads_address_len CHECK (char_length(btrim(address_text)) BETWEEN 3 AND 200),
  CONSTRAINT ads_price_positive CHECK (price IS NULL OR price >= 0),
  CONSTRAINT ads_images_max_5 CHECK (array_length(images, 1) IS NULL OR array_length(images, 1) <= 5),
  CONSTRAINT ads_images_min_1 CHECK (array_length(images, 1) >= 1)
);

GRANT SELECT ON public.ads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads TO authenticated;
GRANT ALL ON public.ads TO service_role;
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

CREATE INDEX ads_public_idx ON public.ads (category_id, status, sort_order, published_at DESC);
CREATE INDEX ads_owner_idx ON public.ads (owner_id, created_at DESC);

CREATE POLICY "ads_public_read" ON public.ads
  FOR SELECT USING (status = 'published' AND (expires_at IS NULL OR expires_at > now()));
CREATE POLICY "ads_owner_read" ON public.ads
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "ads_staff_read" ON public.ads
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "ads_owner_insert" ON public.ads
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND status = 'pending');
CREATE POLICY "ads_owner_update" ON public.ads
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() AND status IN ('pending', 'rejected'))
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "ads_owner_delete" ON public.ads
  FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "ads_staff_manage" ON public.ads
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ حارس منع التلاعب ============
CREATE OR REPLACE FUNCTION public.guard_ad_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_staff(auth.uid()) THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  NEW.owner_id := OLD.owner_id;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.reviewed_at := OLD.reviewed_at;
  NEW.sort_order := OLD.sort_order;
  NEW.expires_at := OLD.expires_at;
  NEW.published_at := OLD.published_at;
  NEW.created_at := OLD.created_at;
  NEW.status := 'pending';
  NEW.rejection_reason := NULL;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ads_guard_update
  BEFORE UPDATE ON public.ads
  FOR EACH ROW EXECUTE FUNCTION public.guard_ad_self_update();

-- ============ إنشاء إعلان ============
CREATE OR REPLACE FUNCTION public.create_ad(
  _category_id uuid,
  _title text,
  _body text,
  _contact_phone text,
  _address_text text,
  _images text[],
  _price numeric DEFAULT NULL,
  _city_id uuid DEFAULT NULL
)
RETURNS public.ads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT array_agg(img) INTO _clean
  FROM (
    SELECT DISTINCT btrim(img) AS img
    FROM unnest(coalesce(_images, '{}'::text[])) AS img
    WHERE btrim(img) <> ''
  ) s;

  IF _clean IS NULL OR array_length(_clean, 1) < 1 THEN
    RAISE EXCEPTION 'ad_images_required';
  END IF;
  IF array_length(_clean, 1) > 5 THEN
    RAISE EXCEPTION 'ad_images_limit';
  END IF;

  SELECT count(*) INTO _active_count
  FROM public.ads
  WHERE owner_id = _uid AND status IN ('pending', 'published');
  IF _active_count >= 10 THEN
    RAISE EXCEPTION 'too_many_active_ads';
  END IF;

  INSERT INTO public.ads (owner_id, category_id, city_id, title, body, price, contact_phone, address_text, images, status)
  VALUES (_uid, _category_id, _city_id, btrim(_title), btrim(_body), _price, btrim(_contact_phone), btrim(_address_text), _clean, 'pending')
  RETURNING * INTO _row;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
  VALUES (_uid, 'ad_created', 'ads', _row.id, to_jsonb(_row));

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ad(uuid, text, text, text, text, text[], numeric, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_ad(uuid, text, text, text, text, text[], numeric, uuid) TO authenticated, service_role;

-- ============ قرار الإدارة ============
CREATE OR REPLACE FUNCTION public.set_ad_status(
  _ad_id uuid,
  _status public.ad_status,
  _reason text DEFAULT NULL,
  _sort_order integer DEFAULT NULL,
  _expires_at timestamptz DEFAULT NULL,
  _category_id uuid DEFAULT NULL
)
RETURNS public.ads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _before public.ads;
  _row public.ads;
BEGIN
  IF _uid IS NULL OR NOT public.is_staff(_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO _before FROM public.ads WHERE id = _ad_id FOR UPDATE;
  IF _before.id IS NULL THEN RAISE EXCEPTION 'ad_not_found'; END IF;

  IF _category_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.ad_categories WHERE id = _category_id AND is_active) THEN
    RAISE EXCEPTION 'ad_category_not_found';
  END IF;

  UPDATE public.ads SET
    status = _status,
    rejection_reason = CASE WHEN _status = 'rejected' THEN _reason ELSE NULL END,
    sort_order = coalesce(_sort_order, sort_order),
    expires_at = coalesce(_expires_at, expires_at),
    category_id = coalesce(_category_id, category_id),
    published_at = CASE WHEN _status = 'published' THEN coalesce(published_at, now()) ELSE published_at END,
    reviewed_by = _uid,
    reviewed_at = now(),
    updated_at = now()
  WHERE id = _ad_id
  RETURNING * INTO _row;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, before_data, after_data)
  VALUES (_uid, 'ad_status_' || _status::text, 'ads', _ad_id, to_jsonb(_before), to_jsonb(_row));

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_ad_status(uuid, public.ad_status, text, integer, timestamptz, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.set_ad_status(uuid, public.ad_status, text, integer, timestamptz, uuid) TO authenticated, service_role;

-- ============ الانتهاء التلقائي ============
CREATE OR REPLACE FUNCTION public.expire_ads()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  UPDATE public.ads
  SET status = 'expired', updated_at = now()
  WHERE status = 'published' AND expires_at IS NOT NULL AND expires_at <= now();
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_ads() FROM public;
GRANT EXECUTE ON FUNCTION public.expire_ads() TO service_role;

-- ============ صلاحيات تخزين صور الإعلانات ============
CREATE POLICY "ad_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'ad-images');
CREATE POLICY "ad_images_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ad-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "ad_images_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'ad-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "ad_images_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'ad-images' AND (storage.foldername(name))[1] = auth.uid()::text);