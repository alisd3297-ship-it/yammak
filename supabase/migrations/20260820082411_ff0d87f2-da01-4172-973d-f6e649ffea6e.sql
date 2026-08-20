
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ENUMS
CREATE TYPE public.app_role AS ENUM ('super_admin','admin','supervisor','customer','worker','provider');
CREATE TYPE public.worker_kind AS ENUM ('delivery','taxi');
CREATE TYPE public.provider_kind AS ENUM ('restaurant','store','profession');
CREATE TYPE public.provider_status AS ENUM ('pending','approved','suspended','rejected');
CREATE TYPE public.order_type AS ENUM ('restaurant','store','courier','special_delivery','taxi','profession');
CREATE TYPE public.order_status AS ENUM (
  'new','awaiting_provider','accepted','preparing','ready_for_pickup',
  'searching_driver','offered_to_driver','driver_accepted','driver_heading_pickup',
  'picked_up','on_the_way','delivered','completed','cancelled'
);
CREATE TYPE public.offer_status AS ENUM ('sent','accepted','rejected','expired','cancelled');

-- UTILS
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- GEOGRAPHY
CREATE TABLE public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_served boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cities TO anon, authenticated;
GRANT SELECT ON public.areas TO anon, authenticated;
GRANT ALL ON public.cities TO service_role;
GRANT ALL ON public.areas TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.cities TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.areas TO authenticated;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  phone text,
  city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL,
  avatar_url text,
  is_blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id
    AND role IN ('super_admin','admin','supervisor'));
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id
    AND role IN ('super_admin','admin'));
$$;

CREATE POLICY "roles_self_read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "roles_staff_read" ON public.user_roles FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "roles_admin_write" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_staff_read" ON public.profiles FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_staff_update" ON public.profiles FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "cities_public_read" ON public.cities FOR SELECT USING (true);
CREATE POLICY "cities_admin_write" ON public.cities FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "areas_public_read" ON public.areas FOR SELECT USING (true);
CREATE POLICY "areas_admin_write" ON public.areas FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- NEW USER TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- WORKERS
CREATE TABLE public.worker_profiles (
  user_id uuid PRIMARY KEY,
  worker_kind public.worker_kind,
  requested_kind public.worker_kind,
  is_approved boolean NOT NULL DEFAULT false,
  is_available boolean NOT NULL DEFAULT false,
  vehicle text,
  rating numeric(3,2) NOT NULL DEFAULT 0,
  ratings_count int NOT NULL DEFAULT 0,
  city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL,
  max_active_orders int NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.worker_profiles TO authenticated;
GRANT ALL ON public.worker_profiles TO service_role;
ALTER TABLE public.worker_profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_worker_updated BEFORE UPDATE ON public.worker_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "worker_self_read" ON public.worker_profiles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "worker_self_insert" ON public.worker_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "worker_staff_write" ON public.worker_profiles FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
-- worker may only toggle availability / request kind (enforced by trigger below)
CREATE POLICY "worker_self_update" ON public.worker_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_worker_self_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_staff(auth.uid()) THEN RETURN NEW; END IF;
  NEW.worker_kind := OLD.worker_kind;
  NEW.is_approved := OLD.is_approved;
  NEW.max_active_orders := OLD.max_active_orders;
  NEW.rating := OLD.rating;
  NEW.ratings_count := OLD.ratings_count;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_worker_guard BEFORE UPDATE ON public.worker_profiles FOR EACH ROW EXECUTE FUNCTION public.guard_worker_self_update();

CREATE TABLE public.worker_locations (
  user_id uuid PRIMARY KEY,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  is_online boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.worker_locations TO authenticated;
GRANT ALL ON public.worker_locations TO service_role;
ALTER TABLE public.worker_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wloc_self_all" ON public.worker_locations FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));

-- PROVIDERS
CREATE TABLE public.providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid,
  kind public.provider_kind NOT NULL DEFAULT 'restaurant',
  name text NOT NULL,
  description text,
  keywords text[] NOT NULL DEFAULT '{}',
  logo_url text,
  cover_url text,
  status public.provider_status NOT NULL DEFAULT 'pending',
  approval_code text,
  city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL,
  area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  address_text text,
  lat double precision,
  lng double precision,
  phone text,
  is_open boolean NOT NULL DEFAULT true,
  rating numeric(3,2) NOT NULL DEFAULT 0,
  ratings_count int NOT NULL DEFAULT 0,
  orders_count int NOT NULL DEFAULT 0,
  avg_prep_minutes int NOT NULL DEFAULT 20,
  commission_percent numeric(5,2) NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.providers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.providers TO authenticated;
GRANT ALL ON public.providers TO service_role;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_providers_updated BEFORE UPDATE ON public.providers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "providers_public_read" ON public.providers FOR SELECT USING (status = 'approved');
CREATE POLICY "providers_owner_read" ON public.providers FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "providers_owner_insert" ON public.providers FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "providers_owner_update" ON public.providers FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "providers_staff_write" ON public.providers FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.guard_provider_self_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_staff(auth.uid()) THEN RETURN NEW; END IF;
  NEW.status := OLD.status;
  NEW.approval_code := OLD.approval_code;
  NEW.commission_percent := OLD.commission_percent;
  NEW.rating := OLD.rating;
  NEW.ratings_count := OLD.ratings_count;
  NEW.orders_count := OLD.orders_count;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_provider_guard BEFORE UPDATE ON public.providers FOR EACH ROW EXECUTE FUNCTION public.guard_provider_self_update();

CREATE OR REPLACE FUNCTION public.owns_provider(_user_id uuid, _provider_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.providers WHERE id = _provider_id AND owner_id = _user_id);
$$;

-- SERVICES / SECTIONS
CREATE TABLE public.service_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid REFERENCES public.service_sections(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT 'Sparkles',
  image_url text,
  service_type public.order_type NOT NULL DEFAULT 'restaurant',
  route_path text,
  placement text[] NOT NULL DEFAULT ARRAY['home','services'],
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_sections TO anon, authenticated;
GRANT SELECT ON public.services TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_sections TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.service_sections TO service_role;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.service_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sections_public_read" ON public.service_sections FOR SELECT USING (true);
CREATE POLICY "sections_admin_write" ON public.service_sections FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "services_public_read" ON public.services FOR SELECT USING (true);
CREATE POLICY "services_admin_write" ON public.services FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- CATALOG
CREATE TABLE public.menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  image_url text,
  keywords text[] NOT NULL DEFAULT '{}',
  stock int,
  is_available boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.menu_categories TO anon, authenticated;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.menu_categories TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.menu_categories TO service_role;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mcat_public_read" ON public.menu_categories FOR SELECT USING (true);
CREATE POLICY "mcat_owner_write" ON public.menu_categories FOR ALL TO authenticated
  USING (public.owns_provider(auth.uid(), provider_id) OR public.is_staff(auth.uid()))
  WITH CHECK (public.owns_provider(auth.uid(), provider_id) OR public.is_staff(auth.uid()));
CREATE POLICY "products_public_read" ON public.products FOR SELECT USING (true);
CREATE POLICY "products_owner_write" ON public.products FOR ALL TO authenticated
  USING (public.owns_provider(auth.uid(), provider_id) OR public.is_staff(auth.uid()))
  WITH CHECK (public.owns_provider(auth.uid(), provider_id) OR public.is_staff(auth.uid()));

CREATE INDEX idx_products_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX idx_providers_trgm ON public.providers USING gin (name gin_trgm_ops);
CREATE INDEX idx_services_trgm ON public.services USING gin (name gin_trgm_ops);

-- ADDRESSES
CREATE TABLE public.addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL DEFAULT 'عنواني',
  address_text text NOT NULL,
  lat double precision,
  lng double precision,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT ALL ON public.addresses TO service_role;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addr_own" ON public.addresses FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ORDERS
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
  order_type public.order_type NOT NULL DEFAULT 'restaurant',
  status public.order_status NOT NULL DEFAULT 'awaiting_provider',
  customer_id uuid NOT NULL,
  provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  driver_id uuid,
  city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL,
  pickup_text text,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_text text,
  dropoff_lat double precision,
  dropoff_lng double precision,
  notes text,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  name text NOT NULL,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  quantity int NOT NULL DEFAULT 1,
  notes text
);
CREATE TABLE public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status public.order_status NOT NULL,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.delivery_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  status public.offer_status NOT NULL DEFAULT 'sent',
  distance_km numeric(8,2),
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  rejection_reason text
);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT SELECT, INSERT ON public.order_status_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.delivery_offers TO authenticated;
GRANT ALL ON public.orders, public.order_items, public.order_status_history, public.delivery_offers TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_offers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.can_see_order(_user_id uuid, _order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = _order_id AND (
      o.customer_id = _user_id
      OR o.driver_id = _user_id
      OR public.owns_provider(_user_id, o.provider_id)
      OR public.is_staff(_user_id)
      OR EXISTS (SELECT 1 FROM public.delivery_offers f
                 WHERE f.order_id = o.id AND f.driver_id = _user_id AND f.status = 'sent')
    )
  );
$$;

CREATE POLICY "orders_read" ON public.orders FOR SELECT TO authenticated USING (public.can_see_order(auth.uid(), id));
CREATE POLICY "orders_customer_insert" ON public.orders FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
CREATE POLICY "orders_update_involved" ON public.orders FOR UPDATE TO authenticated
  USING (customer_id = auth.uid() OR driver_id = auth.uid() OR public.owns_provider(auth.uid(), provider_id) OR public.is_staff(auth.uid()))
  WITH CHECK (customer_id = auth.uid() OR driver_id = auth.uid() OR public.owns_provider(auth.uid(), provider_id) OR public.is_staff(auth.uid()));

CREATE POLICY "items_read" ON public.order_items FOR SELECT TO authenticated USING (public.can_see_order(auth.uid(), order_id));
CREATE POLICY "items_insert" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_id = auth.uid()));
CREATE POLICY "hist_read" ON public.order_status_history FOR SELECT TO authenticated USING (public.can_see_order(auth.uid(), order_id));
CREATE POLICY "hist_insert" ON public.order_status_history FOR INSERT TO authenticated WITH CHECK (public.can_see_order(auth.uid(), order_id));
CREATE POLICY "offers_read" ON public.delivery_offers FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR public.is_staff(auth.uid()) OR public.can_see_order(auth.uid(), order_id));
CREATE POLICY "offers_driver_update" ON public.delivery_offers FOR UPDATE TO authenticated
  USING (driver_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (driver_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "offers_staff_insert" ON public.delivery_offers FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_order_status() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (NEW.id, NEW.status, auth.uid());
    IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_order_status_ins AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_order_status();
CREATE TRIGGER trg_order_status_upd BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_order_status();

-- RATINGS
CREATE TABLE public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('provider','driver','customer')),
  target_id uuid NOT NULL,
  stars int NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, rater_id, target_type)
);
GRANT SELECT, INSERT ON public.ratings TO authenticated;
GRANT ALL ON public.ratings TO service_role;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ratings_read" ON public.ratings FOR SELECT TO authenticated USING (rater_id = auth.uid() OR public.is_staff(auth.uid()) OR public.can_see_order(auth.uid(), order_id));
CREATE POLICY "ratings_insert" ON public.ratings FOR INSERT TO authenticated
  WITH CHECK (rater_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND o.status IN ('completed','delivered')
      AND (o.customer_id = auth.uid() OR public.owns_provider(auth.uid(), o.provider_id) OR o.driver_id = auth.uid())));

CREATE OR REPLACE FUNCTION public.apply_rating() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.target_type = 'provider' THEN
    UPDATE public.providers SET
      rating = ((rating * ratings_count) + NEW.stars) / (ratings_count + 1),
      ratings_count = ratings_count + 1
    WHERE id = NEW.target_id;
  ELSIF NEW.target_type = 'driver' THEN
    UPDATE public.worker_profiles SET
      rating = ((rating * ratings_count) + NEW.stars) / (ratings_count + 1),
      ratings_count = ratings_count + 1
    WHERE user_id = NEW.target_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_apply_rating AFTER INSERT ON public.ratings FOR EACH ROW EXECUTE FUNCTION public.apply_rating();

-- NOTIFICATIONS / AUDIT / SETTINGS / PRICING
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  kind text NOT NULL DEFAULT 'general',
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_own" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "notif_own_update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notif_insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_staff_read" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "audit_staff_insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_read" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "settings_admin_write" ON public.app_settings FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  order_type public.order_type NOT NULL DEFAULT 'restaurant',
  city_id uuid REFERENCES public.cities(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.providers(id) ON DELETE CASCADE,
  base_fee numeric(12,2) NOT NULL DEFAULT 0,
  per_km_fee numeric(12,2) NOT NULL DEFAULT 0,
  min_fee numeric(12,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  target_type text NOT NULL DEFAULT 'provider',
  target_id uuid,
  order_type public.order_type,
  percent numeric(5,2) NOT NULL DEFAULT 0,
  fixed_amount numeric(12,2) NOT NULL DEFAULT 0,
  subscription_amount numeric(12,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pricing_rules TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pricing_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_rules TO authenticated;
GRANT ALL ON public.pricing_rules, public.commission_rules TO service_role;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing_read" ON public.pricing_rules FOR SELECT USING (true);
CREATE POLICY "pricing_admin" ON public.pricing_rules FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "commission_staff_read" ON public.commission_rules FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "commission_admin" ON public.commission_rules FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- REALTIME
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.delivery_offers REPLICA IDENTITY FULL;
ALTER TABLE public.worker_locations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_offers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.worker_locations;

-- SEED
INSERT INTO public.cities (name, sort_order) VALUES ('بغداد', 1);
INSERT INTO public.areas (city_id, name, sort_order)
SELECT id, a.name, a.ord FROM public.cities c,
  (VALUES ('الكرادة',1),('المنصور',2),('الجادرية',3),('زيونة',4),('الأعظمية',5),('الكاظمية',6)) AS a(name, ord)
WHERE c.name = 'بغداد';

INSERT INTO public.service_sections (name, sort_order) VALUES
  ('الطعام والتسوق', 1), ('التوصيل والنقل', 2), ('الخدمات العامة', 3);

INSERT INTO public.services (section_id, name, description, icon, service_type, route_path, sort_order)
SELECT s.id, v.name, v.descr, v.icon, v.stype::public.order_type, v.route, v.ord
FROM (VALUES
  ('الطعام والتسوق','طلبات المطاعم','اطلب أكلك المفضل ويوصلك للباب','UtensilsCrossed','restaurant','/restaurants',1),
  ('الطعام والتسوق','المنتجات والمتاجر','كل حاجيات البيت من متاجر قريبة','ShoppingBag','store','/stores',2),
  ('التوصيل والنقل','اطلب مندوب','مندوب ينجز مشوارك بسرعة','Bike','courier','/courier',1),
  ('التوصيل والنقل','التوصيل الخاص','توصيل خاص حسب طبيعة المهمة','PackageCheck','special_delivery','/special-delivery',2),
  ('التوصيل والنقل','اطلب تكسي','سيارة توصلك لوجهتك','Car','taxi','/taxi',3),
  ('الخدمات العامة','مهن وخدمات','كهربائي، سباك، نجار وغيرهم','Wrench','profession','/professions',1)
) AS v(section, name, descr, icon, stype, route, ord)
JOIN public.service_sections s ON s.name = v.section;

INSERT INTO public.app_settings (key, value) VALUES
  ('driver_offer_timeout_seconds', '120'::jsonb),
  ('driver_location_max_age_minutes', '10'::jsonb),
  ('max_offer_radius_km', '15'::jsonb),
  ('rejection_reasons', '["مشغول","المسافة بعيدة","عطل فني","وقت استراحة","سبب آخر"]'::jsonb),
  ('default_delivery_fee', '3000'::jsonb),
  ('currency', '"د.ع"'::jsonb);
