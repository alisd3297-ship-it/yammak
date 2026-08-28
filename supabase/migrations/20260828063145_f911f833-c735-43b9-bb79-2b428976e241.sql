-- 1) محادثة داخل الطلب
CREATE TABLE public.order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_messages_order_idx ON public.order_messages(order_id, created_at);
GRANT SELECT, INSERT ON public.order_messages TO authenticated;
GRANT ALL ON public.order_messages TO service_role;
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order parties read messages" ON public.order_messages
  FOR SELECT TO authenticated USING (public.can_see_order(auth.uid(), order_id));
CREATE POLICY "order parties send messages" ON public.order_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.can_see_order(auth.uid(), order_id));
ALTER TABLE public.order_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;

-- 2) اطلب أي شي
CREATE TABLE public.custom_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL DEFAULT auth.uid(),
  raw_text text NOT NULL CHECK (length(btrim(raw_text)) BETWEEN 3 AND 4000),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  address_text text NOT NULL DEFAULT '',
  lat double precision,
  lng double precision,
  notes text,
  budget numeric,
  currency text NOT NULL DEFAULT 'IQD',
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft','submitted','converted','cancelled','rejected')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX custom_requests_customer_idx ON public.custom_requests(customer_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.custom_requests TO authenticated;
GRANT ALL ON public.custom_requests TO service_role;
ALTER TABLE public.custom_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers manage own custom requests" ON public.custom_requests
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "customers create custom requests" ON public.custom_requests
  FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
CREATE POLICY "customers update own custom requests" ON public.custom_requests
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (customer_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE TRIGGER custom_requests_touch BEFORE UPDATE ON public.custom_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) العروض القريبة
CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 120),
  description text,
  discount_percent numeric NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 90),
  image_url text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promotions_active_idx ON public.promotions(is_active, starts_at, ends_at);
GRANT SELECT ON public.promotions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotions TO authenticated;
GRANT ALL ON public.promotions TO service_role;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "active promotions are public" ON public.promotions
  FOR SELECT USING (
    is_active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
  );
CREATE POLICY "providers read own promotions" ON public.promotions
  FOR SELECT TO authenticated
  USING (public.owns_provider(auth.uid(), provider_id) OR public.is_staff(auth.uid()));
CREATE POLICY "providers manage own promotions" ON public.promotions
  FOR ALL TO authenticated
  USING (public.owns_provider(auth.uid(), provider_id) OR public.is_staff(auth.uid()))
  WITH CHECK (public.owns_provider(auth.uid(), provider_id) OR public.is_staff(auth.uid()));
CREATE TRIGGER promotions_touch BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) لبابك بلس
CREATE TABLE public.plus_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan text NOT NULL DEFAULT 'monthly' CHECK (plan IN ('monthly','yearly')),
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','active','expired','cancelled')),
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IQD',
  payment_id uuid,
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plus_subscriptions_user_idx ON public.plus_subscriptions(user_id, status);
GRANT SELECT, INSERT ON public.plus_subscriptions TO authenticated;
GRANT ALL ON public.plus_subscriptions TO service_role;
ALTER TABLE public.plus_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own subscriptions" ON public.plus_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "users request own subscription" ON public.plus_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending_payment');
CREATE TRIGGER plus_subscriptions_touch BEFORE UPDATE ON public.plus_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5) الإحالات
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text;

CREATE OR REPLACE FUNCTION public.gen_referral_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c text;
BEGIN
  LOOP
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    IF length(c) = 6 AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = c) THEN
      RETURN c;
    END IF;
  END LOOP;
END $$;

UPDATE public.profiles SET referral_code = public.gen_referral_code() WHERE referral_code IS NULL;

CREATE OR REPLACE FUNCTION public.set_referral_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN NEW.referral_code := public.gen_referral_code(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_referral_code BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_referral_code();

CREATE UNIQUE INDEX profiles_referral_code_key ON public.profiles(referral_code);

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referee_id uuid NOT NULL UNIQUE,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','rewarded','void')),
  reward_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IQD',
  rewarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (referrer_id <> referee_id)
);
CREATE INDEX referrals_referrer_idx ON public.referrals(referrer_id, created_at DESC);
GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own referrals" ON public.referrals
  FOR SELECT TO authenticated
  USING (referrer_id = auth.uid() OR referee_id = auth.uid() OR public.is_staff(auth.uid()));

-- تسجيل إحالة: المدعو فقط يقدر يسجل كوده مرة واحدة
CREATE OR REPLACE FUNCTION public.redeem_referral(_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _ref uuid; _clean text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  _clean := upper(btrim(coalesce(_code,'')));
  IF _clean = '' THEN RAISE EXCEPTION 'invalid_code'; END IF;
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referee_id = _uid) THEN
    RAISE EXCEPTION 'referral_already_used';
  END IF;
  SELECT id INTO _ref FROM public.profiles WHERE referral_code = _clean;
  IF _ref IS NULL THEN RAISE EXCEPTION 'invalid_code'; END IF;
  IF _ref = _uid THEN RAISE EXCEPTION 'self_referral'; END IF;
  INSERT INTO public.referrals (referrer_id, referee_id, code) VALUES (_ref, _uid, _clean);
  RETURN jsonb_build_object('ok', true, 'referrer_id', _ref);
END $$;
REVOKE ALL ON FUNCTION public.redeem_referral(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.redeem_referral(text) TO authenticated;

-- 6) إحصائيات لوحة التاجر
CREATE OR REPLACE FUNCTION public.provider_dashboard_stats(_provider_id uuid, _days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _from timestamptz := now() - make_interval(days => greatest(coalesce(_days,30),1));
        _res jsonb;
BEGIN
  IF NOT (public.owns_provider(auth.uid(), _provider_id) OR public.is_staff(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'orders_total', count(*),
    'orders_completed', count(*) FILTER (WHERE status = 'completed'),
    'orders_cancelled', count(*) FILTER (WHERE status = 'cancelled'),
    'orders_active', count(*) FILTER (WHERE status NOT IN ('completed','cancelled')),
    'revenue', coalesce(sum(subtotal) FILTER (WHERE status = 'completed'), 0),
    'avg_ticket', coalesce(round(avg(subtotal) FILTER (WHERE status = 'completed'), 2), 0)
  ) INTO _res
  FROM public.orders WHERE provider_id = _provider_id AND created_at >= _from;

  RETURN _res || jsonb_build_object(
    'top_products', coalesce((
      SELECT jsonb_agg(t) FROM (
        SELECT oi.name, sum(oi.quantity)::int AS quantity,
               sum(oi.quantity * oi.unit_price) AS revenue
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE o.provider_id = _provider_id AND o.created_at >= _from
          AND o.status <> 'cancelled'
        GROUP BY oi.name ORDER BY sum(oi.quantity) DESC LIMIT 5
      ) t), '[]'::jsonb),
    'daily', coalesce((
      SELECT jsonb_agg(d ORDER BY d->>'day') FROM (
        SELECT jsonb_build_object(
          'day', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
          'orders', count(*),
          'revenue', coalesce(sum(subtotal) FILTER (WHERE status = 'completed'), 0)
        ) AS d
        FROM public.orders
        WHERE provider_id = _provider_id AND created_at >= _from
        GROUP BY date_trunc('day', created_at)
      ) x), '[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.provider_dashboard_stats(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.provider_dashboard_stats(uuid, integer) TO authenticated;