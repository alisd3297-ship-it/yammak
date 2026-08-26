REVOKE EXECUTE ON FUNCTION public.create_customer_order(uuid, jsonb, text, double precision, double precision, text, text, integer, timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_customer_order(uuid, jsonb, text, double precision, double precision, text, text, integer, timestamp with time zone) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.feature_enabled(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.feature_enabled(text, uuid) TO authenticated, service_role;