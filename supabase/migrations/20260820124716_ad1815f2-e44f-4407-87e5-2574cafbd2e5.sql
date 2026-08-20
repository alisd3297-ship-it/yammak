DO $$
DECLARE
  cust uuid := '00000000-e2e6-0000-0000-000000000001';
  d1 uuid := '00000000-e2e6-0000-0000-000000000002';
  d2 uuid := '00000000-e2e6-0000-0000-000000000003';
  out1 uuid := '00000000-e2e6-0000-0000-000000000005';
  trip uuid; off uuid; n int; st text;
BEGIN
  SELECT detail::uuid INTO trip FROM public._e2e_taxi WHERE name='TRIP1_ID';
  SELECT id INTO off FROM public.trip_offers WHERE trip_id=trip AND status='sent' ORDER BY sent_at DESC LIMIT 1;

  PERFORM public._e2e_log('B','T15 محرك dispatch الحي أرسل العرض لأقرب سائق مناسب',
    (SELECT driver_id FROM public.trip_offers WHERE id=off) = d1, 'offer_driver=d1');

  -- سائق آخر لا يرى العرض ولا يقدر يقبله
  PERFORM public._e2e_as(d2);
  SELECT count(*) INTO n FROM public.trip_offers WHERE id=off;
  PERFORM public._e2e_reset();
  PERFORM public._e2e_log('B','T16 سائق غير مستهدف لا يرى العرض (RLS)', n=0, 'visible='||n);

  BEGIN
    PERFORM public._e2e_as(d2);
    PERFORM public.accept_trip_offer(off);
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('B','T17 سائق غير مستهدف لا يقدر يقبل العرض', false, 'نجح!');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('B','T17 سائق غير مستهدف لا يقدر يقبل العرض', true, SQLERRM);
  END;

  -- مستخدم خارجي لا يرى الرحلة ولا سجل حالاتها
  PERFORM public._e2e_as(out1);
  SELECT count(*) INTO n FROM public.trip_status_history WHERE trip_id=trip;
  PERFORM public._e2e_reset();
  PERFORM public._e2e_log('B','T18 مستخدم خارجي لا يرى سجل حالات الرحلة', n=0, 'rows='||n);

  -- رفض السائق الأول
  PERFORM public._e2e_as(d1);
  PERFORM public.reject_trip_offer(off, 'مشغول');
  PERFORM public._e2e_reset();
  SELECT status::text INTO st FROM public.trip_offers WHERE id=off;
  PERFORM public._e2e_log('B','T19 رفض السائق الأول يسجّل العرض كمرفوض', st='rejected', 'offer_status='||st);

  SELECT status::text INTO st FROM public.trips WHERE id=trip;
  PERFORM public._e2e_log('B','T20 الرحلة تبقى searching_driver بعد الرفض', st='searching_driver', 'trip_status='||st);
END $$;