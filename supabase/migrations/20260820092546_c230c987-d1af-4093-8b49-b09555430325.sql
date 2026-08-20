DROP POLICY IF EXISTS offers_read ON public.delivery_offers;
CREATE POLICY offers_read ON public.delivery_offers
FOR SELECT TO authenticated
USING (
  driver_id = auth.uid()
  OR public.is_staff(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = delivery_offers.order_id
      AND (o.customer_id = auth.uid() OR public.owns_provider(auth.uid(), o.provider_id))
  )
);