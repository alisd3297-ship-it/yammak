REVOKE EXECUTE ON FUNCTION public.quote_special_delivery(public.vehicle_type, double precision, double precision, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_special_delivery_order(public.vehicle_type, text, double precision, double precision, jsonb, text, numeric, timestamptz, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_order_stop(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compute_delivery_fee_v(public.order_type, uuid, public.vehicle_type, double precision) FROM PUBLIC, anon;