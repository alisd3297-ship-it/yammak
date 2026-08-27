CREATE OR REPLACE FUNCTION public.restock_on_order_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.products p
       SET stock = p.stock + oi.qty
      FROM (
        SELECT product_id, SUM(quantity)::int AS qty
        FROM public.order_items
        WHERE order_id = NEW.id AND product_id IS NOT NULL
        GROUP BY product_id
      ) oi
     WHERE p.id = oi.product_id AND p.stock IS NOT NULL;

    UPDATE public.delivery_offers
       SET status = 'cancelled', responded_at = now()
     WHERE order_id = NEW.id AND status = 'sent';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restock_on_order_cancel ON public.orders;
CREATE TRIGGER trg_restock_on_order_cancel
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
EXECUTE FUNCTION public.restock_on_order_cancel();

REVOKE ALL ON FUNCTION public.restock_on_order_cancel() FROM PUBLIC, anon, authenticated;
