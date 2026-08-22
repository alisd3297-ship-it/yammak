REVOKE ALL ON FUNCTION public.push_notification(uuid, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_order_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_order_admin_approval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_needs_admin_approval(order_type) FROM PUBLIC, anon;