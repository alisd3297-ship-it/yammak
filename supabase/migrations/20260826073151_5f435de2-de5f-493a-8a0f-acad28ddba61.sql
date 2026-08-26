-- =========================
-- قوائم الزبائن لدى المحلات
-- =========================
CREATE TABLE public.customer_tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  delivery_fee numeric NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  currency text NOT NULL DEFAULT 'IQD',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, customer_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_tabs TO authenticated;
GRANT ALL ON public.customer_tabs TO service_role;
ALTER TABLE public.customer_tabs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.customer_tab_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id uuid NOT NULL REFERENCES public.customer_tabs(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_tab_items TO authenticated;
GRANT ALL ON public.customer_tab_items TO service_role;
ALTER TABLE public.customer_tab_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.customer_tab_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id uuid NOT NULL REFERENCES public.customer_tabs(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_tab_payments TO authenticated;
GRANT ALL ON public.customer_tab_payments TO service_role;
ALTER TABLE public.customer_tab_payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX customer_tabs_customer_idx ON public.customer_tabs (customer_id);
CREATE INDEX customer_tab_items_tab_idx ON public.customer_tab_items (tab_id);
CREATE INDEX customer_tab_payments_tab_idx ON public.customer_tab_payments (tab_id);

-- =========================
-- دوال الصلاحيات
-- =========================
CREATE OR REPLACE FUNCTION public.can_manage_tab(_tab_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customer_tabs t
    WHERE t.id = _tab_id
      AND (public.owns_provider(auth.uid(), t.provider_id) OR public.is_staff(auth.uid()))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_see_tab(_tab_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customer_tabs t
    WHERE t.id = _tab_id
      AND (
        t.customer_id = auth.uid()
        OR public.owns_provider(auth.uid(), t.provider_id)
        OR public.is_staff(auth.uid())
      )
  );
$$;

-- =========================
-- السياسات
-- =========================
CREATE POLICY "tabs_select" ON public.customer_tabs FOR SELECT TO authenticated
USING (
  customer_id = auth.uid()
  OR public.owns_provider(auth.uid(), provider_id)
  OR public.is_staff(auth.uid())
);

CREATE POLICY "tabs_insert" ON public.customer_tabs FOR INSERT TO authenticated
WITH CHECK (public.owns_provider(auth.uid(), provider_id) OR public.is_staff(auth.uid()));

CREATE POLICY "tabs_update" ON public.customer_tabs FOR UPDATE TO authenticated
USING (public.owns_provider(auth.uid(), provider_id) OR public.is_staff(auth.uid()))
WITH CHECK (public.owns_provider(auth.uid(), provider_id) OR public.is_staff(auth.uid()));

CREATE POLICY "tabs_delete" ON public.customer_tabs FOR DELETE TO authenticated
USING (public.owns_provider(auth.uid(), provider_id) OR public.is_staff(auth.uid()));

CREATE POLICY "tab_items_select" ON public.customer_tab_items FOR SELECT TO authenticated
USING (public.can_see_tab(tab_id));

CREATE POLICY "tab_items_write" ON public.customer_tab_items FOR ALL TO authenticated
USING (public.can_manage_tab(tab_id))
WITH CHECK (public.can_manage_tab(tab_id));

CREATE POLICY "tab_payments_select" ON public.customer_tab_payments FOR SELECT TO authenticated
USING (public.can_see_tab(tab_id));

CREATE POLICY "tab_payments_write" ON public.customer_tab_payments FOR ALL TO authenticated
USING (public.can_manage_tab(tab_id))
WITH CHECK (public.can_manage_tab(tab_id));

-- =========================
-- منع الرصيد السالب
-- =========================
CREATE OR REPLACE FUNCTION public.guard_tab_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due numeric;
  v_paid numeric;
BEGIN
  SELECT COALESCE((SELECT SUM(i.quantity * i.unit_price) FROM public.customer_tab_items i WHERE i.tab_id = NEW.tab_id), 0)
       + COALESCE((SELECT t.delivery_fee FROM public.customer_tabs t WHERE t.id = NEW.tab_id), 0)
  INTO v_due;

  SELECT COALESCE(SUM(p.amount), 0) INTO v_paid
  FROM public.customer_tab_payments p
  WHERE p.tab_id = NEW.tab_id AND (TG_OP = 'INSERT' OR p.id <> NEW.id);

  IF v_paid + NEW.amount > v_due + 0.0001 THEN
    RAISE EXCEPTION 'المبلغ المستحصل يتجاوز المبلغ المستحق';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_tab_payment_trg
BEFORE INSERT OR UPDATE ON public.customer_tab_payments
FOR EACH ROW EXECUTE FUNCTION public.guard_tab_payment();

CREATE TRIGGER customer_tabs_updated_at
BEFORE UPDATE ON public.customer_tabs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER customer_tab_items_updated_at
BEFORE UPDATE ON public.customer_tab_items
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================
-- إنشاء/جلب قائمة الزبون
-- =========================
CREATE OR REPLACE FUNCTION public.ensure_customer_tab(_provider_id uuid, _customer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT (public.owns_provider(auth.uid(), _provider_id) OR public.is_staff(auth.uid())) THEN
    RAISE EXCEPTION 'غير مخوّل';
  END IF;

  SELECT id INTO v_id FROM public.customer_tabs
  WHERE provider_id = _provider_id AND customer_id = _customer_id;

  IF v_id IS NULL THEN
    INSERT INTO public.customer_tabs (provider_id, customer_id)
    VALUES (_provider_id, _customer_id) RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_customer_tab(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_customer_tab(uuid, uuid) TO authenticated;