DO $$
DECLARE
  cust uuid := '00000000-e2e6-0000-0000-000000000001';
  city uuid; t public.trips; trip1 uuid; f numeric; km float8;
BEGIN
  SELECT detail::uuid INTO trip1 FROM public._e2e_taxi WHERE name='TRIP1_ID';
  SELECT city_id INTO city FROM public.trips WHERE id=trip1;
  km := public.haversine_km(33.3152,44.3661,33.3406,44.4009);
  f := public.compute_taxi_fare(city,'economy',km);
  PERFORM public._e2e_log('D','T08 الأجرة المخزنة تساوي حساب الخادم بالمسافة الدقيقة',
    (SELECT fare FROM public.trips WHERE id=trip1) = f, 'stored='||(SELECT fare FROM public.trips WHERE id=trip1)||' expected='||f);

  PERFORM public._e2e_as(cust);
  t := public.create_taxi_trip('economy','الكرادة',33.3100,44.3900,'المنصور',33.3200,44.3300,1,'اختبار انتهاء المهلة');
  PERFORM public._e2e_reset();
  INSERT INTO public._e2e_taxi(step,name,ok,detail) VALUES ('D','TRIP2_ID', true, t.id::text);
  PERFORM public._e2e_log('D','T45 إنشاء رحلة اختبار ثانية', t.status='searching_driver', 'code='||t.code);
END $$;