
-- ===== Enums =====
CREATE TYPE public.service_request_status AS ENUM (
  'requested','accepted','scheduled','en_route','in_progress','completed','cancelled','rejected'
);
CREATE TYPE public.service_price_unit AS ENUM ('fixed','hourly','daily','visit','negotiable');

-- ===== Profession categories =====
CREATE TABLE public.profession_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  icon text NOT NULL DEFAULT 'Wrench',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profession_categories TO anon, authenticated;
GRANT ALL ON public.profession_categories TO service_role;
ALTER TABLE public.profession_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY prof_cat_public_read ON public.profession_categories FOR SELECT USING (true);
CREATE POLICY prof_cat_admin_write ON public.profession_categories FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS profession_category_id uuid REFERENCES public.profession_categories(id);

-- ===== Provider services (catalog for professionals) =====
CREATE TABLE public.provider_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.profession_categories(id),
  name text NOT NULL,
  description text,
  price_amount numeric NOT NULL DEFAULT 0 CHECK (price_amount >= 0),
  price_unit public.service_price_unit NOT NULL DEFAULT 'fixed',
  estimated_minutes integer,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.provider_services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_services TO authenticated;
GRANT ALL ON public.provider_services TO service_role;
ALTER TABLE public.provider_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY prov_services_public_read ON public.provider_services FOR SELECT USING (true);
CREATE POLICY prov_services_owner_write ON public.provider_services FOR ALL TO authenticated
  USING (public.owns_provider(auth.uid(), provider_id) OR public.is_staff(auth.uid()))
  WITH CHECK (public.owns_provider(auth.uid(), provider_id) OR public.is_staff(auth.uid()));
CREATE TRIGGER trg_provider_services_updated BEFORE UPDATE ON public.provider_services
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_provider_services_provider ON public.provider_services(provider_id);

-- ===== Service requests =====
CREATE TABLE public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
  customer_id uuid NOT NULL,
  provider_id uuid NOT NULL REFERENCES public.providers(id),
  service_id uuid REFERENCES public.provider_services(id),
  status public.service_request_status NOT NULL DEFAULT 'requested',
  city_id uuid REFERENCES public.cities(id),
  service_name text NOT NULL,
  price_amount numeric NOT NULL DEFAULT 0,
  price_unit public.service_price_unit NOT NULL DEFAULT 'fixed',
  description text,
  address_text text NOT NULL,
  lat double precision,
  lng double precision,
  scheduled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT ON public.service_requests TO authenticated;
GRANT ALL ON public.service_requests TO service_role;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_service_requests_customer ON public.service_requests(customer_id);
CREATE INDEX idx_service_requests_provider ON public.service_requests(provider_id);
CREATE TRIGGER trg_service_requests_updated BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.can_see_service_request(_user_id uuid, _request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_requests r
    WHERE r.id = _request_id AND (
      r.customer_id = _user_id
      OR public.owns_provider(_user_id, r.provider_id)
      OR public.is_staff(_user_id)
    )
  );
$$;

CREATE POLICY service_requests_read ON public.service_requests FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.owns_provider(auth.uid(), provider_id) OR public.is_staff(auth.uid()));

-- ===== History =====
CREATE TABLE public.service_request_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  status public.service_request_status NOT NULL,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_request_history TO authenticated;
GRANT ALL ON public.service_request_history TO service_role;
ALTER TABLE public.service_request_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY srh_read ON public.service_request_history FOR SELECT TO authenticated
  USING (public.can_see_service_request(auth.uid(), request_id));
CREATE INDEX idx_srh_request ON public.service_request_history(request_id);

CREATE OR REPLACE FUNCTION public.log_service_request_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.service_request_history (request_id, status, changed_by)
    VALUES (NEW.id, NEW.status, auth.uid());
    IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_service_request_status_ins AFTER INSERT ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_service_request_status();
CREATE TRIGGER trg_service_request_status_upd BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_service_request_status();

-- ===== Service ratings =====
CREATE TABLE public.service_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.service_requests(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL,
  provider_id uuid NOT NULL REFERENCES public.providers(id),
  stars integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_ratings TO authenticated;
GRANT ALL ON public.service_ratings TO service_role;
ALTER TABLE public.service_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_ratings_read ON public.service_ratings FOR SELECT TO authenticated
  USING (rater_id = auth.uid() OR public.is_staff(auth.uid()) OR public.can_see_service_request(auth.uid(), request_id));

-- ===== Transitions =====
CREATE OR REPLACE FUNCTION public.is_allowed_service_transition(_actor text, _from service_request_status, _to service_request_status)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF _from = _to THEN RETURN false; END IF;
  IF _from IN ('completed','cancelled','rejected') THEN RETURN false; END IF;

  IF _to = 'cancelled' THEN
    RETURN CASE _actor
      WHEN 'customer' THEN _from IN ('requested','accepted','scheduled')
      WHEN 'provider' THEN _from IN ('accepted','scheduled','en_route')
      WHEN 'staff'    THEN true
      ELSE false END;
  END IF;

  IF _to = 'rejected' THEN
    RETURN _actor IN ('provider','staff') AND _from = 'requested';
  END IF;

  IF _actor = 'staff' THEN RETURN true; END IF;

  RETURN CASE _actor
    WHEN 'provider' THEN
      (_from = 'requested' AND _to IN ('accepted','scheduled'))
      OR (_from = 'accepted' AND _to IN ('scheduled','en_route','in_progress'))
      OR (_from = 'scheduled' AND _to IN ('en_route','in_progress'))
      OR (_from = 'en_route' AND _to = 'in_progress')
      OR (_from = 'in_progress' AND _to = 'completed')
    ELSE false END;
END; $$;

CREATE OR REPLACE FUNCTION public.service_request_actor(_user_id uuid, _request_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT customer_id, provider_id INTO r FROM public.service_requests WHERE id = _request_id;
  IF NOT FOUND OR _user_id IS NULL THEN RETURN NULL; END IF;
  IF public.is_staff(_user_id) THEN RETURN 'staff'; END IF;
  IF r.customer_id = _user_id THEN RETURN 'customer'; END IF;
  IF public.owns_provider(_user_id, r.provider_id) THEN RETURN 'provider'; END IF;
  RETURN NULL;
END; $$;

-- ===== RPC: create service request =====
CREATE OR REPLACE FUNCTION public.create_service_request(
  _service_id uuid,
  _address_text text,
  _description text DEFAULT NULL,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL,
  _scheduled_at timestamptz DEFAULT NULL
) RETURNS service_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  s public.provider_services;
  p record;
  r public.service_requests;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF COALESCE(btrim(_address_text), '') = '' AND (_lat IS NULL OR _lng IS NULL) THEN
    RAISE EXCEPTION 'missing_location';
  END IF;
  IF _scheduled_at IS NOT NULL AND _scheduled_at < now() - interval '1 hour' THEN
    RAISE EXCEPTION 'invalid_schedule';
  END IF;

  SELECT * INTO s FROM public.provider_services WHERE id = _service_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'service_not_found'; END IF;
  IF NOT s.is_active THEN RAISE EXCEPTION 'service_unavailable'; END IF;

  SELECT id, kind, status, is_open, city_id, owner_id INTO p FROM public.providers WHERE id = s.provider_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_not_found'; END IF;
  IF p.status <> 'approved' THEN RAISE EXCEPTION 'provider_not_approved'; END IF;
  IF p.kind <> 'profession' THEN RAISE EXCEPTION 'provider_kind_not_service'; END IF;
  IF p.owner_id = uid THEN RAISE EXCEPTION 'cannot_order_own_service'; END IF;

  INSERT INTO public.service_requests (
    customer_id, provider_id, service_id, city_id, service_name,
    price_amount, price_unit, description, address_text, lat, lng, scheduled_at,
    status
  ) VALUES (
    uid, p.id, s.id, p.city_id, s.name,
    s.price_amount, s.price_unit,
    NULLIF(btrim(COALESCE(_description,'')),''),
    COALESCE(NULLIF(btrim(_address_text),''), 'موقع محدد على الخريطة'),
    _lat, _lng, _scheduled_at,
    CASE WHEN _scheduled_at IS NULL THEN 'requested' ELSE 'requested' END
  ) RETURNING * INTO r;

  IF p.owner_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, kind)
    VALUES (p.owner_id, 'طلب خدمة جديد', 'وصلك طلب خدمة: ' || s.name, 'service');
  END IF;

  RETURN r;
END; $$;

-- ===== RPC: change status =====
CREATE OR REPLACE FUNCTION public.change_service_request_status(
  _request_id uuid, _new_status service_request_status, _reason text DEFAULT NULL, _scheduled_at timestamptz DEFAULT NULL
) RETURNS service_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.service_requests; uid uuid := auth.uid(); actor text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO r FROM public.service_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;

  actor := public.service_request_actor(uid, _request_id);
  IF actor IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.is_allowed_service_transition(actor, r.status, _new_status) THEN
    RAISE EXCEPTION 'transition_not_allowed: % -> % (%)', r.status, _new_status, actor;
  END IF;

  UPDATE public.service_requests SET
    status = _new_status,
    scheduled_at = CASE WHEN _new_status = 'scheduled' AND _scheduled_at IS NOT NULL THEN _scheduled_at ELSE scheduled_at END,
    cancel_reason = CASE WHEN _new_status IN ('cancelled','rejected') THEN COALESCE(_reason, cancel_reason) ELSE cancel_reason END,
    completed_at = CASE WHEN _new_status = 'completed' THEN now() ELSE completed_at END
  WHERE id = _request_id RETURNING * INTO r;

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (r.customer_id, 'تحديث طلب الخدمة', 'حالة طلبك #' || r.code || ' صارت: ' || _new_status::text, 'service');

  RETURN r;
END; $$;

-- ===== RPC: rate service =====
CREATE OR REPLACE FUNCTION public.rate_service_request(_request_id uuid, _stars integer, _comment text DEFAULT NULL)
RETURNS service_ratings LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r public.service_requests; rt public.service_ratings;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _stars IS NULL OR _stars < 1 OR _stars > 5 THEN RAISE EXCEPTION 'invalid_stars'; END IF;
  SELECT * INTO r FROM public.service_requests WHERE id = _request_id;
  IF NOT FOUND OR r.customer_id <> uid THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF r.status <> 'completed' THEN RAISE EXCEPTION 'request_not_completed'; END IF;
  IF EXISTS (SELECT 1 FROM public.service_ratings WHERE request_id = _request_id) THEN
    RAISE EXCEPTION 'already_rated';
  END IF;

  INSERT INTO public.service_ratings (request_id, rater_id, provider_id, stars, comment)
  VALUES (_request_id, uid, r.provider_id, _stars, NULLIF(btrim(COALESCE(_comment,'')),''))
  RETURNING * INTO rt;

  UPDATE public.providers SET
    rating = ((rating * ratings_count) + _stars) / (ratings_count + 1),
    ratings_count = ratings_count + 1
  WHERE id = r.provider_id;

  RETURN rt;
END; $$;

-- ===== Seed: categories =====
INSERT INTO public.profession_categories (name, icon, sort_order) VALUES
  ('كهربائي','Zap',1),
  ('سبّاك','Droplets',2),
  ('صيانة تبريد وتكييف','Snowflake',3),
  ('تنظيف منازل','Sparkles',4),
  ('نجار','Hammer',5),
  ('صباغ','PaintRoller',6);

-- ===== Seed: professional providers (Baghdad) =====
WITH c AS (SELECT id FROM public.cities WHERE name = 'بغداد' LIMIT 1)
INSERT INTO public.providers (kind, name, description, keywords, status, is_open, city_id, address_text, lat, lng, phone, profession_category_id, rating, ratings_count)
SELECT 'profession', v.name, v.descr, v.kw, 'approved', true, c.id, v.addr, v.lat, v.lng, v.phone,
       (SELECT id FROM public.profession_categories WHERE name = v.cat), v.rating, v.rc
FROM c, (VALUES
  ('أبو مصطفى للكهربائيات','كهربائي منازل ومولدات، خبرة 15 سنة', ARRAY['كهربائي','كهرباء','مولدة'], 'كهربائي','الكرادة - بغداد', 33.3050, 44.4200, '07701234501', 4.7, 23),
  ('سباكة الرافدين','تصليح تسريبات، مجاري، وسخانات', ARRAY['سباك','سباكة','ماء'], 'سبّاك','الجادرية - بغداد', 33.2760, 44.3800, '07701234502', 4.5, 17),
  ('البرودة الذهبية','صيانة سبليت وثلاجات وتعبئة غاز', ARRAY['تبريد','تكييف','سبلت'], 'صيانة تبريد وتكييف','المنصور - بغداد', 33.3120, 44.3350, '07701234503', 4.8, 31),
  ('نظافة بيتك','تنظيف شقق ومنازل بفريق نسائي ورجالي', ARRAY['تنظيف','خدمة منزلية'], 'تنظيف منازل','زيونة - بغداد', 33.3400, 44.4550, '07701234504', 4.6, 12),
  ('نجارة الوركاء','تفصيل وتصليح أثاث وأبواب', ARRAY['نجار','اثاث','ابواب'], 'نجار','الشعلة - بغداد', 33.3650, 44.3050, '07701234505', 4.4, 9)
) AS v(name, descr, kw, cat, addr, lat, lng, phone, rating, rc);

-- ===== Seed: services =====
INSERT INTO public.provider_services (provider_id, category_id, name, description, price_amount, price_unit, estimated_minutes, sort_order)
SELECT p.id, p.profession_category_id, v.name, v.descr, v.price, v.unit::public.service_price_unit, v.mins, v.so
FROM public.providers p
JOIN (VALUES
  ('أبو مصطفى للكهربائيات','كشف عطل كهربائي','زيارة كشف وتشخيص العطل',15000,'visit',45,1),
  ('أبو مصطفى للكهربائيات','تمديد خط كهرباء جديد','تمديد وتأسيس خط داخلي',35000,'fixed',120,2),
  ('أبو مصطفى للكهربائيات','صيانة مولدة منزلية','فحص وصيانة دورية',25000,'hourly',60,3),
  ('سباكة الرافدين','تصليح تسريب ماء','معالجة التسريبات الداخلية',20000,'visit',60,1),
  ('سباكة الرافدين','تسليك مجاري','تسليك بالماكينة',30000,'fixed',90,2),
  ('البرودة الذهبية','تنظيف سبليت','تنظيف كامل للوحدة الداخلية والخارجية',20000,'fixed',60,1),
  ('البرودة الذهبية','تعبئة غاز مكيف','تعبئة وفحص تسريب',35000,'fixed',75,2),
  ('البرودة الذهبية','صيانة ثلاجة','فحص وتصليح',25000,'visit',60,3),
  ('نظافة بيتك','تنظيف شقة','تنظيف شامل حتى 3 غرف',50000,'fixed',180,1),
  ('نظافة بيتك','تنظيف بالساعة','فريق تنظيف بالساعة',12000,'hourly',60,2),
  ('نجارة الوركاء','تصليح باب خشبي','تصليح أو تبديل مفصلات وأقفال',18000,'visit',60,1),
  ('نجارة الوركاء','تفصيل أثاث حسب الطلب','السعر حسب القياس والمواد',0,'negotiable',NULL,2)
) AS v(pname, name, descr, price, unit, mins, so) ON v.pname = p.name
WHERE p.kind = 'profession';
