
REVOKE EXECUTE ON FUNCTION public.create_service_request(uuid, text, text, double precision, double precision, timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.change_service_request_status(uuid, service_request_status, text, timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.rate_service_request(uuid, integer, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.apply_as_provider(provider_kind, text, text, text, uuid, uuid, text, double precision, double precision, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_see_service_request(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.service_request_actor(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_service_request_status() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_service_request(uuid, text, text, double precision, double precision, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_service_request_status(uuid, service_request_status, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rate_service_request(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_as_provider(provider_kind, text, text, text, uuid, uuid, text, double precision, double precision, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_service_request(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.service_request_actor(uuid, uuid) TO authenticated;
