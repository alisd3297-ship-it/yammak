-- 1) لا حاجة لموافقة إدارية على أي نوع طلب
CREATE OR REPLACE FUNCTION public.order_needs_admin_approval(_order_type order_type)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT false; $function$;

-- 2) إزالة شرط الموافقة من تغيير حالة الطلب
CREATE OR REPLACE FUNCTION public.change_order_status(_order_id uuid, _new_status order_status, _reason text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$;

-- 3) تحرير الطلبات العالقة حالياً
UPDATE public.orders
SET requires_admin_approval = false
WHERE requires_admin_approval = true AND admin_approved_at IS NULL;

-- 4) تعطيل إعداد الموافقة
UPDATE public.app_settings
SET value = jsonb_build_object('enabled', false, 'order_types', '[]'::jsonb), updated_at = now()
WHERE key = 'order_admin_approval';