CREATE TYPE public.payment_status AS ENUM ('pending','processing','succeeded','failed','cancelled','refunded');
CREATE TYPE public.payment_subject AS ENUM ('order','trip','service_request');

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject_type public.payment_subject NOT NULL,
  subject_id uuid NOT NULL,
  method text NOT NULL DEFAULT 'online',
  provider text NOT NULL DEFAULT 'stripe',
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'IQD',
  status public.payment_status NOT NULL DEFAULT 'pending',
  provider_intent_id text,
  client_secret text,
  idempotency_key text NOT NULL,
  refunded_amount numeric NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  refunded_at timestamptz
);

CREATE UNIQUE INDEX payments_idempotency_key_uidx ON public.payments (idempotency_key);
CREATE UNIQUE INDEX payments_provider_intent_uidx ON public.payments (provider, provider_intent_id) WHERE provider_intent_id IS NOT NULL;
CREATE UNIQUE INDEX payments_one_open_per_subject_uidx ON public.payments (subject_type, subject_id)
  WHERE status IN ('pending','processing','succeeded');
CREATE INDEX payments_user_idx ON public.payments (user_id, created_at DESC);
CREATE INDEX payments_subject_idx ON public.payments (subject_type, subject_id);

GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select_scoped" ON public.payments FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_staff(auth.uid())
  OR (subject_type = 'order' AND public.can_see_order(auth.uid(), subject_id))
  OR (subject_type = 'trip' AND public.can_see_trip(auth.uid(), subject_id))
  OR (subject_type = 'service_request' AND public.can_see_service_request(auth.uid(), subject_id))
);

CREATE TRIGGER trg_payments_touch BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payment_events_provider_event_uidx ON public.payment_events (provider, provider_event_id);

GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_events_staff_read" ON public.payment_events FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

-- مصدر الحقيقة للمبلغ ومالك الكيان
CREATE OR REPLACE FUNCTION public.payment_subject_info(_subject_type public.payment_subject, _subject_id uuid)
RETURNS TABLE (owner_id uuid, amount numeric, is_terminal boolean, label text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _subject_type = 'order' THEN
    RETURN QUERY SELECT o.customer_id, o.total, (o.status IN ('cancelled')), 'طلب #' || o.code
      FROM public.orders o WHERE o.id = _subject_id;
  ELSIF _subject_type = 'trip' THEN
    RETURN QUERY SELECT t.customer_id, t.fare, (t.status = 'cancelled'), 'رحلة #' || t.code
      FROM public.trips t WHERE t.id = _subject_id;
  ELSE
    RETURN QUERY SELECT r.customer_id, r.price_amount, (r.status IN ('cancelled','rejected')), 'خدمة #' || r.code
      FROM public.service_requests r WHERE r.id = _subject_id;
  END IF;
END; $$;

-- إنشاء نية الدفع: المبلغ من قاعدة البيانات فقط، مع منع التكرار
CREATE OR REPLACE FUNCTION public.create_payment_record(
  _subject_type public.payment_subject, _subject_id uuid, _idempotency_key text, _provider text DEFAULT 'stripe'
) RETURNS public.payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); info record; p public.payments;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF COALESCE(btrim(_idempotency_key),'') = '' THEN RAISE EXCEPTION 'missing_idempotency_key'; END IF;

  SELECT * INTO info FROM public.payment_subject_info(_subject_type, _subject_id);
  IF NOT FOUND OR info.owner_id IS NULL THEN RAISE EXCEPTION 'subject_not_found'; END IF;
  IF info.owner_id <> uid THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF info.is_terminal THEN RAISE EXCEPTION 'subject_not_payable'; END IF;
  IF COALESCE(info.amount, 0) <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT * INTO p FROM public.payments
   WHERE subject_type = _subject_type AND subject_id = _subject_id
     AND status IN ('pending','processing','succeeded')
   ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    IF p.status = 'succeeded' THEN RAISE EXCEPTION 'already_paid'; END IF;
    IF p.amount <> info.amount THEN
      UPDATE public.payments SET amount = info.amount WHERE id = p.id AND status = 'pending' RETURNING * INTO p;
    END IF;
    RETURN p;
  END IF;

  INSERT INTO public.payments (user_id, subject_type, subject_id, provider, amount, idempotency_key, metadata)
  VALUES (uid, _subject_type, _subject_id, _provider, info.amount, btrim(_idempotency_key),
          jsonb_build_object('label', info.label))
  RETURNING * INTO p;
  RETURN p;
END; $$;

-- ربط نية المزود بالسجل (من الخادم فقط)
CREATE OR REPLACE FUNCTION public.attach_payment_intent(_payment_id uuid, _intent_id text, _client_secret text)
RETURNS public.payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p public.payments;
BEGIN
  UPDATE public.payments
     SET provider_intent_id = _intent_id,
         client_secret = _client_secret,
         status = CASE WHEN status = 'pending' THEN 'processing'::public.payment_status ELSE status END
   WHERE id = _payment_id AND status IN ('pending','processing')
  RETURNING * INTO p;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_not_updatable'; END IF;
  RETURN p;
END; $$;

-- تسوية الدفع من webhook/تحقق الخادم: idempotent عبر معرف الحدث
CREATE OR REPLACE FUNCTION public.settle_payment(
  _provider text, _intent_id text, _new_status public.payment_status,
  _event_id text DEFAULT NULL, _event_type text DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb, _failure_reason text DEFAULT NULL,
  _amount numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p public.payments; dup boolean := false;
BEGIN
  IF _event_id IS NOT NULL THEN
    INSERT INTO public.payment_events (provider, provider_event_id, event_type, payload)
    VALUES (_provider, _event_id, COALESCE(_event_type,'unknown'), COALESCE(_payload,'{}'::jsonb))
    ON CONFLICT (provider, provider_event_id) DO NOTHING;
    IF NOT FOUND THEN dup := true; END IF;
  END IF;

  SELECT * INTO p FROM public.payments
   WHERE provider = _provider AND provider_intent_id = _intent_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found'); END IF;

  IF dup THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'status', p.status);
  END IF;

  IF _event_id IS NOT NULL THEN
    UPDATE public.payment_events SET payment_id = p.id
     WHERE provider = _provider AND provider_event_id = _event_id;
  END IF;

  -- الحالات النهائية لا تتراجع
  IF p.status IN ('succeeded','refunded') AND _new_status <> 'refunded' THEN
    RETURN jsonb_build_object('ok', true, 'ignored', true, 'status', p.status);
  END IF;

  IF _new_status = 'succeeded' AND _amount IS NOT NULL AND _amount <> p.amount THEN
    UPDATE public.payments SET status = 'failed', failure_reason = 'amount_mismatch' WHERE id = p.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  END IF;

  UPDATE public.payments SET
    status = _new_status,
    failure_reason = COALESCE(_failure_reason, failure_reason),
    client_secret = CASE WHEN _new_status IN ('succeeded','failed','cancelled') THEN NULL ELSE client_secret END,
    paid_at = CASE WHEN _new_status = 'succeeded' THEN COALESCE(paid_at, now()) ELSE paid_at END
  WHERE id = p.id RETURNING * INTO p;

  IF _new_status = 'succeeded' THEN
    INSERT INTO public.notifications (user_id, title, body, kind, order_id)
    VALUES (p.user_id, 'تم استلام الدفع',
            'تم تأكيد دفع مبلغ ' || p.amount::text || ' د.ع', 'payment',
            CASE WHEN p.subject_type = 'order' THEN p.subject_id ELSE NULL END);
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', p.status, 'payment_id', p.id);
END; $$;

-- تسجيل الاسترجاع بعد تنفيذه لدى المزود (خادم/إدارة فقط)
CREATE OR REPLACE FUNCTION public.record_payment_refund(_payment_id uuid, _amount numeric, _reason text DEFAULT NULL)
RETURNS public.payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p public.payments;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_not_found'; END IF;
  IF p.status <> 'succeeded' AND p.status <> 'refunded' THEN RAISE EXCEPTION 'payment_not_refundable'; END IF;
  IF COALESCE(_amount,0) <= 0 OR p.refunded_amount + _amount > p.amount THEN RAISE EXCEPTION 'invalid_refund_amount'; END IF;

  UPDATE public.payments SET
    refunded_amount = refunded_amount + _amount,
    refunded_at = now(),
    failure_reason = COALESCE(_reason, failure_reason),
    status = CASE WHEN refunded_amount + _amount >= amount THEN 'refunded'::public.payment_status ELSE status END
  WHERE id = p.id RETURNING * INTO p;

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (p.user_id, 'تم استرجاع مبلغ', 'تم استرجاع ' || _amount::text || ' د.ع لعملية دفعك', 'payment');

  RETURN p;
END; $$;

REVOKE ALL ON FUNCTION public.payment_subject_info(public.payment_subject, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_payment_record(public.payment_subject, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_payment_record(public.payment_subject, uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.attach_payment_intent(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_payment_intent(uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.settle_payment(text, text, public.payment_status, text, text, jsonb, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_payment(text, text, public.payment_status, text, text, jsonb, text, numeric) TO service_role;
REVOKE ALL ON FUNCTION public.record_payment_refund(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_refund(uuid, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_subject_info(public.payment_subject, uuid) TO service_role;