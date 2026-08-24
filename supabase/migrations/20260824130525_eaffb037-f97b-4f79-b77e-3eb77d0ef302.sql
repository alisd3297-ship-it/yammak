-- ============ المرحلة 0: مفاتيح الميزات ============
CREATE TABLE public.feature_flags (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  phase integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT false,
  rollout_percent integer NOT NULL DEFAULT 100 CHECK (rollout_percent BETWEEN 0 AND 100),
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.feature_flags TO anon;
GRANT SELECT ON public.feature_flags TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_flags_read_all" ON public.feature_flags
  FOR SELECT USING (true);
CREATE POLICY "feature_flags_staff_write" ON public.feature_flags
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_feature_flags_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_table_change();

-- دالة الفحص: مغلق افتراضياً لكل مفتاح غير موجود
CREATE OR REPLACE FUNCTION public.feature_enabled(_key text, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE f public.feature_flags;
BEGIN
  SELECT * INTO f FROM public.feature_flags WHERE key = _key;
  IF NOT FOUND OR NOT f.is_enabled THEN RETURN false; END IF;
  IF f.audience = 'staff' THEN
    RETURN _user_id IS NOT NULL AND public.is_staff(_user_id);
  END IF;
  IF f.rollout_percent >= 100 THEN RETURN true; END IF;
  IF f.rollout_percent <= 0 THEN RETURN false; END IF;
  IF _user_id IS NULL THEN RETURN false; END IF;
  RETURN (abs(hashtext(_key || ':' || _user_id::text)) % 100) < f.rollout_percent;
END; $$;

REVOKE ALL ON FUNCTION public.feature_enabled(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feature_enabled(text, uuid) TO anon, authenticated, service_role;

-- ============ المرحلة 0: قواعد الرسوم والضرائب ============
CREATE TABLE public.fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'service_fee' CHECK (kind IN ('tax','service_fee','platform_fee')),
  order_type order_type,
  city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL,
  percent numeric NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  fixed_amount numeric NOT NULL DEFAULT 0 CHECK (fixed_amount >= 0),
  currency text NOT NULL DEFAULT 'IQD',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fee_rules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_rules TO authenticated;
GRANT ALL ON public.fee_rules TO service_role;

ALTER TABLE public.fee_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fee_rules_read_active" ON public.fee_rules
  FOR SELECT USING (is_active OR public.is_staff(auth.uid()));
CREATE POLICY "fee_rules_staff_write" ON public.fee_rules
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_fee_rules_updated_at
  BEFORE UPDATE ON public.fee_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_fee_rules_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.fee_rules
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_table_change();

-- حاسبة الرسوم: صفر تماماً عندما يكون المفتاح مغلقاً (لا تغيير في السلوك الحالي)
CREATE OR REPLACE FUNCTION public.compute_fees(
  _order_type order_type,
  _city_id uuid,
  _amount numeric,
  _currency text DEFAULT 'IQD'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric := 0;
  v_lines jsonb := '[]'::jsonb;
  r record;
  v_val numeric;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('enabled', false, 'total', 0, 'lines', v_lines);
  END IF;
  IF NOT public.feature_enabled('fees_and_taxes') THEN
    RETURN jsonb_build_object('enabled', false, 'total', 0, 'lines', v_lines);
  END IF;

  FOR r IN
    SELECT * FROM public.fee_rules
     WHERE is_active
       AND currency = COALESCE(_currency,'IQD')
       AND (order_type IS NULL OR order_type = _order_type)
       AND (city_id IS NULL OR city_id = _city_id)
     ORDER BY sort_order, created_at
  LOOP
    v_val := round(_amount * r.percent / 100.0) + r.fixed_amount;
    IF v_val > 0 THEN
      v_total := v_total + v_val;
      v_lines := v_lines || jsonb_build_object('name', r.name, 'kind', r.kind, 'amount', v_val);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('enabled', true, 'total', v_total, 'lines', v_lines);
END; $$;

REVOKE ALL ON FUNCTION public.compute_fees(order_type, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_fees(order_type, uuid, numeric, text) TO authenticated, service_role;

-- ============ إعدادات مركزية ============
INSERT INTO public.app_settings (key, value) VALUES
  ('display_fx', '{"usd_to_iqd": 1310}'::jsonb),
  ('wallet', '{"max_balance": 5000000, "min_topup": 1000}'::jsonb),
  ('settlements', '{"period_days": 7, "auto_generate": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============ تسجيل مفاتيح كل الميزات القادمة (مغلقة) ============
INSERT INTO public.feature_flags (key, label, description, phase) VALUES
  ('fees_and_taxes', 'الرسوم والضرائب', 'تطبيق قواعد الرسوم والضرائب على الإجماليات', 0),
  ('wallet', 'محفظة يمّك', 'رصيد المستخدم وحركاته والدفع من المحفظة', 1),
  ('refund_requests', 'طلبات الاسترجاع', 'تقديم الزبون لطلب استرجاع ومراجعته إدارياً', 1),
  ('settlements', 'التسويات المالية', 'تسويات التجار والمندوبين والصرفيات', 1),
  ('invoices', 'الفواتير والإيصالات', 'إصدار فاتورة لكل طلب مكتمل', 1),
  ('driver_earnings', 'أرباح المندوب', 'لوحة تفصيلية لأرباح المندوب', 1),
  ('provider_finance', 'مالية التاجر', 'لوحة مالية لمقدم الخدمة', 1),
  ('coupons', 'الكوبونات والقسائم', 'أكواد خصم على الطلبات', 2),
  ('loyalty', 'نقاط الولاء', 'نقاط ومكافآت', 2),
  ('subscriptions', 'يمّك Plus', 'اشتراك شهري بمزايا', 2),
  ('referrals', 'إحالة الأصدقاء', 'دعوة الأصدقاء ومكافأتها', 2),
  ('customer_tiers', 'مستويات VIP', 'مستويات العملاء ومزاياها', 2),
  ('promotions', 'العروض المتقدمة', 'عروض حسب المنطقة والوقت والمستخدم', 2),
  ('product_modifiers', 'إضافات المنتجات', 'خيارات وإضافات على المنتجات', 3),
  ('inventory_advanced', 'مخزون متقدم', 'جرد وحركات مخزون وتنبيهات', 3),
  ('service_quotes', 'عروض أسعار الخدمات', 'تفاوض وعروض أسعار للخدمات', 3),
  ('dispatch_advanced', 'توزيع ذكي متقدم', 'مناطق ومناوبات وتجميع طلبات', 4),
  ('proof_of_delivery', 'إثبات التسليم', 'صور وتوقيع وOTP عند التسليم', 4),
  ('live_ops', 'مركز العمليات المباشر', 'خريطة ولوحة لحظية للإدارة', 4),
  ('chat', 'الدردشة', 'دردشة داخل الطلب ومع مقدم الخدمة', 5),
  ('support_tickets', 'مركز الدعم', 'تذاكر دعم وشكاوى', 5),
  ('disputes', 'إدارة النزاعات', 'نزاعات الطلبات ومعالجتها', 5),
  ('provider_branches', 'فروع التاجر', 'إدارة فروع متعددة', 6),
  ('provider_staff', 'موظفو التاجر', 'صلاحيات موظفي مقدم الخدمة', 6),
  ('kds', 'شاشة المطبخ', 'شاشة تحضير الطلبات للمطاعم', 6),
  ('personalization', 'التخصيص والاكتشاف', 'مفضلة وتوصيات وبحث متقدم', 7),
  ('ai_assistant', 'المساعد الذكي', 'مساعد ذكاء اصطناعي وبحث بلغة طبيعية', 8),
  ('fraud_detection', 'مكافحة الاحتيال', 'إشارات خطر وكشف الطلبات الوهمية', 9),
  ('crm', 'CRM للعملاء', 'سجل تفاعل العميل وحملات الاسترجاع', 9)
ON CONFLICT (key) DO NOTHING;