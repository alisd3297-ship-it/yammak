REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.orders FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.order_items FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.order_status_history FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.delivery_offers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.notifications FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.ratings FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.worker_locations FROM anon;
REVOKE SELECT ON public.orders, public.order_items, public.order_status_history, public.delivery_offers, public.notifications, public.worker_locations FROM anon;
REVOKE TRUNCATE, REFERENCES ON public.orders, public.order_items, public.order_status_history, public.delivery_offers FROM authenticated;