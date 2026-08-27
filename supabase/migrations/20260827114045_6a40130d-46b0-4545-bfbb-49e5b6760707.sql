-- 1) إزالة النسخة القديمة المكررة من دالة إنشاء الطلب (تفادي التباس PostgREST)
DROP FUNCTION IF EXISTS public.create_customer_order(uuid, jsonb, text, double precision, double precision, text);

-- 2) وقت آخر تغيّر فعلي لحالة الطلب
CREATE OR REPLACE FUNCTION public.order_status_since(_order_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT max(h.created_at)
       FROM public.order_status_history h
       JOIN public.orders o2 ON o2.id = h.order_id AND o2.status = h.status
      WHERE h.order_id = _order_id),
    (SELECT o3.created_at FROM public.orders o3 WHERE o3.id = _order_id)
  );
$$;

REVOKE ALL ON FUNCTION public.order_status_since(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_status_since(uuid) TO service_role;

-- 3) إعادة تعريف انتهاء المهل اعتماداً على وقت تغيّر الحالة
CREATE OR REPLACE FUNCTION public.expire_stale_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg jsonb;
  provider_minutes int;
  driver_minutes int;
  ready_minutes int;
  cancelled_provider int := 0;
  cancelled_driver int := 0;
  alerted_ready int := 0;
  rec record;
  staff_id uuid;
  owner uuid;
BEGIN
  SELECT value INTO cfg FROM public.app_settings WHERE key = 'order_timeouts';
  provider_minutes := COALESCE((cfg ->> 'provider_response_minutes')::int, 45);
  driver_minutes := COALESCE((cfg ->> 'driver_search_minutes')::int, 90);
  ready_minutes := COALESCE((cfg ->> 'ready_pickup_alert_minutes')::int, 120);

  -- (أ) التاجر لم يرد على الطلب
  FOR rec IN
    UPDATE public.orders o
       SET status = 'cancelled',
           cancel_reason = 'انتهت مهلة رد المتجر تلقائياً',
           updated_at = now()
     WHERE o.status IN ('new', 'awaiting_provider')
       AND public.order_status_since(o.id) < now() - make_interval(mins => provider_minutes)
    RETURNING o.id, o.code, o.customer_id, o.provider_id
  LOOP
    cancelled_provider := cancelled_provider + 1;
    PERFORM public.push_notification(rec.customer_id, 'تم إلغاء طلبك',
      'ما وصلنا رد من المحل على طلب ' || rec.code || '، تم الإلغاء تلقائياً ومو راح ينحسب عليك شي.',
      'order', rec.id, 'order:' || rec.id || ':timeout_provider');
    IF rec.provider_id IS NOT NULL THEN
      SELECT owner_id INTO owner FROM public.providers WHERE id = rec.provider_id;
      IF owner IS NOT NULL THEN
        PERFORM public.push_notification(owner, 'طلب ملغى تلقائياً',
          'انتهت مهلة الرد على الطلب ' || rec.code || ' فتم إلغاؤه.',
          'order', rec.id, 'order:' || rec.id || ':timeout_provider:owner');
      END IF;
    END IF;
  END LOOP;

  -- (ب) لم يُعثر على مندوب (المهلة أو تجاوز عدد المحاولات)
  FOR rec IN
    UPDATE public.orders o
       SET status = 'cancelled',
           cancel_reason = 'لم يتوفر مندوب خلال المهلة',
           updated_at = now()
     WHERE o.status IN ('searching_driver', 'offered_to_driver')
       AND o.driver_id IS NULL
       AND (
         public.order_status_since(o.id) < now() - make_interval(mins => driver_minutes)
         OR COALESCE(o.dispatch_attempts, 0) >= 60
       )
    RETURNING o.id, o.code, o.customer_id
  LOOP
    cancelled_driver := cancelled_driver + 1;
    UPDATE public.delivery_offers SET status = 'cancelled', responded_at = now()
     WHERE order_id = rec.id AND status = 'sent';
    PERFORM public.push_notification(rec.customer_id, 'ما توفر مندوب',
      'نعتذر، ما لكينا مندوب متاح لطلب ' || rec.code || ' فتم إلغاؤه تلقائياً.',
      'order', rec.id, 'order:' || rec.id || ':timeout_driver');
  END LOOP;

  -- (ج) طلب جاهز ولم يُستلم — تنبيه فقط بدون إلغاء
  FOR rec IN
    SELECT o.id, o.code, o.provider_id
      FROM public.orders o
     WHERE o.status = 'ready_for_pickup'
       AND public.order_status_since(o.id) < now() - make_interval(mins => ready_minutes)
  LOOP
    alerted_ready := alerted_ready + 1;
    FOR staff_id IN
      SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('admin', 'super_admin', 'supervisor')
    LOOP
      PERFORM public.push_notification(staff_id, 'طلب جاهز ولم يُستلم',
        'الطلب ' || rec.code || ' جاهز منذ فترة طويلة ولم يستلمه أحد.',
        'order', rec.id, 'order:' || rec.id || ':ready_stale:' || staff_id);
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'cancelled_provider_timeout', cancelled_provider,
    'cancelled_no_driver', cancelled_driver,
    'ready_alerts', alerted_ready
  );
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_orders() TO service_role;

-- 4) تنظيف الطلبات العالقة الحالية فوراً
SELECT public.expire_stale_orders();
