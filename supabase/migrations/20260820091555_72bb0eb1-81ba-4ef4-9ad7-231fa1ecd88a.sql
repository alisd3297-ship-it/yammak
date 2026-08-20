CREATE OR REPLACE FUNCTION public.create_customer_order(_provider_id uuid, _items jsonb, _dropoff_text text, _dropoff_lat double precision DEFAULT NULL::double precision, _dropoff_lng double precision DEFAULT NULL::double precision, _notes text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  p record;
  it record;
  prod record;
  v_subtotal numeric := 0;
  fee numeric;
  km double precision;
  o public.orders;
  n int := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;
  IF COALESCE(btrim(_dropoff_text), '') = '' AND (_dropoff_lat IS NULL OR _dropoff_lng IS NULL) THEN
    RAISE EXCEPTION 'missing_dropoff';
  END IF;

  SELECT id, city_id, address_text, lat, lng, status, is_open
    INTO p FROM public.providers WHERE id = _provider_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_not_found'; END IF;
  IF p.status <> 'approved' THEN RAISE EXCEPTION 'provider_not_approved'; END IF;
  IF NOT p.is_open THEN RAISE EXCEPTION 'provider_closed'; END IF;

  km := public.haversine_km(p.lat, p.lng, _dropoff_lat, _dropoff_lng);
  fee := public.compute_delivery_fee('restaurant', p.city_id, p.id, km);

  INSERT INTO public.orders (
    customer_id, provider_id, order_type, status, city_id,
    pickup_text, pickup_lat, pickup_lng,
    dropoff_text, dropoff_lat, dropoff_lng, notes,
    subtotal, delivery_fee, total
  ) VALUES (
    uid, p.id, 'restaurant', 'awaiting_provider', p.city_id,
    p.address_text, p.lat, p.lng,
    COALESCE(NULLIF(btrim(_dropoff_text), ''), 'موقع محدد على الخريطة'), _dropoff_lat, _dropoff_lng, _notes,
    0, fee, fee
  ) RETURNING * INTO o;

  FOR it IN
    SELECT (e->>'product_id')::uuid AS product_id,
           GREATEST(LEAST(COALESCE((e->>'quantity')::int, 0), 50), 0) AS quantity,
           NULLIF(btrim(COALESCE(e->>'notes','')), '') AS notes
    FROM jsonb_array_elements(_items) e
  LOOP
    IF it.quantity <= 0 THEN CONTINUE; END IF;
    SELECT id, name, price, provider_id, is_available, stock
      INTO prod FROM public.products WHERE id = it.product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found: %', it.product_id; END IF;
    IF prod.provider_id <> p.id THEN RAISE EXCEPTION 'product_provider_mismatch'; END IF;
    IF NOT prod.is_available THEN RAISE EXCEPTION 'product_unavailable: %', prod.name; END IF;
    IF prod.stock IS NOT NULL AND prod.stock < it.quantity THEN
      RAISE EXCEPTION 'product_out_of_stock: %', prod.name;
    END IF;

    INSERT INTO public.order_items (order_id, product_id, name, unit_price, quantity, notes)
    VALUES (o.id, prod.id, prod.name, prod.price, it.quantity, it.notes);

    v_subtotal := v_subtotal + (prod.price * it.quantity);
    n := n + 1;
  END LOOP;

  IF n = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;

  UPDATE public.orders SET subtotal = v_subtotal, total = v_subtotal + fee
  WHERE id = o.id RETURNING * INTO o;

  RETURN o;
END; $function$;