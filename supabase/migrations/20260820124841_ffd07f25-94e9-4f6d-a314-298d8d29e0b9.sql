CREATE OR REPLACE FUNCTION public._e2e_log(_step text, _name text, _ok boolean, _detail text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  INSERT INTO public._e2e_taxi(step, name, ok, detail) VALUES (_step, _name, _ok, _detail);
$fn$;

DO $$
DECLARE
  cust uuid := '00000000-e2e6-0000-0000-000000000001';
  d1 uuid := '00000000-e2e6-0000-0000-000000000002';
  d2 uuid := '00000000-e2e6-0000-0000-000000000003';
  adm uuid := '00000000-e2e6-0000-0000-000000000004';
  out1 uuid := '00000000-e2e6-0000-0000-000000000005';
  trip uuid; off2 uuid; extra uuid; n int; st text; t public.trips;
  r0 numeric; c0 int; r1 numeric; c1 int;
BEGIN
  SELECT detail::uuid INTO trip FROM public._e2e_taxi WHERE name='TRIP1_ID';
  SELECT id INTO off2 FROM public.trip_offers WHERE trip_id=trip AND driver_id=d2 AND status='sent';

  PERFORM public._e2e_log('C','T21 بعد الرفض تُعاد الرحلة لسائق آخر تلقائياً (cron حي)', off2 IS NOT NULL, 'offer_to=d2');

  -- عرض إضافي للسائق الأول لمحاكاة تنافس القبول على نفس الرحلة
  INSERT INTO public.trip_offers(trip_id, driver_id, status, distance_km, expires_at)
  VALUES (trip, d1, 'sent', 1, now() + interval '5 minutes') RETURNING id INTO extra;

  PERFORM public._e2e_as(d2);
  t := public.accept_trip_offer(off2);
  PERFORM public._e2e_reset();
  PERFORM public._e2e_log('C','T22 قبول العرض يسند الرحلة ذرياً ويحولها driver_assigned',
    t.driver_id=d2 AND t.status='driver_assigned', 'status='||t.status);

  BEGIN
    PERFORM public._e2e_as(d1);
    PERFORM public.accept_trip_offer(extra);
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T23 قبول ثانٍ لنفس الرحلة يفشل (فائز واحد فقط)', false, 'نجح القبول الثاني!');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T23 قبول ثانٍ لنفس الرحلة يفشل (فائز واحد فقط)', true, SQLERRM);
  END;

  SELECT count(*) INTO n FROM public.trip_offers WHERE trip_id=trip AND status='sent';
  PERFORM public._e2e_log('C','T24 إلغاء بقية العروض بعد الإسناد', n=0, 'sent_left='||n);

  -- قفزات ممنوعة
  BEGIN
    PERFORM public._e2e_as(d2);
    PERFORM public.change_trip_status(trip,'completed',NULL);
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T25 منع قفزة driver_assigned → completed', false, 'نجحت القفزة!');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T25 منع قفزة driver_assigned → completed', true, SQLERRM);
  END;

  BEGIN
    PERFORM public._e2e_as(cust);
    PERFORM public.change_trip_status(trip,'in_progress',NULL);
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T26 منع الراكب من تشغيل الرحلة in_progress', false, 'نجح!');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T26 منع الراكب من تشغيل الرحلة in_progress', true, SQLERRM);
  END;

  BEGIN
    PERFORM public._e2e_as(out1);
    PERFORM public.change_trip_status(trip,'cancelled','x');
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T27 منع طرف خارجي من تغيير حالة الرحلة', false, 'نجح!');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T27 منع طرف خارجي من تغيير حالة الرحلة', true, SQLERRM);
  END;

  -- انتقالات صحيحة
  PERFORM public._e2e_as(d2);
  t := public.change_trip_status(trip,'driver_arriving',NULL);
  PERFORM public._e2e_log('C','T28 driver_assigned → driver_arriving', t.status='driver_arriving', t.status::text);
  t := public.change_trip_status(trip,'driver_arrived',NULL);
  PERFORM public._e2e_log('C','T29 driver_arriving → driver_arrived', t.status='driver_arrived', t.status::text);
  PERFORM public._e2e_reset();

  -- خصوصية موقع السائق أثناء الرحلة
  PERFORM public._e2e_as(cust);
  SELECT count(*) INTO n FROM public.worker_locations WHERE user_id=d2;
  PERFORM public._e2e_reset();
  PERFORM public._e2e_log('C','T30 الراكب يرى موقع سائقه أثناء الحالة النشطة', n=1, 'rows='||n);

  PERFORM public._e2e_as(cust);
  SELECT count(*) INTO n FROM public.worker_locations WHERE user_id=d1;
  PERFORM public._e2e_reset();
  PERFORM public._e2e_log('C','T31 الراكب لا يرى موقع سائق غير مرتبط برحلته', n=0, 'rows='||n);

  PERFORM public._e2e_as(out1);
  SELECT count(*) INTO n FROM public.worker_locations;
  PERFORM public._e2e_reset();
  PERFORM public._e2e_log('C','T32 طرف خارجي لا يرى أي موقع سائق', n=0, 'rows='||n);

  PERFORM public._e2e_as(d2);
  t := public.change_trip_status(trip,'in_progress',NULL);
  PERFORM public._e2e_reset();
  PERFORM public._e2e_log('C','T33 driver_arrived → in_progress ويضبط started_at',
    t.status='in_progress' AND t.started_at IS NOT NULL, 'started_at='||coalesce(t.started_at::text,'null'));

  BEGIN
    PERFORM public._e2e_as(cust);
    PERFORM public.change_trip_status(trip,'cancelled','بدّلت رأيي');
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T34 منع إلغاء الراكب بعد بدء الرحلة', false, 'نجح الإلغاء!');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T34 منع إلغاء الراكب بعد بدء الرحلة', true, SQLERRM);
  END;

  BEGIN
    PERFORM public._e2e_as(d2);
    PERFORM public.change_trip_status(trip,'cancelled','x');
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T35 منع إلغاء السائق بعد بدء الرحلة', false, 'نجح الإلغاء!');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T35 منع إلغاء السائق بعد بدء الرحلة', true, SQLERRM);
  END;

  PERFORM public._e2e_as(d2);
  t := public.change_trip_status(trip,'completed',NULL);
  PERFORM public._e2e_reset();
  PERFORM public._e2e_log('C','T36 in_progress → completed ويضبط completed_at',
    t.status='completed' AND t.completed_at IS NOT NULL, 'completed_at='||coalesce(t.completed_at::text,'null'));

  BEGIN
    PERFORM public._e2e_as(adm);
    PERFORM public.change_trip_status(trip,'cancelled','x');
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T37 منع أي انتقال بعد completed حتى للمدير', false, 'نجح!');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T37 منع أي انتقال بعد completed حتى للمدير', true, SQLERRM);
  END;

  PERFORM public._e2e_as(cust);
  SELECT count(*) INTO n FROM public.worker_locations WHERE user_id=d2;
  PERFORM public._e2e_reset();
  PERFORM public._e2e_log('C','T38 ينقطع وصول الراكب لموقع السائق بعد الإكمال', n=0, 'rows='||n);

  SELECT count(*) INTO n FROM public.trip_status_history WHERE trip_id=trip;
  PERFORM public._e2e_log('C','T39 سجل الحالات يحفظ كل الانتقالات', n=6, 'history_rows='||n);

  -- التقييم
  SELECT rating, ratings_count INTO r0, c0 FROM public.worker_profiles WHERE user_id=d2;

  BEGIN
    PERFORM public._e2e_as(out1);
    PERFORM public.rate_trip(trip, 5, 'x');
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T40 غير الراكب لا يقدر يقيّم الرحلة', false, 'نجح!');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T40 غير الراكب لا يقدر يقيّم الرحلة', true, SQLERRM);
  END;

  PERFORM public._e2e_as(cust);
  PERFORM public.rate_trip(trip, 4, 'سواقة ممتازة');
  PERFORM public._e2e_reset();
  SELECT rating, ratings_count INTO r1, c1 FROM public.worker_profiles WHERE user_id=d2;
  PERFORM public._e2e_log('C','T41 التقييم بعد الإكمال يحدّث المتوسط والعدد',
    c1 = c0 + 1 AND r1 = ((r0*c0)+4)/(c0+1), 'before='||r0||'/'||c0||' after='||r1||'/'||c1);

  BEGIN
    PERFORM public._e2e_as(cust);
    PERFORM public.rate_trip(trip, 1, 'مرة ثانية');
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T42 منع التقييم مرتين لنفس الرحلة', false, 'نجح!');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T42 منع التقييم مرتين لنفس الرحلة', true, SQLERRM);
  END;

  BEGIN
    PERFORM public._e2e_as(cust);
    INSERT INTO public.trip_ratings(trip_id, rater_id, driver_id, stars) VALUES (trip, cust, d2, 5);
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T43 منع الإدراج المباشر في trip_ratings', false, 'تم الإدراج!');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T43 منع الإدراج المباشر في trip_ratings', true, SQLERRM);
  END;

  BEGIN
    PERFORM public._e2e_as(d2);
    UPDATE public.worker_profiles SET rating = 5, ratings_count = 999 WHERE user_id=d2;
    PERFORM public._e2e_reset();
    SELECT count(*) INTO n FROM public.worker_profiles WHERE user_id=d2 AND ratings_count=999;
    PERFORM public._e2e_log('C','T44 منع السائق من تعديل تقييمه مباشرة', n=0, 'rows='||n);
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('C','T44 منع السائق من تعديل تقييمه مباشرة', true, SQLERRM);
  END;
END $$;