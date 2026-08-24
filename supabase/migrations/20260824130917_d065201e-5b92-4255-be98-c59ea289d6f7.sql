-- ================= المحفظة =================
CREATE TABLE public.wallets (
  user_id uuid PRIMARY KEY,
  balance numeric NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency text NOT NULL DEFAULT 'IQD',
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallets_own_read" ON public.wallets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('credit','debit')),
  amount numeric NOT NULL CHECK (amount > 0),
  balance_after numeric NOT NULL,
  currency text NOT NULL DEFAULT 'IQD',
  reason text NOT NULL,
  subject_type text,
  subject_id uuid,
  idempotency_key text NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_tx_user ON public.wallet_transactions (user_id, created_at DESC);

GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_tx_own_read" ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

-- حركة محفظة ذرية: تُستدعى فقط من دوال موثوقة
CREATE OR REPLACE FUNCTION public.wallet_apply(
  _user_id uuid,
  _direction text,
  _amount numeric,
  _reason text,
  _idempotency_key text,
  _subject_type text DEFAULT NULL,
  _subject_id uuid DEFAULT NULL,
  _actor_id uuid DEFAULT NULL
) RETURNS public.wallet_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE w public.wallets; tx public.wallet_transactions; new_balance numeric;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF _direction NOT IN ('credit','debit') THEN RAISE EXCEPTION 'invalid_direction'; END IF;

  SELECT * INTO tx FROM public.wallet_transactions WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN RETURN tx; END IF;

  INSERT INTO public.wallets (user_id) VALUES (_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO w FROM public.wallets WHERE user_id = _user_id FOR UPDATE;

  IF w.is_locked THEN RAISE EXCEPTION 'wallet_locked'; END IF;

  new_balance := CASE WHEN _direction = 'credit' THEN w.balance + _amount ELSE w.balance - _amount END;
  IF new_balance < 0 THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  UPDATE public.wallets SET balance = new_balance WHERE user_id = _user_id;

  INSERT INTO public.wallet_transactions
    (user_id, direction, amount, balance_after, reason, subject_type, subject_id, idempotency_key, created_by)
  VALUES (_user_id, _direction, _amount, new_balance, _reason, _subject_type, _subject_id, _idempotency_key, _actor_id)
  RETURNING * INTO tx;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
  VALUES (_actor_id, 'wallet_' || _direction, 'wallets', tx.id,
          jsonb_build_object('user_id', _user_id, 'amount', _amount, 'reason', _reason, 'balance_after', new_balance));

  RETURN tx;
END; $$;

REVOKE ALL ON FUNCTION public.wallet_apply(uuid, text, numeric, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_apply(uuid, text, numeric, text, text, text, uuid, uuid) TO service_role;

-- إيداع/سحب إداري
CREATE OR REPLACE FUNCTION public.wallet_admin_adjust(
  _user_id uuid, _direction text, _amount numeric, _reason text, _idempotency_key text
) RETURNS public.wallet_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.feature_enabled('wallet', auth.uid()) THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  RETURN public.wallet_apply(_user_id, _direction, _amount, COALESCE(_reason,'admin_adjust'),
                             _idempotency_key, 'admin', NULL, auth.uid());
END; $$;

REVOKE ALL ON FUNCTION public.wallet_admin_adjust(uuid, text, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_admin_adjust(uuid, text, numeric, text, text) TO authenticated, service_role;

-- دفع طلب/رحلة/خدمة من المحفظة
CREATE OR REPLACE FUNCTION public.wallet_pay_subject(
  _subject_type payment_subject, _subject_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE info record; uid uuid := auth.uid(); tx public.wallet_transactions; pay public.payments;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.feature_enabled('wallet', uid) THEN RAISE EXCEPTION 'feature_disabled'; END IF;

  SELECT * INTO info FROM public.payment_subject_info(_subject_type, _subject_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'subject_not_found'; END IF;
  IF info.owner_id <> uid THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF info.is_terminal THEN RAISE EXCEPTION 'subject_not_payable'; END IF;
  IF COALESCE(info.amount,0) <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT * INTO pay FROM public.payments
   WHERE subject_type = _subject_type AND subject_id = _subject_id AND status = 'succeeded' LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'already_paid'; END IF;

  tx := public.wallet_apply(uid, 'debit', info.amount, 'payment',
        'wallet:' || _subject_type::text || ':' || _subject_id::text, _subject_type::text, _subject_id, uid);

  INSERT INTO public.payments
    (user_id, subject_type, subject_id, method, provider, amount, currency, status,
     idempotency_key, metadata, paid_at)
  VALUES (uid, _subject_type, _subject_id, 'wallet', 'wallet', info.amount, 'IQD', 'succeeded',
          'wallet:' || _subject_type::text || ':' || _subject_id::text,
          jsonb_build_object('wallet_tx', tx.id), now())
  ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = now()
  RETURNING * INTO pay;

  INSERT INTO public.notifications (user_id, title, body, kind, order_id)
  VALUES (uid, 'تم الدفع من المحفظة',
          'خُصم مبلغ ' || info.amount::text || ' د.ع من محفظتك', 'payment',
          CASE WHEN _subject_type = 'order' THEN _subject_id ELSE NULL END);

  RETURN jsonb_build_object('ok', true, 'payment_id', pay.id, 'balance_after', tx.balance_after);
END; $$;

REVOKE ALL ON FUNCTION public.wallet_pay_subject(payment_subject, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_pay_subject(payment_subject, uuid) TO authenticated, service_role;

-- ================= طلبات الاسترجاع =================
CREATE TABLE public.refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'IQD',
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','processed')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  refund_target text NOT NULL DEFAULT 'provider' CHECK (refund_target IN ('provider','wallet')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_refund_requests_open
  ON public.refund_requests (payment_id) WHERE status IN ('pending','approved');

GRANT SELECT ON public.refund_requests TO authenticated;
GRANT ALL ON public.refund_requests TO service_role;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refund_requests_own_read" ON public.refund_requests
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.is_staff(auth.uid()));

CREATE TRIGGER trg_refund_requests_updated_at
  BEFORE UPDATE ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_refund_requests_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_table_change();

CREATE OR REPLACE FUNCTION public.create_refund_request(
  _payment_id uuid, _amount numeric, _reason text
) RETURNS public.refund_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE p public.payments; uid uuid := auth.uid(); want numeric; r public.refund_requests;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.feature_enabled('refund_requests', uid) THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN RAISE EXCEPTION 'reason_too_short'; END IF;

  SELECT * INTO p FROM public.payments WHERE id = _payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_not_found'; END IF;
  IF p.user_id <> uid THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p.status <> 'succeeded' THEN RAISE EXCEPTION 'payment_not_refundable'; END IF;

  want := LEAST(COALESCE(_amount, p.amount - COALESCE(p.refunded_amount,0)),
                p.amount - COALESCE(p.refunded_amount,0));
  IF want <= 0 THEN RAISE EXCEPTION 'invalid_refund_amount'; END IF;

  INSERT INTO public.refund_requests (payment_id, requested_by, amount, currency, reason)
  VALUES (p.id, uid, want, p.currency, btrim(_reason))
  RETURNING * INTO r;
  RETURN r;
END; $$;

REVOKE ALL ON FUNCTION public.create_refund_request(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_refund_request(uuid, numeric, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.decide_refund_request(
  _request_id uuid, _approve boolean, _note text DEFAULT NULL, _to_wallet boolean DEFAULT false
) RETURNS public.refund_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.refund_requests; p public.payments;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO r FROM public.refund_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'already_decided'; END IF;

  IF NOT _approve THEN
    UPDATE public.refund_requests SET status = 'rejected', decided_by = auth.uid(),
      decided_at = now(), decision_note = _note
    WHERE id = r.id RETURNING * INTO r;
    RETURN r;
  END IF;

  SELECT * INTO p FROM public.payments WHERE id = r.payment_id;

  IF _to_wallet THEN
    PERFORM public.wallet_apply(p.user_id, 'credit', r.amount, 'refund',
      'refund:' || r.id::text, 'refund_request', r.id, auth.uid());
    PERFORM public.record_payment_refund(p.id, r.amount, COALESCE(_note,'wallet_refund'));
    UPDATE public.refund_requests SET status = 'processed', refund_target = 'wallet',
      decided_by = auth.uid(), decided_at = now(), decision_note = _note
    WHERE id = r.id RETURNING * INTO r;
  ELSE
    PERFORM public.request_payment_refund(p.id, r.amount, COALESCE(_note, r.reason));
    UPDATE public.refund_requests SET status = 'approved', refund_target = 'provider',
      decided_by = auth.uid(), decided_at = now(), decision_note = _note
    WHERE id = r.id RETURNING * INTO r;
  END IF;

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (p.user_id, 'تحديث طلب الاسترجاع',
          'تمت الموافقة على استرجاع ' || r.amount::text || ' د.ع', 'payment');

  RETURN r;
END; $$;

REVOKE ALL ON FUNCTION public.decide_refund_request(uuid, boolean, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_refund_request(uuid, boolean, text, boolean) TO authenticated, service_role;

-- ================= التسويات =================
CREATE TABLE public.settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_type text NOT NULL CHECK (party_type IN ('provider','driver')),
  party_id uuid NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  currency text NOT NULL DEFAULT 'IQD',
  gross numeric NOT NULL DEFAULT 0,
  commission numeric NOT NULL DEFAULT 0,
  delivery_fees numeric NOT NULL DEFAULT 0,
  adjustments numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  items_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid','cancelled')),
  notes text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_settlements_party ON public.settlements (party_type, party_id, period_end DESC);

GRANT SELECT ON public.settlements TO authenticated;
GRANT ALL ON public.settlements TO service_role;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settlements_read_party_or_staff" ON public.settlements
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR (party_type = 'driver' AND party_id = auth.uid())
    OR (party_type = 'provider' AND public.owns_provider(auth.uid(), party_id))
  );

CREATE TRIGGER trg_settlements_updated_at
  BEFORE UPDATE ON public.settlements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_settlements_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.settlements
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_table_change();

CREATE TABLE public.settlement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('order','trip','service_request')),
  subject_id uuid NOT NULL,
  label text NOT NULL,
  gross numeric NOT NULL DEFAULT 0,
  commission numeric NOT NULL DEFAULT 0,
  delivery_fee numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (settlement_id, subject_type, subject_id)
);

GRANT SELECT ON public.settlement_items TO authenticated;
GRANT ALL ON public.settlement_items TO service_role;
ALTER TABLE public.settlement_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settlement_items_read_via_settlement" ON public.settlement_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.settlements s
     WHERE s.id = settlement_id
       AND (public.is_staff(auth.uid())
            OR (s.party_type = 'driver' AND s.party_id = auth.uid())
            OR (s.party_type = 'provider' AND public.owns_provider(auth.uid(), s.party_id)))
  ));

CREATE TABLE public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid REFERENCES public.settlements(id) ON DELETE SET NULL,
  party_type text NOT NULL CHECK (party_type IN ('provider','driver')),
  party_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'IQD',
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('wallet','cash','bank')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  reference text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payouts TO authenticated;
GRANT ALL ON public.payouts TO service_role;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payouts_read_party_or_staff" ON public.payouts
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR (party_type = 'driver' AND party_id = auth.uid())
    OR (party_type = 'provider' AND public.owns_provider(auth.uid(), party_id))
  );

CREATE TRIGGER trg_payouts_updated_at
  BEFORE UPDATE ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_payouts_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_table_change();

-- توليد تسوية عن فترة
CREATE OR REPLACE FUNCTION public.generate_settlement(
  _party_type text, _party_id uuid, _from timestamptz, _to timestamptz
) RETURNS public.settlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE s public.settlements; pct numeric := 0;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.feature_enabled('settlements', auth.uid()) THEN RAISE EXCEPTION 'feature_disabled'; END IF;
  IF _party_type NOT IN ('provider','driver') THEN RAISE EXCEPTION 'invalid_party'; END IF;
  IF _to <= _from THEN RAISE EXCEPTION 'invalid_period'; END IF;

  INSERT INTO public.settlements (party_type, party_id, period_start, period_end, created_by)
  VALUES (_party_type, _party_id, _from, _to, auth.uid())
  RETURNING * INTO s;

  IF _party_type = 'provider' THEN
    SELECT COALESCE(commission_percent,0) INTO pct FROM public.providers WHERE id = _party_id;

    INSERT INTO public.settlement_items
      (settlement_id, subject_type, subject_id, label, gross, commission, delivery_fee, net, occurred_at)
    SELECT s.id, 'order', o.id, 'طلب #' || o.code,
           o.subtotal, round(o.subtotal * pct / 100.0), o.delivery_fee,
           o.subtotal - round(o.subtotal * pct / 100.0), COALESCE(o.completed_at, o.updated_at)
      FROM public.orders o
     WHERE o.provider_id = _party_id AND o.status = 'completed'
       AND COALESCE(o.completed_at, o.updated_at) >= _from
       AND COALESCE(o.completed_at, o.updated_at) < _to
    ON CONFLICT DO NOTHING;

    INSERT INTO public.settlement_items
      (settlement_id, subject_type, subject_id, label, gross, commission, delivery_fee, net, occurred_at)
    SELECT s.id, 'service_request', r.id, 'خدمة #' || r.code,
           r.price_amount, round(r.price_amount * pct / 100.0), 0,
           r.price_amount - round(r.price_amount * pct / 100.0), COALESCE(r.completed_at, r.updated_at)
      FROM public.service_requests r
     WHERE r.provider_id = _party_id AND r.status = 'completed' AND r.currency = 'IQD'
       AND COALESCE(r.completed_at, r.updated_at) >= _from
       AND COALESCE(r.completed_at, r.updated_at) < _to
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.settlement_items
      (settlement_id, subject_type, subject_id, label, gross, commission, delivery_fee, net, occurred_at)
    SELECT s.id, 'order', o.id, 'طلب #' || o.code,
           o.delivery_fee, 0, o.delivery_fee, o.delivery_fee, COALESCE(o.completed_at, o.updated_at)
      FROM public.orders o
     WHERE o.driver_id = _party_id AND o.status = 'completed'
       AND COALESCE(o.completed_at, o.updated_at) >= _from
       AND COALESCE(o.completed_at, o.updated_at) < _to
    ON CONFLICT DO NOTHING;

    INSERT INTO public.settlement_items
      (settlement_id, subject_type, subject_id, label, gross, commission, delivery_fee, net, occurred_at)
    SELECT s.id, 'trip', t.id, 'رحلة #' || t.code,
           t.fare, 0, 0, t.fare, COALESCE(t.completed_at, t.updated_at)
      FROM public.trips t
     WHERE t.driver_id = _party_id AND t.status = 'completed'
       AND COALESCE(t.completed_at, t.updated_at) >= _from
       AND COALESCE(t.completed_at, t.updated_at) < _to
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.settlements SET
    gross = COALESCE(agg.gross,0),
    commission = COALESCE(agg.commission,0),
    delivery_fees = COALESCE(agg.delivery_fee,0),
    net = COALESCE(agg.net,0),
    items_count = COALESCE(agg.cnt,0)
  FROM (
    SELECT sum(gross) gross, sum(commission) commission, sum(delivery_fee) delivery_fee,
           sum(net) net, count(*) cnt
      FROM public.settlement_items WHERE settlement_id = s.id
  ) agg
  WHERE public.settlements.id = s.id
  RETURNING public.settlements.* INTO s;

  RETURN s;
END; $$;

REVOKE ALL ON FUNCTION public.generate_settlement(text, uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_settlement(text, uuid, timestamptz, timestamptz) TO authenticated, service_role;

-- اعتماد التسوية
CREATE OR REPLACE FUNCTION public.approve_settlement(_settlement_id uuid)
RETURNS public.settlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE s public.settlements;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO s FROM public.settlements WHERE id = _settlement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'settlement_not_found'; END IF;
  IF s.status <> 'draft' THEN RAISE EXCEPTION 'invalid_status'; END IF;

  UPDATE public.settlements SET status = 'approved', approved_by = auth.uid(), approved_at = now()
   WHERE id = s.id RETURNING * INTO s;
  RETURN s;
END; $$;

REVOKE ALL ON FUNCTION public.approve_settlement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_settlement(uuid) TO authenticated, service_role;

-- صرف التسوية
CREATE OR REPLACE FUNCTION public.pay_settlement(
  _settlement_id uuid, _method text DEFAULT 'cash', _reference text DEFAULT NULL
) RETURNS public.payouts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE s public.settlements; po public.payouts; target uuid;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _method NOT IN ('wallet','cash','bank') THEN RAISE EXCEPTION 'invalid_method'; END IF;

  SELECT * INTO s FROM public.settlements WHERE id = _settlement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'settlement_not_found'; END IF;
  IF s.status <> 'approved' THEN RAISE EXCEPTION 'invalid_status'; END IF;

  IF _method = 'wallet' THEN
    IF s.party_type = 'driver' THEN
      target := s.party_id;
    ELSE
      SELECT owner_id INTO target FROM public.providers WHERE id = s.party_id;
    END IF;
    IF target IS NULL THEN RAISE EXCEPTION 'wallet_owner_not_found'; END IF;
    PERFORM public.wallet_apply(target, 'credit', s.net, 'settlement',
      'settlement:' || s.id::text, 'settlement', s.id, auth.uid());
  END IF;

  INSERT INTO public.payouts
    (settlement_id, party_type, party_id, amount, method, status, reference, created_by, paid_at)
  VALUES (s.id, s.party_type, s.party_id, s.net, _method, 'paid', _reference, auth.uid(), now())
  RETURNING * INTO po;

  UPDATE public.settlements SET status = 'paid', paid_at = now() WHERE id = s.id;
  RETURN po;
END; $$;

REVOKE ALL ON FUNCTION public.pay_settlement(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_settlement(uuid, text, text) TO authenticated, service_role;

-- ================= الفواتير =================
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq;

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('order','trip','service_request')),
  subject_id uuid NOT NULL,
  currency text NOT NULL DEFAULT 'IQD',
  subtotal numeric NOT NULL DEFAULT 0,
  fees numeric NOT NULL DEFAULT 0,
  delivery_fee numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id)
);

GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_own_read" ON public.invoices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.issue_invoice(
  _subject_type text, _subject_id uuid
) RETURNS public.invoices
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE inv public.invoices; uid uuid := auth.uid();
        v_owner uuid; v_sub numeric := 0; v_del numeric := 0; v_total numeric := 0;
        v_cur text := 'IQD'; v_label text; v_fees jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _subject_type NOT IN ('order','trip','service_request') THEN RAISE EXCEPTION 'invalid_subject'; END IF;

  SELECT * INTO inv FROM public.invoices WHERE subject_type = _subject_type AND subject_id = _subject_id;
  IF FOUND THEN
    IF inv.user_id <> uid AND NOT public.is_staff(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
    RETURN inv;
  END IF;

  IF _subject_type = 'order' THEN
    SELECT o.customer_id, o.subtotal, o.delivery_fee, o.total, 'طلب #' || o.code
      INTO v_owner, v_sub, v_del, v_total, v_label
      FROM public.orders o WHERE o.id = _subject_id AND o.status = 'completed';
  ELSIF _subject_type = 'trip' THEN
    SELECT t.customer_id, t.fare, 0, t.fare, 'رحلة #' || t.code
      INTO v_owner, v_sub, v_del, v_total, v_label
      FROM public.trips t WHERE t.id = _subject_id AND t.status = 'completed';
  ELSE
    SELECT r.customer_id, r.price_amount, 0, r.price_amount, 'خدمة #' || r.code, r.currency
      INTO v_owner, v_sub, v_del, v_total, v_label, v_cur
      FROM public.service_requests r WHERE r.id = _subject_id AND r.status = 'completed';
  END IF;

  IF v_owner IS NULL THEN RAISE EXCEPTION 'subject_not_invoiceable'; END IF;
  IF v_owner <> uid AND NOT public.is_staff(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.invoices
    (number, user_id, subject_type, subject_id, currency, subtotal, fees, delivery_fee, total, data)
  VALUES (
    'YM-' || to_char(now(),'YYYYMM') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0'),
    v_owner, _subject_type, _subject_id, COALESCE(v_cur,'IQD'),
    COALESCE(v_sub,0), 0, COALESCE(v_del,0), COALESCE(v_total,0),
    jsonb_build_object('label', v_label)
  )
  RETURNING * INTO inv;

  RETURN inv;
END; $$;

REVOKE ALL ON FUNCTION public.issue_invoice(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_invoice(text, uuid) TO authenticated, service_role;

-- ================= ملخصات مالية =================
CREATE OR REPLACE FUNCTION public.driver_earnings_summary(_from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE uid uuid := auth.uid(); res jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT jsonb_build_object(
    'from', _from, 'to', _to, 'currency', 'IQD',
    'orders', jsonb_build_object(
      'count', COALESCE(o.cnt,0), 'delivery_fees', COALESCE(o.fees,0)),
    'trips', jsonb_build_object(
      'count', COALESCE(t.cnt,0), 'fares', COALESCE(t.fare,0)),
    'total', COALESCE(o.fees,0) + COALESCE(t.fare,0),
    'paid_out', COALESCE(p.paid,0),
    'pending_settlement', GREATEST(COALESCE(o.fees,0) + COALESCE(t.fare,0) - COALESCE(p.paid,0), 0),
    'daily', COALESCE(d.days,'[]'::jsonb)
  ) INTO res
  FROM (SELECT count(*) cnt, sum(delivery_fee) fees FROM public.orders
         WHERE driver_id = uid AND status = 'completed'
           AND COALESCE(completed_at, updated_at) >= _from AND COALESCE(completed_at, updated_at) < _to) o
  CROSS JOIN (SELECT count(*) cnt, sum(fare) fare FROM public.trips
         WHERE driver_id = uid AND status = 'completed'
           AND COALESCE(completed_at, updated_at) >= _from AND COALESCE(completed_at, updated_at) < _to) t
  CROSS JOIN (SELECT sum(amount) paid FROM public.payouts
         WHERE party_type = 'driver' AND party_id = uid AND status = 'paid'
           AND created_at >= _from AND created_at < _to) p
  CROSS JOIN (SELECT jsonb_agg(jsonb_build_object('day', x.bucket, 'amount', x.amount) ORDER BY x.bucket) days
         FROM (
           SELECT date_trunc('day', COALESCE(completed_at, updated_at))::date AS bucket, sum(delivery_fee) AS amount
             FROM public.orders WHERE driver_id = uid AND status = 'completed'
              AND COALESCE(completed_at, updated_at) >= _from AND COALESCE(completed_at, updated_at) < _to
            GROUP BY 1
         ) x) d;

  RETURN res;
END; $$;

REVOKE ALL ON FUNCTION public.driver_earnings_summary(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_earnings_summary(timestamptz, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.provider_finance_summary(
  _provider_id uuid, _from timestamptz, _to timestamptz
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE uid uuid := auth.uid(); pct numeric := 0; res jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT (public.owns_provider(uid, _provider_id) OR public.is_staff(uid)) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT COALESCE(commission_percent,0) INTO pct FROM public.providers WHERE id = _provider_id;

  SELECT jsonb_build_object(
    'from', _from, 'to', _to, 'currency', 'IQD', 'commission_percent', pct,
    'orders_count', COALESCE(o.cnt,0),
    'sales', COALESCE(o.sales,0),
    'commission', round(COALESCE(o.sales,0) * pct / 100.0),
    'net', COALESCE(o.sales,0) - round(COALESCE(o.sales,0) * pct / 100.0),
    'services_count', COALESCE(s.cnt,0),
    'services_sales', COALESCE(s.sales,0),
    'paid_out', COALESCE(p.paid,0)
  ) INTO res
  FROM (SELECT count(*) cnt, sum(subtotal) sales FROM public.orders
         WHERE provider_id = _provider_id AND status = 'completed'
           AND COALESCE(completed_at, updated_at) >= _from AND COALESCE(completed_at, updated_at) < _to) o
  CROSS JOIN (SELECT count(*) cnt, sum(price_amount) sales FROM public.service_requests
         WHERE provider_id = _provider_id AND status = 'completed' AND currency = 'IQD'
           AND COALESCE(completed_at, updated_at) >= _from AND COALESCE(completed_at, updated_at) < _to) s
  CROSS JOIN (SELECT sum(amount) paid FROM public.payouts
         WHERE party_type = 'provider' AND party_id = _provider_id AND status = 'paid'
           AND created_at >= _from AND created_at < _to) p;

  RETURN res;
END; $$;

REVOKE ALL ON FUNCTION public.provider_finance_summary(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_finance_summary(uuid, timestamptz, timestamptz) TO authenticated, service_role;