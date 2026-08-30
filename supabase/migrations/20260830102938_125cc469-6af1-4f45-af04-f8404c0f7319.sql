CREATE SEQUENCE IF NOT EXISTS public.order_code_seq START 1;
SELECT setval('public.order_code_seq', GREATEST(1, (SELECT count(*) FROM public.orders)), true);
ALTER TABLE public.orders ALTER COLUMN code SET DEFAULT ('A' || lpad(nextval('public.order_code_seq')::text, 4, '0'));
GRANT USAGE, SELECT ON SEQUENCE public.order_code_seq TO authenticated, service_role;