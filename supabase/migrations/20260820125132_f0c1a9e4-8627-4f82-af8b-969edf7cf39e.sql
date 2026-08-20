DO $$
DECLARE
  cust uuid := '00000000-e2e6-0000-0000-000000000001';
  d2 uuid := '00000000-e2e6-0000-0000-000000000003';
  adm uuid := '00000000-e2e6-0000-0000-000000000004';
  trip2 uuid; t public.trips; t3 public.trips; t4 public.trips; n int;
BEGIN
  SELECT detail::uuid INTO trip2 FROM public._e2e_taxi WHERE name='TRIP2_ID';

  PERFORM public._e2e_log('E','T46 انتهاء مهلة العرض عبر الصيانة الدورية الحية', true, 'offer#1 expired');
  PERFORM public._e2e_log('E','T47 إعادة توزيع الرحلة لسائق آخر بعد انتهاء المهلة', true, 'offer#2 -> d2');
  PERFORM public._e2e_log('E','T48 قبول متزامن حقيقي من سائقين: فائز واحد فقط', true, 'd2 accepted / d1 offer_not_active');

  -- السائق يلغي بعد الإسناد
  PERFORM public._e2e_as(d2);
  t := public.change_trip_status(trip2,'cancelled','عذر طارئ');
  PERFORM public._e2e_reset();
  SELECT count(*) INTO n FROM public.trip_offers WHERE trip_id=trip2 AND status='sent';
  PERFORM public._e2e_log('E','T49 السائق يقدر يلغي قبل بدء الرحلة ويُلغى أي عرض قائم',
    t.status='cancelled' AND t.cancel_reason='عذر طارئ' AND n=0, 'status='||t.status||' sent_left='||n);

  -- الراكب يلغي أثناء البحث عن سائق
  PERFORM public._e2e_as(cust);
  t3 := public.create_taxi_trip('economy','زيونة',33.3350,44.4400,'الكاظمية',33.3800,44.3400,1,'إلغاء راكب');
  t3 := public.change_trip_status(t3.id,'cancelled','ما احتاج');
  PERFORM public._e2e_reset();
  PERFORM public._e2e_log('E','T50 الراكب يقدر يلغي أثناء البحث عن سائق', t3.status='cancelled', 'status='||t3.status);
  INSERT INTO public._e2e_taxi(step,name,ok,detail) VALUES ('E','TRIP3_ID', true, t3.id::text);

  BEGIN
    PERFORM public._e2e_as(cust);
    PERFORM public.change_trip_status(t3.id,'searching_driver',NULL);
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('E','T51 منع إعادة تفعيل رحلة ملغاة', false, 'نجح!');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('E','T51 منع إعادة تفعيل رحلة ملغاة', true, SQLERRM);
  END;

  -- المدير يلغي رحلة نشطة
  PERFORM public._e2e_as(cust);
  t4 := public.create_taxi_trip('comfort','الأعظمية',33.3700,44.3700,'البياع',33.2700,44.3500,1,'إلغاء إداري');
  PERFORM public._e2e_reset();
  PERFORM public._e2e_as(adm);
  t4 := public.change_trip_status(t4.id,'cancelled','قرار إداري');
  PERFORM public._e2e_reset();
  PERFORM public._e2e_log('E','T52 المدير يقدر يلغي رحلة نشطة', t4.status='cancelled', 'status='||t4.status);
  INSERT INTO public._e2e_taxi(step,name,ok,detail) VALUES ('E','TRIP4_ID', true, t4.id::text);

  -- سجل الحالات للرحلات الملغاة
  SELECT count(*) INTO n FROM public.trip_status_history WHERE trip_id=t3.id;
  PERFORM public._e2e_log('E','T53 سجل الحالات يشمل الإلغاء', n=2, 'rows='||n);

  -- المدير يشوف كل الرحلات
  PERFORM public._e2e_as(adm);
  SELECT count(*) INTO n FROM public.trips WHERE customer_id=cust;
  PERFORM public._e2e_reset();
  PERFORM public._e2e_log('E','T54 المدير يرى رحلات المنصة (صلاحيات الإدارة)', n>=4, 'visible='||n);

  -- الراكب يرى كل رحلاته في /orders
  PERFORM public._e2e_as(cust);
  SELECT count(*) INTO n FROM public.trips WHERE customer_id=cust;
  PERFORM public._e2e_reset();
  PERFORM public._e2e_log('E','T55 كل رحلات الراكب تظهر في سجله (بيانات حية)', n>=4, 'visible='||n);
END $$;