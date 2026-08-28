-- 1) فصل سياسات القراءة العامة عن فحص الموظفين (is_staff غير متاح لـ anon)
DROP POLICY IF EXISTS taxi_stands_public_read ON public.taxi_stands;
CREATE POLICY taxi_stands_active_read ON public.taxi_stands
  FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY taxi_stands_staff_read ON public.taxi_stands
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS zones_public_read ON public.delivery_zones;
CREATE POLICY zones_active_read ON public.delivery_zones
  FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY zones_staff_read ON public.delivery_zones
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS fee_rules_read_active ON public.fee_rules;
CREATE POLICY fee_rules_active_read ON public.fee_rules
  FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY fee_rules_staff_read ON public.fee_rules
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- 2) طابور مواقف التكسي: لا يُقرأ بالكامل من أي مستخدم مسجّل
DROP POLICY IF EXISTS taxi_queue_read ON public.taxi_stand_queue;
CREATE POLICY taxi_queue_self_read ON public.taxi_stand_queue
  FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR public.is_staff(auth.uid()));
REVOKE SELECT ON public.taxi_stand_queue FROM anon;

-- عدّ المنتظرين لكل موقف بدون كشف هوية السائقين
CREATE OR REPLACE FUNCTION public.taxi_stand_waiting_counts()
RETURNS TABLE (stand_id uuid, waiting integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT q.stand_id, COUNT(*)::int
    FROM public.taxi_stand_queue q
   WHERE q.left_at IS NULL
   GROUP BY q.stand_id
$$;
REVOKE ALL ON FUNCTION public.taxi_stand_waiting_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.taxi_stand_waiting_counts() TO anon, authenticated, service_role;

-- 3) عدّ ضغط الطلبات على مستوى المنصة (بدون كشف أي طلب)
CREATE OR REPLACE FUNCTION public.platform_active_orders(minutes integer DEFAULT 45)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::int
    FROM public.orders o
   WHERE o.created_at >= now() - make_interval(mins => GREATEST(COALESCE(minutes, 45), 1))
     AND o.status NOT IN ('completed', 'cancelled', 'delivered')
$$;
REVOKE ALL ON FUNCTION public.platform_active_orders(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_active_orders(integer) TO anon, authenticated, service_role;

-- 4) إنهاء رحلات التكسي العالقة في البحث عن سائق
CREATE OR REPLACE FUNCTION public.expire_stale_trips()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cfg jsonb;
  search_minutes int;
  cancelled int := 0;
  rec record;
BEGIN
  SELECT value INTO cfg FROM public.app_settings WHERE key = 'order_timeouts';
  search_minutes := COALESCE((cfg ->> 'trip_search_minutes')::int, 20);

  FOR rec IN
    UPDATE public.trips t
       SET status = 'cancelled',
           updated_at = now()
     WHERE t.status IN ('requested', 'searching_driver')
       AND t.driver_id IS NULL
       AND t.created_at < now() - make_interval(mins => search_minutes)
    RETURNING t.id, t.customer_id
  LOOP
    cancelled := cancelled + 1;
    UPDATE public.trip_offers SET status = 'cancelled', responded_at = now()
     WHERE trip_id = rec.id AND status = 'sent';
    PERFORM public.push_notification(rec.customer_id, 'ما توفر سائق',
      'نعتذر، ما لكينا سائق متاح لرحلتك فتم إلغاؤها تلقائياً.',
      'trip', rec.id, 'trip:' || rec.id || ':timeout_driver');
  END LOOP;

  RETURN jsonb_build_object('cancelled_trips', cancelled);
END;
$$;
REVOKE ALL ON FUNCTION public.expire_stale_trips() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_trips() TO service_role;