DO $$
DECLARE ids uuid[] := ARRAY[
  '00000000-e2e6-0000-0000-000000000001','00000000-e2e6-0000-0000-000000000002',
  '00000000-e2e6-0000-0000-000000000003','00000000-e2e6-0000-0000-000000000004',
  '00000000-e2e6-0000-0000-000000000005']::uuid[];
BEGIN
  DELETE FROM public.trip_ratings WHERE rater_id = ANY(ids) OR driver_id = ANY(ids);
  DELETE FROM public.trip_status_history WHERE trip_id IN (SELECT id FROM public.trips WHERE customer_id = ANY(ids));
  DELETE FROM public.trip_offers WHERE driver_id = ANY(ids);
  DELETE FROM public.trips WHERE customer_id = ANY(ids) OR driver_id = ANY(ids);
  DELETE FROM public.notifications WHERE user_id = ANY(ids);
  DELETE FROM public.audit_logs WHERE actor_id = ANY(ids) OR entity_id = ANY(ids);
  DELETE FROM public.worker_locations WHERE user_id = ANY(ids);
  DELETE FROM public.worker_profiles WHERE user_id = ANY(ids);
  DELETE FROM public.user_roles WHERE user_id = ANY(ids);
  DELETE FROM public.profiles WHERE id = ANY(ids);
END $$;

DROP FUNCTION IF EXISTS public._e2e_accept_as(uuid,uuid);
DROP FUNCTION IF EXISTS public._e2e_force_expire(uuid);
DROP FUNCTION IF EXISTS public._e2e_make_offer(uuid,uuid);
DROP FUNCTION IF EXISTS public._e2e_log(text,text,boolean,text);
DROP FUNCTION IF EXISTS public._e2e_as(uuid);
DROP FUNCTION IF EXISTS public._e2e_reset();
DROP TABLE IF EXISTS public._e2e_taxi;