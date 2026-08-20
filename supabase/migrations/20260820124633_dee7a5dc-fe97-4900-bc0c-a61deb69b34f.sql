-- إصلاح: سجل حالة الرحلة يجب أن يُكتب بعد الإدراج لا قبله
DROP TRIGGER IF EXISTS trg_trips_log_status ON public.trips;
CREATE TRIGGER trg_trip_status_ins AFTER INSERT ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.log_trip_status();
CREATE TRIGGER trg_trip_status_upd BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.log_trip_status();

CREATE TABLE IF NOT EXISTS public._e2e_taxi (
  id bigserial primary key,
  step text not null,
  name text not null,
  ok boolean not null,
  detail text,
  created_at timestamptz not null default now()
);
REVOKE ALL ON public._e2e_taxi FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._e2e_log(_step text, _name text, _ok boolean, _detail text DEFAULT NULL)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  INSERT INTO public._e2e_taxi(step, name, ok, detail) VALUES (_step, _name, _ok, _detail);
$$;

CREATE OR REPLACE FUNCTION public._e2e_as(_uid uuid) RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid::text, 'role','authenticated')::text, false);
  PERFORM set_config('role', 'authenticated', false);
END; $$;

CREATE OR REPLACE FUNCTION public._e2e_reset() RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM set_config('role', 'none', false);
  PERFORM set_config('request.jwt.claims', '', false);
END; $$;

DO $$
DECLARE
  cust uuid := '00000000-e2e6-0000-0000-000000000001';
  d1   uuid := '00000000-e2e6-0000-0000-000000000002';
  d2   uuid := '00000000-e2e6-0000-0000-000000000003';
  adm  uuid := '00000000-e2e6-0000-0000-000000000004';
  out1 uuid := '00000000-e2e6-0000-0000-000000000005';
  city uuid;
  q jsonb; f numeric; f2 numeric; t public.trips; n int;
BEGIN
  SELECT id INTO city FROM public.cities WHERE is_active ORDER BY sort_order LIMIT 1;

  INSERT INTO public.profiles (id, full_name, phone, city_id) VALUES
    (cust,'E2E راكب','07000000001',city),
    (d1,'E2E سائق أول','07000000002',city),
    (d2,'E2E سائق ثاني','07000000003',city),
    (adm,'E2E مدير','07000000004',city),
    (out1,'E2E خارجي','07000000005',city)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles(user_id, role) VALUES (adm,'admin') ON CONFLICT DO NOTHING;

  PERFORM public._e2e_as(d1);
  PERFORM public.apply_as_driver('taxi', city, 'Toyota','Corolla','أبيض','12345', 'economy', 4, NULL, '07000000002');
  PERFORM public._e2e_reset();
  PERFORM public._e2e_as(d2);
  PERFORM public.apply_as_driver('taxi', city, 'Kia','Sportage','أسود','54321', 'comfort', 4, NULL, '07000000003');
  PERFORM public._e2e_reset();

  SELECT count(*) INTO n FROM public.worker_profiles WHERE user_id IN (d1,d2) AND is_approved = false AND requested_kind='taxi';
  PERFORM public._e2e_log('A','T01 تقديم السائقين ينشئ حالة pending فقط', n = 2, 'pending='||n);

  BEGIN
    PERFORM public._e2e_as(d1);
    PERFORM public.set_worker_approval(d1, true, 'self');
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('A','T02 منع السائق من اعتماد نفسه عبر RPC', false, 'نجح الاعتماد الذاتي!');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('A','T02 منع السائق من اعتماد نفسه عبر RPC', true, SQLERRM);
  END;

  BEGIN
    PERFORM public._e2e_as(d1);
    UPDATE public.worker_profiles SET is_approved = true WHERE user_id = d1;
    PERFORM public._e2e_reset();
    SELECT count(*) INTO n FROM public.worker_profiles WHERE user_id=d1 AND is_approved;
    PERFORM public._e2e_log('A','T03 منع السائق من تعديل is_approved مباشرة', n=0, 'approved_rows='||n);
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('A','T03 منع السائق من تعديل is_approved مباشرة', true, SQLERRM);
  END;

  PERFORM public._e2e_as(adm);
  PERFORM public.set_worker_approval(d1, true, 'e2e');
  PERFORM public.set_worker_approval(d2, true, 'e2e');
  PERFORM public._e2e_reset();
  SELECT count(*) INTO n FROM public.worker_profiles WHERE user_id IN (d1,d2) AND is_approved AND worker_kind='taxi';
  PERFORM public._e2e_log('A','T04 المدير يعتمد السائقين ويثبت worker_kind', n=2, 'approved='||n);

  UPDATE public.worker_profiles SET is_available = true, taxi_seats = 4 WHERE user_id IN (d1,d2);
  INSERT INTO public.worker_locations(user_id, lat, lng, is_online, updated_at) VALUES
    (d1, 33.3160, 44.3660, true, now()),
    (d2, 33.3400, 44.4000, true, now())
  ON CONFLICT (user_id) DO UPDATE SET lat=EXCLUDED.lat, lng=EXCLUDED.lng, is_online=true, updated_at=now();

  PERFORM public._e2e_as(cust);
  q := public.quote_taxi_trip('economy', 33.3152, 44.3661, 33.3406, 44.4009);
  PERFORM public._e2e_reset();
  f := public.compute_taxi_fare(city,'economy', (q->>'km')::float8);
  PERFORM public._e2e_log('A','T05 quote يطابق حساب الخادم compute_taxi_fare', (q->>'fare')::numeric = f,
    'quote='||(q->>'fare')||' expected='||f||' km='||(q->>'km'));

  PERFORM public._e2e_as(cust);
  q := public.quote_taxi_trip('van', 33.3152, 44.3661, 33.3406, 44.4009);
  PERFORM public._e2e_reset();
  f2 := (q->>'fare')::numeric;
  PERFORM public._e2e_log('A','T06 تغيير الفئة يعيد التسعير من الخادم', f2 <> f, 'economy='||f||' van='||f2);

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='create_taxi_trip'
     AND pg_get_function_arguments(p.oid) ~* '(fare|distance|_km)';
  PERFORM public._e2e_log('A','T07 create_taxi_trip لا يقبل fare/distance من العميل', n=0, 'matching_args='||n);

  PERFORM public._e2e_as(cust);
  t := public.create_taxi_trip('economy','ساحة الفردوس',33.3152,44.3661,'الجادرية',33.3406,44.4009,2,'اختبار E2E');
  PERFORM public._e2e_reset();
  PERFORM public._e2e_log('A','T08 إنشاء رحلة searching_driver بأجرة محسوبة خادمياً',
    t.status='searching_driver' AND t.fare = public.compute_taxi_fare(city,'economy', t.distance_km::float8),
    'code='||t.code||' status='||t.status||' fare='||t.fare||' km='||t.distance_km);

  BEGIN
    PERFORM public._e2e_as(cust);
    UPDATE public.trips SET fare = 500 WHERE id = t.id;
    PERFORM public._e2e_reset();
    SELECT count(*) INTO n FROM public.trips WHERE id=t.id AND fare=500;
    PERFORM public._e2e_log('A','T09 منع الراكب من تعديل الأجرة مباشرة', n=0, 'rows_changed='||n);
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('A','T09 منع الراكب من تعديل الأجرة مباشرة', true, SQLERRM);
  END;

  BEGIN
    PERFORM public._e2e_as(cust);
    INSERT INTO public.trips(customer_id, city_id, status, taxi_class, passengers, pickup_text, destination_text, distance_km, fare, payment_method)
    VALUES (cust, city, 'searching_driver','economy',1,'أ','ب',1,100,'cash');
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('A','T10 منع الإدراج المباشر في trips', false, 'تم الإدراج!');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('A','T10 منع الإدراج المباشر في trips', true, SQLERRM);
  END;

  BEGIN
    PERFORM public._e2e_as(cust);
    UPDATE public.trips SET driver_id = d1, status='driver_assigned' WHERE id=t.id;
    PERFORM public._e2e_reset();
    SELECT count(*) INTO n FROM public.trips WHERE id=t.id AND driver_id=d1;
    PERFORM public._e2e_log('A','T11 منع الراكب من إسناد سائق أو تغيير الحالة مباشرة', n=0, 'rows='||n);
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._e2e_reset();
    PERFORM public._e2e_log('A','T11 منع الراكب من إسناد سائق أو تغيير الحالة مباشرة', true, SQLERRM);
  END;

  PERFORM public._e2e_as(out1);
  SELECT count(*) INTO n FROM public.trips WHERE id = t.id;
  PERFORM public._e2e_reset();
  PERFORM public._e2e_log('A','T12 مستخدم خارجي لا يرى الرحلة (RLS)', n=0, 'visible='||n);

  PERFORM public._e2e_as(cust);
  SELECT count(*) INTO n FROM public.trips WHERE id = t.id;
  PERFORM public._e2e_reset();
  PERFORM public._e2e_log('A','T13 الراكب يرى رحلته في /orders (استعلام حي)', n=1, 'visible='||n);

  SELECT count(*) INTO n FROM public.trip_status_history WHERE trip_id = t.id;
  PERFORM public._e2e_log('A','T14 سجل الحالات يُنشأ عند إنشاء الرحلة', n>=1, 'history_rows='||n);

  INSERT INTO public._e2e_taxi(step,name,ok,detail) VALUES ('A','TRIP1_ID', true, t.id::text);
END $$;