CREATE OR REPLACE FUNCTION public.is_allowed_service_transition(_actor text, _from service_request_status, _to service_request_status)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _from = _to THEN RETURN false; END IF;
  IF _from IN ('completed','cancelled','rejected') THEN RETURN false; END IF;

  IF _to = 'cancelled' THEN
    RETURN CASE _actor
      WHEN 'customer' THEN _from IN ('requested','accepted','scheduled')
      WHEN 'provider' THEN _from IN ('accepted','scheduled','en_route')
      WHEN 'staff'    THEN true
      ELSE false END;
  END IF;

  IF _to = 'rejected' THEN
    RETURN _actor IN ('provider','staff') AND _from = 'requested';
  END IF;

  IF _actor = 'staff' THEN RETURN true; END IF;

  RETURN CASE _actor
    WHEN 'provider' THEN
      (_from = 'requested' AND _to IN ('accepted','scheduled'))
      OR (_from = 'accepted' AND _to IN ('scheduled','en_route','in_progress'))
      OR (_from = 'scheduled' AND _to IN ('en_route','in_progress'))
      OR (_from = 'en_route' AND _to = 'in_progress')
      OR (_from = 'in_progress' AND _to = 'completed')
    WHEN 'customer' THEN
      (_from = 'in_progress' AND _to = 'completed')
    ELSE false END;
END;
$function$;