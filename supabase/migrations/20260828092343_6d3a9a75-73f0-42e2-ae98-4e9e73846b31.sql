-- =========================================================
-- طبقة إضافية backward-compatible لميزات لبابك الجديدة
-- =========================================================

-- 1) مناطق التوصيل الذكية -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL,
  name text NOT NULL,
  center_lat double precision,
  center_lng double precision,
  radius_km numeric NOT NULL DEFAULT 5,
  base_fee numeric NOT NULL DEFAULT 0,
  per_km_fee numeric NOT NULL DEFAULT 0,
  min_fee numeric NOT NULL DEFAULT 0,
  max_fee numeric NOT NULL DEFAULT 0,
  eta_min_minutes integer NOT NULL DEFAULT 20,
  eta_max_minutes integer NOT NULL DEFAULT 45,
  surge_multiplier numeric NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.delivery_zones TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_zones TO authenticated;
GRANT ALL ON public.delivery_zones TO service_role;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zones_public_read" ON public.delivery_zones
  FOR SELECT USING (is_active = true OR public.is_staff(auth.uid()));
CREATE POLICY "zones_staff_manage" ON public.delivery_zones
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_delivery_zones_updated BEFORE UPDATE ON public.delivery_zones
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) حساب العائلة ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.family_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'عائلتي',
  monthly_limit numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IQD',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS family_accounts_owner_idx ON public.family_accounts(owner_id);

CREATE TABLE IF NOT EXISTS public.family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.family_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  member_name text NOT NULL DEFAULT '',
  can_order boolean NOT NULL DEFAULT true,
  monthly_limit numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_accounts TO authenticated;
GRANT ALL ON public.family_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_members TO authenticated;
GRANT ALL ON public.family_members TO service_role;
ALTER TABLE public.family_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_family_member(_family_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_accounts f WHERE f.id = _family_id AND f.owner_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.family_members m WHERE m.family_id = _family_id AND m.user_id = _user_id
  );
$$;
REVOKE ALL ON FUNCTION public.is_family_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid, uuid) TO authenticated;

CREATE POLICY "family_read" ON public.family_accounts
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_family_member(id, auth.uid()) OR public.is_staff(auth.uid()));
CREATE POLICY "family_owner_write" ON public.family_accounts
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "family_members_read" ON public.family_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_family_member(family_id, auth.uid()) OR public.is_staff(auth.uid()));
CREATE POLICY "family_members_owner_write" ON public.family_members
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.family_accounts f WHERE f.id = family_id AND f.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.family_accounts f WHERE f.id = family_id AND f.owner_id = auth.uid()));

CREATE TRIGGER trg_family_accounts_updated BEFORE UPDATE ON public.family_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_family_members_updated BEFORE UPDATE ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) لبابك للأعمال --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  tax_number text,
  billing_address text,
  phone text,
  monthly_limit numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IQD',
  status text NOT NULL DEFAULT 'pending',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  member_role text NOT NULL DEFAULT 'employee',
  monthly_limit numeric NOT NULL DEFAULT 0,
  can_order boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_accounts TO authenticated;
GRANT ALL ON public.business_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_members TO authenticated;
GRANT ALL ON public.business_members TO service_role;
ALTER TABLE public.business_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_business_member(_business_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_accounts b WHERE b.id = _business_id AND b.owner_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.business_members m WHERE m.business_id = _business_id AND m.user_id = _user_id
  );
$$;
REVOKE ALL ON FUNCTION public.is_business_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid, uuid) TO authenticated;

CREATE POLICY "business_read" ON public.business_accounts
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_business_member(id, auth.uid()) OR public.is_staff(auth.uid()));
CREATE POLICY "business_owner_write" ON public.business_accounts
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "business_staff_manage" ON public.business_accounts
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "business_members_read" ON public.business_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_business_member(business_id, auth.uid()) OR public.is_staff(auth.uid()));
CREATE POLICY "business_members_owner_write" ON public.business_members
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.business_accounts b WHERE b.id = business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.business_accounts b WHERE b.id = business_id AND b.owner_id = auth.uid()));

CREATE TRIGGER trg_business_accounts_updated BEFORE UPDATE ON public.business_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_business_members_updated BEFORE UPDATE ON public.business_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) طلبات عروض الأسعار والتفاوض -----------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  category_id uuid REFERENCES public.profession_categories(id) ON DELETE SET NULL,
  city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  address_text text NOT NULL DEFAULT '',
  budget numeric,
  currency text NOT NULL DEFAULT 'IQD',
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  accepted_offer_id uuid,
  service_request_id uuid REFERENCES public.service_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quote_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.quote_requests(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'IQD',
  message text,
  eta_minutes integer,
  status text NOT NULL DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, provider_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_requests TO authenticated;
GRANT ALL ON public.quote_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_offers TO authenticated;
GRANT ALL ON public.quote_offers TO service_role;
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotes_customer_read" ON public.quote_requests
  FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR public.is_staff(auth.uid())
    OR (status = 'open' AND EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.owner_id = auth.uid() AND p.status = 'approved' AND p.kind = 'profession'
    ))
  );
CREATE POLICY "quotes_customer_write" ON public.quote_requests
  FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
CREATE POLICY "quotes_customer_update" ON public.quote_requests
  FOR UPDATE TO authenticated USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid());

CREATE POLICY "quote_offers_read" ON public.quote_offers
  FOR SELECT TO authenticated
  USING (
    public.owns_provider(auth.uid(), provider_id)
    OR public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.quote_requests r WHERE r.id = request_id AND r.customer_id = auth.uid())
  );
CREATE POLICY "quote_offers_provider_write" ON public.quote_offers
  FOR INSERT TO authenticated WITH CHECK (public.owns_provider(auth.uid(), provider_id));
CREATE POLICY "quote_offers_update" ON public.quote_offers
  FOR UPDATE TO authenticated
  USING (
    public.owns_provider(auth.uid(), provider_id)
    OR EXISTS (SELECT 1 FROM public.quote_requests r WHERE r.id = request_id AND r.customer_id = auth.uid())
  )
  WITH CHECK (
    public.owns_provider(auth.uid(), provider_id)
    OR EXISTS (SELECT 1 FROM public.quote_requests r WHERE r.id = request_id AND r.customer_id = auth.uid())
  );

CREATE TRIGGER trg_quote_requests_updated BEFORE UPDATE ON public.quote_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_quote_offers_updated BEFORE UPDATE ON public.quote_offers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5) ضمان لبابك -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guarantee_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  service_request_id uuid REFERENCES public.service_requests(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  reason text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  resolution_note text,
  compensation_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IQD',
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.guarantee_claims TO authenticated;
GRANT ALL ON public.guarantee_claims TO service_role;
ALTER TABLE public.guarantee_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "claims_owner_read" ON public.guarantee_claims
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "claims_owner_insert" ON public.guarantee_claims
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "claims_staff_update" ON public.guarantee_claims
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_guarantee_claims_updated BEFORE UPDATE ON public.guarantee_claims
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6) متجر لبابك (Marketplace) ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric,
  currency text NOT NULL DEFAULT 'IQD',
  images text[] NOT NULL DEFAULT '{}',
  contact_phone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.marketplace_listings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_listings TO authenticated;
GRANT ALL ON public.marketplace_listings TO service_role;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listings_public_read" ON public.marketplace_listings
  FOR SELECT USING (status = 'published');
CREATE POLICY "listings_seller_read" ON public.marketplace_listings
  FOR SELECT TO authenticated USING (seller_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "listings_seller_write" ON public.marketplace_listings
  FOR INSERT TO authenticated WITH CHECK (seller_id = auth.uid());
CREATE POLICY "listings_seller_update" ON public.marketplace_listings
  FOR UPDATE TO authenticated USING (seller_id = auth.uid()) WITH CHECK (seller_id = auth.uid());
CREATE POLICY "listings_staff_manage" ON public.marketplace_listings
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_marketplace_listings_updated BEFORE UPDATE ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7) أعمدة إضافية على الجداول الحالية -------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS recipient_phone text,
  ADD COLUMN IF NOT EXISTS is_gift boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gift_message text,
  ADD COLUMN IF NOT EXISTS family_account_id uuid REFERENCES public.family_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS business_account_id uuid REFERENCES public.business_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_zone_id uuid REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS eta_min_minutes integer,
  ADD COLUMN IF NOT EXISTS eta_max_minutes integer;

ALTER TABLE public.custom_requests
  ADD COLUMN IF NOT EXISTS source_place_text text,
  ADD COLUMN IF NOT EXISTS source_lat double precision,
  ADD COLUMN IF NOT EXISTS source_lng double precision,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS input_kind text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS recipient_phone text;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid;

CREATE INDEX IF NOT EXISTS quote_offers_request_idx ON public.quote_offers(request_id);
CREATE INDEX IF NOT EXISTS quote_requests_status_idx ON public.quote_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_status_idx ON public.marketplace_listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS claims_status_idx ON public.guarantee_claims(status, created_at DESC);

-- 8) مفاتيح الميزات --------------------------------------------------------
INSERT INTO public.feature_flags (key, label, description, phase, is_enabled, rollout_percent, audience)
VALUES
  ('errand_pickup', 'جيبلي من هنانا', 'طلب شراء/إحضار من مكان يحدده الزبون', 7, true, 100, 'all'),
  ('voice_shopping_list', 'قائمة مشتريات بالصوت', 'إدخال صوتي يتحول لقائمة عناصر', 7, true, 100, 'all'),
  ('order_from_photo', 'اطلب من صورة', 'استخراج العناصر من صورة قائمة مشتريات', 8, false, 100, 'all'),
  ('cheapest_option', 'أرخص خيار', 'مقارنة الأسعار بين التجار', 7, true, 100, 'all'),
  ('fastest_delivery', 'أسرع توصيل', 'ترتيب الخيارات حسب وقت الوصول', 7, true, 100, 'all'),
  ('multi_store_cart', 'سلة من عدة متاجر', 'سلال منفصلة لكل متجر', 6, true, 100, 'all'),
  ('family_accounts', 'حساب العائلة', 'حساب رئيسي وأعضاء بحدود إنفاق', 9, true, 100, 'all'),
  ('send_to_other', 'إرسال طلب لشخص آخر', 'مستلم مختلف عن صاحب الطلب', 6, true, 100, 'all'),
  ('gifts', 'هدايا لبابك', 'طلب هدية لمستلم آخر', 6, true, 100, 'all'),
  ('load_indicator', 'مؤشر ضغط الطلبات', 'حالة الضغط التقريبية للخدمة', 4, true, 100, 'all'),
  ('eta_prediction', 'توقع وقت الوصول', 'نطاق زمني متوقع من بيانات المنطقة', 4, true, 100, 'all'),
  ('price_negotiation', 'تفاوض على سعر الخدمة', 'عروض أسعار وقبول/رفض', 9, true, 100, 'all'),
  ('quote_requests', 'طلب عرض سعر', 'إرسال طلب عروض لمقدمي الخدمات', 9, true, 100, 'all'),
  ('provider_verification', 'مقدمو خدمة موثقون', 'شارة توثيق يديرها النظام', 9, true, 100, 'all'),
  ('lababak_guarantee', 'ضمان لبابك', 'شكاوى وتعويضات مرتبطة بالطلب', 9, true, 100, 'all'),
  ('delivery_zones', 'مناطق التوصيل الذكية', 'رسوم وأوقات حسب المنطقة', 4, true, 100, 'all'),
  ('admin_orders_map', 'خريطة الطلبات للإدارة', 'عرض جغرافي للطلبات', 4, true, 100, 'staff'),
  ('smart_delivery_pricing', 'تسعير ذكي للتوصيل', 'حساب حسب المسافة والمركبة والمنطقة', 4, true, 100, 'all'),
  ('marketplace', 'متجر لبابك', 'عروض البائعين باعتماد الإدارة', 9, true, 100, 'all'),
  ('lababak_business', 'لبابك للأعمال', 'حسابات شركات وفواتير', 9, true, 100, 'all')
ON CONFLICT (key) DO NOTHING;