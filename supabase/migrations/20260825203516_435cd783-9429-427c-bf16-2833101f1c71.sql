CREATE OR REPLACE FUNCTION public.is_allowed_transition(_actor text, _from order_status, _to order_status, _order_type order_type)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE direct boolean := _order_type IN ('courier'::public.order_type, 'special_delivery'::public.order_type);
BEGIN
  IF _from = _to THEN RETURN false; END IF;
  IF _from IN ('completed','cancelled') THEN RETURN false; END IF;

  IF _to = 'cancelled' THEN
    IF direct THEN
      RETURN CASE _actor
        WHEN 'customer' THEN _from IN ('new','searching_driver','offered_to_driver','driver_accepted')
        WHEN 'staff'    THEN true
        ELSE false END;
    END IF;
    RETURN CASE _actor
      WHEN 'customer' THEN _from IN ('new','awaiting_provider','accepted')
      WHEN 'provider' THEN _from IN ('new','awaiting_provider','accepted','preparing')
      WHEN 'staff'    THEN true
      ELSE false END;
  END IF;

  IF _actor = 'staff' THEN RETURN true; END IF;

  IF direct THEN
    RETURN CASE _actor
      WHEN 'driver' THEN
        (_from = 'driver_accepted' AND _to = 'driver_heading_pickup')
        OR (_from = 'driver_heading_pickup' AND _to = 'picked_up')
        OR (_from = 'picked_up' AND _to = 'on_the_way')
        OR (_from = 'on_the_way' AND _to = 'delivered')
      WHEN 'customer' THEN (_from = 'delivered' AND _to = 'completed')
      WHEN 'system' THEN
        (_from = 'new' AND _to = 'searching_driver')
        OR (_from = 'searching_driver' AND _to = 'offered_to_driver')
        OR (_from = 'offered_to_driver' AND _to IN ('searching_driver','driver_accepted'))
        OR (_from = 'delivered' AND _to = 'completed')
      ELSE false END;
  END IF;

  RETURN CASE _actor
    WHEN 'provider' THEN
      (_from = 'new' AND _to = 'awaiting_provider')
      OR (_from = 'awaiting_provider' AND _to = 'accepted')
      OR (_from = 'accepted' AND _to IN ('preparing','ready_for_pickup'))
      OR (_from = 'preparing' AND _to = 'ready_for_pickup')
      OR (_from = 'ready_for_pickup' AND _to = 'searching_driver')
    WHEN 'driver' THEN
      (_from = 'driver_accepted' AND _to = 'driver_heading_pickup')
      OR (_from = 'driver_heading_pickup' AND _to = 'picked_up')
      OR (_from = 'picked_up' AND _to = 'on_the_way')
      OR (_from = 'on_the_way' AND _to = 'delivered')
    WHEN 'customer' THEN (_from = 'delivered' AND _to = 'completed')
    WHEN 'system' THEN
      (_from = 'ready_for_pickup' AND _to = 'searching_driver')
      OR (_from = 'searching_driver' AND _to = 'offered_to_driver')
      OR (_from = 'offered_to_driver' AND _to IN ('searching_driver','driver_accepted'))
      OR (_from = 'delivered' AND _to = 'completed')
    ELSE false END;
END; $function$;