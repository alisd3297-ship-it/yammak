CREATE UNIQUE INDEX IF NOT EXISTS orders_code_uidx ON public.orders (code);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON public.orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_driver ON public.orders (driver_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_provider ON public.orders (provider_id, status);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON public.order_status_history (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items (order_id);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_offers_order_driver_uidx ON public.delivery_offers (order_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_offers_driver_status ON public.delivery_offers (driver_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_offers_order_status ON public.delivery_offers (order_id, status);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications (user_id) WHERE is_read = false;
