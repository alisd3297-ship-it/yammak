DO $$
DECLARE ids uuid[];
BEGIN
  SELECT array_agg(id) INTO ids FROM auth.users WHERE email LIKE 'e2e%@yammaktest.dev' OR email LIKE 'e2e_%@example.com';
  IF ids IS NULL THEN RETURN; END IF;

  DELETE FROM public.ratings WHERE rater_id = ANY(ids) OR order_id IN (SELECT id FROM public.orders WHERE customer_id = ANY(ids));
  DELETE FROM public.notifications WHERE user_id = ANY(ids) OR order_id IN (SELECT id FROM public.orders WHERE customer_id = ANY(ids));
  DELETE FROM public.delivery_offers WHERE driver_id = ANY(ids) OR order_id IN (SELECT id FROM public.orders WHERE customer_id = ANY(ids));
  DELETE FROM public.order_status_history WHERE order_id IN (SELECT id FROM public.orders WHERE customer_id = ANY(ids));
  DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE customer_id = ANY(ids));
  DELETE FROM public.orders WHERE customer_id = ANY(ids) OR provider_id = '11111111-1111-4111-8111-111111111111';
  DELETE FROM public.products WHERE provider_id = '11111111-1111-4111-8111-111111111111';
  DELETE FROM public.menu_categories WHERE provider_id = '11111111-1111-4111-8111-111111111111';
  DELETE FROM public.providers WHERE id = '11111111-1111-4111-8111-111111111111';
  DELETE FROM public.worker_locations WHERE user_id = ANY(ids);
  DELETE FROM public.worker_profiles WHERE user_id = ANY(ids);
  DELETE FROM public.user_roles WHERE user_id = ANY(ids);
  DELETE FROM public.profiles WHERE id = ANY(ids);
  DELETE FROM auth.users WHERE id = ANY(ids);
END $$;