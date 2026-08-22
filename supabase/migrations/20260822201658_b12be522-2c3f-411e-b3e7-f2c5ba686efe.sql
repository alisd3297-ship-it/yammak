-- =========================================================
-- 1) توحيد create_ad: إزالة النسخة القديمة التي تفرض صورة
-- =========================================================
DROP FUNCTION IF EXISTS public.create_ad(uuid,text,text,text,text,text[],numeric,uuid);

-- =========================================================
-- 2) آلة الحالات: نسخة واحدة canonical (بأربع وسائط)
-- =========================================================
DROP FUNCTION IF EXISTS public.is_allowed_transition(text, public.order_status, public.order_status);

-- =========================================================
-- 3) الاسترداد المالي الحقيقي
-- =========================================================
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS refund_requested_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_reference text,
  ADD COLUMN IF NOT EXISTS refund_error text,
  ADD COLUMN IF NOT EXISTS refund_requested_at timestamptz;

CREATE OR REPLACE FUNCTION public.request_payment_refund(
  _payment_id uuid, _amount numeric DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS public.payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE p public.payments; remaining numeric; want numeric;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_not_found'; END IF;

  remaining := p.amount - COALESCE(p.refunded_amount,0);
  IF p.status <> 'succeeded' OR remaining <= 0 THEN
    RETURN p;
  END IF;

  -- طلب قائم أو منفّذ: لا تكرار
  IF p.refund_status IN ('pending','processing','succeeded') THEN
    RETURN p;
  END IF;

  want := LEAST(COALESCE(_amount, remaining), remaining);
  IF want <= 0 THEN RETURN p; END IF;

  IF p.provider_intent_id IS NULL OR p.provider IS NULL OR p.provider = 'cash' THEN
    UPDATE public.payments SET
      refund_status = 'manual_required',
      refund_requested_amount = want,
      refund_requested_at = now(),
      refund_error = 'provider_not_refundable',
      updated_at = now()
    WHERE id = p.id RETURNING * INTO p;

    INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
    VALUES (NULL, 'refund_manual_required', 'payments', p.id,
            jsonb_build_object('amount', want, 'reason', _reason));
    RETURN p;
  END IF;

  UPDATE public.payments SET
    refund_status = 'pending',
    refund_requested_amount = want,
    refund_requested_at = now(),
    refund_error = NULL,
    failure_reason = COALESCE(_reason, failure_reason),
    updated_at = now()
  WHERE id = p.id RETURNING * INTO p;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
  VALUES (NULL, 'refund_requested', 'payments', p.id,
          jsonb_build_object('amount', want, 'reason', _reason));
  RETURN p;
END; $$;

-- تحديث نتيجة الاسترداد بعد تنفيذه لدى المزود (خادم فقط، idempotent بالمرجع)
CREATE OR REPLACE FUNCTION public.settle_payment_refund(
  _payment_id uuid, _status text, _amount numeric DEFAULT NULL,
  _reference text DEFAULT NULL, _error text DEFAULT NULL)
RETURNS public.payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE p public.payments; amt numeric;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_not_found'; END IF;

  IF _status = 'succeeded' THEN
    -- نفس المرجع سبق تسجيله: لا تكرار
    IF p.refund_status = 'succeeded' AND _reference IS NOT NULL AND p.refund_reference = _reference THEN
      RETURN p;
    END IF;
    amt := LEAST(COALESCE(_amount, p.refund_requested_amount, 0), p.amount - COALESCE(p.refunded_amount,0));
    IF amt <= 0 THEN
      UPDATE public.payments SET refund_status = 'succeeded', refund_reference = COALESCE(_reference, refund_reference), updated_at = now()
      WHERE id = p.id RETURNING * INTO p;
      RETURN p;
    END IF;

    UPDATE public.payments SET
      refunded_amount = COALESCE(refunded_amount,0) + amt,
      refunded_at = now(),
      status = CASE WHEN COALESCE(refunded_amount,0) + amt >= amount THEN 'refunded'::public.payment_status ELSE status END,
      refund_status = 'succeeded',
      refund_reference = COALESCE(_reference, refund_reference),
      refund_error = NULL,
      updated_at = now()
    WHERE id = p.id RETURNING * INTO p;

    PERFORM public.push_notification(p.user_id, 'تم استرجاع مبلغ',
      'تم استرجاع ' || trim(to_char(amt, 'FM999999999.00')) || ' ' || COALESCE(p.currency,'IQD') || ' إلى وسيلة دفعك',
      'payment', NULL, 'refund:'||p.id||':'||COALESCE(_reference, amt::text));

    INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
    VALUES (NULL, 'refund_succeeded', 'payments', p.id,
            jsonb_build_object('amount', amt, 'reference', _reference));
    RETURN p;
  END IF;

  UPDATE public.payments SET
    refund_status = CASE WHEN _status IN ('processing','manual_required','failed') THEN _status ELSE 'failed' END,
    refund_error = _error,
    updated_at = now()
  WHERE id = p.id RETURNING * INTO p;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
  VALUES (NULL, 'refund_'||COALESCE(_status,'failed'), 'payments', p.id,
          jsonb_build_object('error', _error));
  RETURN p;
END; $$;

-- إلغاء الطلب: طلب استرداد فعلي بدل القيد الدفتري المباشر
CREATE OR REPLACE FUNCTION public.change_order_status(
  _order_id uuid, _new_status public.order_status, _reason text DEFAULT NULL)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  o public.orders;
  uid uuid := auth.uid();
  actor text;
  pay record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  actor := public.order_actor(uid, _order_id);
  IF actor IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF NOT public.is_allowed_transition(actor, o.status, _new_status, o.order_type) THEN
    RAISE EXCEPTION 'transition_not_allowed: % -> % (%)', o.status, _new_status, actor;
  END IF;

  IF o.requires_admin_approval AND o.admin_approved_at IS NULL
     AND _new_status <> 'cancelled' AND actor <> 'staff' THEN
    RAISE EXCEPTION 'admin_approval_required';
  END IF;

  IF actor = 'customer' AND _new_status = 'completed'
     AND public.otp_flag('require_for_order_completion')
     AND NOT public.is_phone_verified(uid) THEN
    INSERT INTO public.audit_logs (actor_id, action, entity, entity_id)
    VALUES (uid, 'otp_required_blocked', 'order', _order_id);
    RAISE EXCEPTION 'phone_verification_required';
  END IF;

  UPDATE public.orders SET
    status = _new_status,
    cancel_reason = CASE WHEN _new_status = 'cancelled' THEN COALESCE(_reason, cancel_reason) ELSE cancel_reason END,
    completed_at = CASE WHEN _new_status = 'completed' THEN now() ELSE completed_at END
  WHERE id = _order_id
  RETURNING * INTO o;

  IF _new_status = 'cancelled' THEN
    UPDATE public.delivery_offers SET status = 'cancelled', responded_at = now()
    WHERE order_id = _order_id AND status = 'sent';

    FOR pay IN
      SELECT id FROM public.payments
      WHERE subject_type = 'order' AND subject_id = _order_id
        AND status = 'succeeded' AND refunded_amount < amount
    LOOP
      PERFORM public.request_payment_refund(pay.id, NULL, COALESCE(_reason, 'order_cancelled'));
    END LOOP;
  END IF;

  RETURN o;
END; $$;

-- رفض الإدارة: طلب استرداد كذلك
CREATE OR REPLACE FUNCTION public.review_order_approval(
  _order_id uuid, _approve boolean, _reason text DEFAULT NULL)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE uid uuid := auth.uid(); o public.orders; before_row public.orders; pay record;
BEGIN
  IF uid IS NULL OR NOT public.is_staff(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO before_row FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT before_row.requires_admin_approval THEN RAISE EXCEPTION 'approval_not_required'; END IF;
  IF before_row.admin_approved_at IS NOT NULL THEN RAISE EXCEPTION 'already_reviewed'; END IF;
  IF before_row.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'order_closed'; END IF;

  IF _approve THEN
    UPDATE public.orders SET
      admin_approved_at = now(), admin_approved_by = uid, admin_review_reason = _reason
    WHERE id = _order_id RETURNING * INTO o;
    PERFORM public.push_notification(o.customer_id, 'تمت موافقة الإدارة',
      'تمت الموافقة على طلبك وسيتم تجهيزه', 'order', o.id, 'order:'||o.id||':admin_approved');
    PERFORM public.push_notification(
      (SELECT owner_id FROM public.providers WHERE id = o.provider_id),
      'طلب معتمد من الإدارة', 'يمكنك الآن قبول الطلب وتجهيزه', 'order', o.id,
      'order:'||o.id||':admin_approved_provider');
  ELSE
    UPDATE public.orders SET
      admin_review_reason = _reason, status = 'cancelled',
      cancel_reason = COALESCE(_reason, 'رفض الإدارة')
    WHERE id = _order_id RETURNING * INTO o;
    UPDATE public.delivery_offers SET status = 'cancelled', responded_at = now()
      WHERE order_id = _order_id AND status = 'sent';

    FOR pay IN
      SELECT id FROM public.payments
      WHERE subject_type = 'order' AND subject_id = _order_id
        AND status = 'succeeded' AND refunded_amount < amount
    LOOP
      PERFORM public.request_payment_refund(pay.id, NULL, COALESCE(_reason, 'admin_rejected'));
    END LOOP;

    PERFORM public.push_notification(o.customer_id, 'تم رفض الطلب',
      COALESCE(_reason, 'رفضت الإدارة الطلب'), 'order', o.id, 'order:'||o.id||':admin_rejected');
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, before_data, after_data)
  VALUES (uid, CASE WHEN _approve THEN 'order_admin_approved' ELSE 'order_admin_rejected' END,
          'orders', _order_id, to_jsonb(before_row), to_jsonb(o));
  RETURN o;
END; $$;

-- =========================================================
-- 4) تعيين المندوب يدوياً عبر انتقالات مسموحة
-- =========================================================
CREATE OR REPLACE FUNCTION public.system_assign_driver(_order_id uuid, _driver_id uuid)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_order_id::text, 0));
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF o.driver_id IS NOT NULL THEN RAISE EXCEPTION 'order_already_assigned'; END IF;
  IF o.status IN ('completed','cancelled','delivered') THEN RAISE EXCEPTION 'order_closed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.worker_profiles w
                 WHERE w.user_id = _driver_id AND w.is_approved AND w.worker_kind = 'delivery') THEN
    RAISE EXCEPTION 'driver_not_eligible';
  END IF;

  UPDATE public.delivery_offers SET status = 'cancelled', responded_at = now()
  WHERE order_id = o.id AND status = 'sent';

  IF o.status NOT IN ('searching_driver','offered_to_driver') THEN
    IF NOT public.is_allowed_transition('system', o.status, 'searching_driver', o.order_type) THEN
      RAISE EXCEPTION 'order_not_dispatchable';
    END IF;
    UPDATE public.orders SET status = 'searching_driver' WHERE id = o.id RETURNING * INTO o;
  END IF;

  IF o.status = 'searching_driver' THEN
    UPDATE public.orders SET status = 'offered_to_driver' WHERE id = o.id RETURNING * INTO o;
  END IF;

  INSERT INTO public.delivery_offers (order_id, driver_id, status, sent_at, expires_at, responded_at)
  VALUES (o.id, _driver_id, 'accepted', now(), now() + interval '5 minutes', now());

  UPDATE public.orders SET driver_id = _driver_id, status = 'driver_accepted'
  WHERE id = o.id RETURNING * INTO o;

  PERFORM public.push_notification(o.customer_id, 'تم تعيين مندوب',
    'مندوب التوصيل بالطريق لاستلام طلبك', 'order', o.id, 'order:'||o.id||':driver_assigned');
  PERFORM public.push_notification(_driver_id, 'تم إسناد طلب لك',
    'أسندت الإدارة طلباً لك، افتح لوحة المندوب', 'order', o.id, 'order:'||o.id||':manual_assign');

  RETURN o;
END; $$;

-- =========================================================
-- 5) تتبّع محاولات التوزيع + تنبيه التأخير
-- =========================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS dispatch_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispatch_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_alerted_at timestamptz;

CREATE OR REPLACE FUNCTION public.mark_dispatch_attempt(_order_id uuid, _found boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders; wait_seconds int; staff_id uuid;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  IF _found THEN
    UPDATE public.orders SET dispatch_attempts = 0, dispatch_last_attempt_at = now(),
      dispatch_alerted_at = NULL
    WHERE id = o.id RETURNING * INTO o;
    RETURN jsonb_build_object('attempts', 0, 'alerted', false);
  END IF;

  UPDATE public.orders SET
    dispatch_attempts = LEAST(COALESCE(dispatch_attempts,0) + 1, 999),
    dispatch_last_attempt_at = now()
  WHERE id = o.id RETURNING * INTO o;

  wait_seconds := LEAST(30 * o.dispatch_attempts, 300);

  IF o.dispatch_attempts >= 5 AND o.dispatch_alerted_at IS NULL THEN
    UPDATE public.orders SET dispatch_alerted_at = now() WHERE id = o.id;
    PERFORM public.push_notification(o.customer_id, 'نبحث عن مندوب',
      'نعتذر عن التأخير، ما زلنا نبحث عن مندوب قريب لطلبك', 'order', o.id,
      'order:'||o.id||':dispatch_delay');
    FOR staff_id IN
      SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('admin','super_admin','supervisor')
    LOOP
      PERFORM public.push_notification(staff_id, 'طلب بلا مندوب',
        'طلب ' || o.code || ' لم يجد مندوباً بعد عدة محاولات', 'order', o.id,
        'order:'||o.id||':dispatch_delay:'||staff_id);
    END LOOP;
    RETURN jsonb_build_object('attempts', o.dispatch_attempts, 'alerted', true,
                              'wait_seconds', wait_seconds);
  END IF;

  RETURN jsonb_build_object('attempts', o.dispatch_attempts, 'alerted', false,
                            'wait_seconds', wait_seconds);
END; $$;

-- =========================================================
-- 6) حقول تكلفة اختيارية في الكتالوج
-- =========================================================
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price numeric;
ALTER TABLE public.provider_services ADD COLUMN IF NOT EXISTS cost_amount numeric;

-- =========================================================
-- 7) التقرير الإداري: فصل العملات + العمولات + التكلفة + الربح
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_orders_report(_from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE uid uuid := auth.uid(); can_finance boolean; result jsonb;
BEGIN
  IF uid IS NULL OR NOT public.is_staff(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  can_finance := public.has_role(uid,'admin') OR public.has_role(uid,'super_admin');

  SELECT jsonb_build_object(
    'from', _from, 'to', _to, 'can_finance', can_finance,
    'currency', 'IQD',
    'totals', (
      SELECT jsonb_build_object(
        'orders', count(*),
        'completed', count(*) FILTER (WHERE status IN ('completed','delivered')),
        'cancelled', count(*) FILTER (WHERE status = 'cancelled'),
        'active', count(*) FILTER (WHERE status NOT IN ('completed','cancelled','delivered')),
        'gross_sales', CASE WHEN can_finance THEN COALESCE(sum(subtotal),0) ELSE NULL END,
        'delivery_fees', CASE WHEN can_finance THEN COALESCE(sum(delivery_fee),0) ELSE NULL END,
        'revenue', CASE WHEN can_finance THEN COALESCE(sum(total),0) ELSE NULL END
      ) FROM public.orders WHERE created_at >= _from AND created_at < _to
    ),
    'finance', CASE WHEN can_finance THEN (
      SELECT jsonb_build_object(
        'commissions', COALESCE((
          SELECT sum(o.subtotal * COALESCE(p.commission_percent,0) / 100.0)
          FROM public.orders o JOIN public.providers p ON p.id = o.provider_id
          WHERE o.created_at >= _from AND o.created_at < _to
            AND o.status IN ('completed','delivered')), 0),
        'delivery_fees', COALESCE((
          SELECT sum(delivery_fee) FROM public.orders
          WHERE created_at >= _from AND created_at < _to
            AND status IN ('completed','delivered')), 0),
        'product_cost', COALESCE((
          SELECT sum(oi.quantity * pr.cost_price)
          FROM public.order_items oi
          JOIN public.orders o ON o.id = oi.order_id
          JOIN public.products pr ON pr.id = oi.product_id
          WHERE o.created_at >= _from AND o.created_at < _to
            AND o.status IN ('completed','delivered')
            AND pr.cost_price IS NOT NULL), 0),
        'cost_known_items', COALESCE((
          SELECT count(*) FROM public.order_items oi
          JOIN public.orders o ON o.id = oi.order_id
          JOIN public.products pr ON pr.id = oi.product_id
          WHERE o.created_at >= _from AND o.created_at < _to
            AND o.status IN ('completed','delivered') AND pr.cost_price IS NOT NULL), 0),
        'total_items', COALESCE((
          SELECT count(*) FROM public.order_items oi
          JOIN public.orders o ON o.id = oi.order_id
          WHERE o.created_at >= _from AND o.created_at < _to
            AND o.status IN ('completed','delivered')), 0)
      )) ELSE NULL END,
    'payments_by_currency', CASE WHEN can_finance THEN (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'currency', cur, 'count', c, 'paid', paid, 'refunded', refunded, 'net', paid - refunded)
        ORDER BY cur), '[]'::jsonb)
      FROM (
        SELECT upper(COALESCE(currency,'IQD')) cur, count(*) c,
               COALESCE(sum(amount) FILTER (WHERE status IN ('succeeded','refunded')),0) paid,
               COALESCE(sum(refunded_amount),0) refunded
        FROM public.payments WHERE created_at >= _from AND created_at < _to
        GROUP BY 1
      ) pc) ELSE NULL END,
    'refunds', CASE WHEN can_finance THEN (
      SELECT jsonb_build_object(
        'pending', count(*) FILTER (WHERE refund_status IN ('pending','processing')),
        'manual_required', count(*) FILTER (WHERE refund_status = 'manual_required'),
        'failed', count(*) FILTER (WHERE refund_status = 'failed'),
        'succeeded', count(*) FILTER (WHERE refund_status = 'succeeded'))
      FROM public.payments WHERE created_at >= _from AND created_at < _to) ELSE NULL END,
    'ads_by_currency', CASE WHEN can_finance THEN (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('currency', cur, 'count', c, 'amount', amt) ORDER BY cur), '[]'::jsonb)
      FROM (
        SELECT upper(COALESCE(currency,'IQD')) cur, count(*) c, COALESCE(sum(price),0) amt
        FROM public.ads WHERE created_at >= _from AND created_at < _to GROUP BY 1
      ) ac) ELSE NULL END,
    'by_status', (
      SELECT COALESCE(jsonb_object_agg(status, c), '{}'::jsonb) FROM (
        SELECT status::text AS status, count(*) c FROM public.orders
        WHERE created_at >= _from AND created_at < _to GROUP BY status
      ) t
    ),
    'daily', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d, 'orders', c,
        'revenue', CASE WHEN can_finance THEN r ELSE NULL END) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', created_at)::date d, count(*) c, COALESCE(sum(total),0) r
        FROM public.orders WHERE created_at >= _from AND created_at < _to
        GROUP BY 1
      ) x
    ),
    'providers', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'orders', c,
        'revenue', CASE WHEN can_finance THEN r ELSE NULL END, 'rating', rating) ORDER BY c DESC), '[]'::jsonb)
      FROM (
        SELECT p.id, p.name, p.rating, count(o.id) c, COALESCE(sum(o.total),0) r
        FROM public.providers p
        JOIN public.orders o ON o.provider_id = p.id AND o.created_at >= _from AND o.created_at < _to
        GROUP BY p.id, p.name, p.rating ORDER BY count(o.id) DESC LIMIT 20
      ) y
    ),
    'drivers', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', user_id, 'name', full_name,
        'delivered', delivered, 'cancelled', cancelled, 'rating', rating) ORDER BY delivered DESC), '[]'::jsonb)
      FROM (
        SELECT w.user_id, COALESCE(pr.full_name,'مندوب') full_name, w.rating,
               count(*) FILTER (WHERE o.status IN ('delivered','completed')) delivered,
               count(*) FILTER (WHERE o.status = 'cancelled') cancelled
        FROM public.worker_profiles w
        LEFT JOIN public.profiles pr ON pr.id = w.user_id
        JOIN public.orders o ON o.driver_id = w.user_id AND o.created_at >= _from AND o.created_at < _to
        GROUP BY w.user_id, pr.full_name, w.rating LIMIT 20
      ) z
    ),
    'trips', (
      SELECT jsonb_build_object('count', count(*),
        'fare', CASE WHEN can_finance THEN COALESCE(sum(fare),0) ELSE NULL END)
      FROM public.trips WHERE created_at >= _from AND created_at < _to
    ),
    'service_requests', (
      SELECT jsonb_build_object('count', count(*),
        'amount', CASE WHEN can_finance THEN COALESCE(sum(price_amount),0) ELSE NULL END,
        'cost', CASE WHEN can_finance THEN COALESCE((
          SELECT sum(ps.cost_amount) FROM public.service_requests sr
          JOIN public.provider_services ps ON ps.id = sr.service_id
          WHERE sr.created_at >= _from AND sr.created_at < _to
            AND sr.status = 'completed' AND ps.cost_amount IS NOT NULL), 0) ELSE NULL END)
      FROM public.service_requests WHERE created_at >= _from AND created_at < _to
    )
  ) INTO result;
  RETURN result;
END; $$;

-- =========================================================
-- 8) صلاحيات التنفيذ: منع anon ومنع الدوال الداخلية عن المستخدمين
-- =========================================================
DO $$
DECLARE fn text;
BEGIN
  -- دوال إدارية: لا يجوز استدعاؤها بدون تسجيل دخول
  FOREACH fn IN ARRAY ARRAY[
    'public.review_order_approval(uuid,boolean,text)',
    'public.admin_orders_report(timestamptz,timestamptz)',
    'public.admin_list_users(text,integer)',
    'public.admin_set_user_role(uuid,public.app_role,boolean)',
    'public.admin_set_user_blocked(uuid,boolean)',
    'public.create_ad(uuid,text,text,text,text,text[],numeric,uuid,text,text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
  END LOOP;

  -- دوال داخلية للخادم فقط (تُستدعى بمفتاح الخدمة)
  FOREACH fn IN ARRAY ARRAY[
    'public.system_change_order_status(uuid,public.order_status)',
    'public.system_change_trip_status(uuid,public.trip_status)',
    'public.system_assign_driver(uuid,uuid)',
    'public.try_offer_delivery(uuid,uuid,numeric,integer)',
    'public.mark_dispatch_attempt(uuid,boolean)',
    'public.record_payment_refund(uuid,numeric,text)',
    'public.request_payment_refund(uuid,numeric,text)',
    'public.settle_payment_refund(uuid,text,numeric,text,text)',
    'public.push_notification(uuid,text,text,text,uuid,text)',
    'public.claim_maintenance_slot(text,integer)',
    'public.expire_stale_offers(uuid)',
    'public.expire_due_ads()',
    'public.auto_complete_delivered_orders()',
    'public.attach_payment_intent(uuid,text,text)'
  ] LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, public', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skip %', fn;
    END;
  END LOOP;
END $$;

COMMENT ON TABLE public.internal_secrets IS 'جدول خادم فقط: لا سياسات RLS ولا صلاحيات لأي دور عام — يُقرأ فقط داخل دوال SECURITY DEFINER.';
COMMENT ON TABLE public.maintenance_locks IS 'جدول خادم فقط لأقفال الصيانة: لا سياسات RLS ولا وصول من الواجهة.';
