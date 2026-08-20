CREATE OR REPLACE FUNCTION public._e2e_accept_as(_uid uuid, _offer uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.trips;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid::text, 'role','authenticated')::text, true);
  PERFORM pg_sleep(0.4);
  t := public.accept_trip_offer(_offer);
  RETURN 'accepted:' || t.driver_id::text;
EXCEPTION WHEN OTHERS THEN
  RETURN 'error:' || SQLERRM;
END; $$;

CREATE OR REPLACE FUNCTION public._e2e_force_expire(_trip uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.trip_offers SET expires_at = now() - interval '1 minute'
   WHERE trip_id = _trip AND status = 'sent';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;

CREATE OR REPLACE FUNCTION public._e2e_make_offer(_trip uuid, _driver uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE oid uuid;
BEGIN
  INSERT INTO public.trip_offers(trip_id, driver_id, status, distance_km, expires_at)
  VALUES (_trip, _driver, 'sent', 1, now() + interval '10 minutes') RETURNING id INTO oid;
  RETURN oid;
END; $$;

GRANT EXECUTE ON FUNCTION public._e2e_accept_as(uuid,uuid), public._e2e_force_expire(uuid),
  public._e2e_make_offer(uuid,uuid), public._e2e_log(text,text,boolean,text) TO PUBLIC;