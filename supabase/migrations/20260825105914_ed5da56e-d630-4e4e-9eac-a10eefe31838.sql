ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment text NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS party_size integer;

DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_fulfillment_chk
    CHECK (fulfillment IN ('delivery','takeaway','dine_in'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.create_customer_order(
  _provider_id uuid,
  _items jsonb,
  _dropoff_text text,
  _dropoff_lat double precision DEFAULT NULL::double precision,
  _dropoff_lng double precision DEFAULT NULL::double precision,
  _notes text DEFAULT NULL::text,
  _fulfillment text DEFAULT 'delivery',
  _party_size integer DEFAULT NULL,
  _scheduled_at timestamptz DEFAULT NULL
)
RETURNS public.orders
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
  otype public.order_type;
  new_stock int;
  v_ful text := lower(coalesce(nullif(btrim(_fulfillment), ''), 'delivery'));
  v_party int := NULL;
  v_sched timestamptz := NULL;
  v_drop text;
  v_lat double precision;
  v_lng double precision;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF v_ful NOT IN ('delivery','takeaway','dine_in') THEN v_ful := 'delivery'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;

  SELECT id, city_id, address_text, lat, lng, status, is_open, kind
    INTO p FROM public.providers WHERE id = _provider_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_not_found'; END IF;
  IF p.status <> 'approved' THEN RAISE EXCEPTION 'provider_not_approved'; END IF;
  IF NOT p.is_open THEN RAISE EXCEPTION 'provider_closed'; END IF;

  otype := CASE p.kind
    WHEN 'restaurant' THEN 'restaurant'::public.order_type
    WHEN 'store' THEN 'store'::public.order_type
    ELSE NULL END;
  IF otype IS NULL THEN RAISE EXCEPTION 'provider_kind_not_orderable'; END IF;

  IF v_ful = 'dine_in' AND p.kind <> 'restaurant' THEN
    RAISE EXCEPTION 'dine_in_not_supported';
  END IF;

  IF v_ful = 'delivery' THEN
    IF COALESCE(btrim(_dropoff_text), '') = '' AND (_dropoff_lat IS NULL OR _dropoff_lng IS NULL) THEN
      RAISE EXCEPTION 'missing_dropoff';
    END IF;
    km := public.haversine_km(p.lat, p.lng, _dropoff_lat, _dropoff_lng);
    fee := public.compute_delivery_fee(otype, p.city_id, p.id, km);
    v_drop := COALESCE(NULLIF(btrim(_dropoff_text), ''), 'موقع محدد على الخريطة');
    v_lat := _dropoff_lat;
    v_lng := _dropoff_lng;
  ELSE
    fee := 0;
    v_drop := COALESCE(NULLIF(btrim(p.address_text), ''), 'استلام من المحل');
    v_lat := p.lat;
    v_lng := p.lng;
    IF v_ful = 'dine_in' THEN
      v_party := GREATEST(LEAST(COALESCE(_party_size, 1), 50), 1);
      v_sched := _scheduled_at;
    END IF;
  END IF;

  INSERT INTO public.orders (
    customer_id, provider_id, order_type, status, city_id,
    pickup_text, pickup_lat, pickup_lng,
    dropoff_text, dropoff_lat, dropoff_lng, notes,
    subtotal, delivery_fee, total, fulfillment, party_size, scheduled_at
  ) VALUES (
    uid, p.id, otype, 'awaiting_provider', p.city_id,
    p.address_text, p.lat, p.lng,
    v_drop, v_lat, v_lng, _notes,
    0, fee, fee, v_ful, v_party, v_sched
  ) RETURNING * INTO o;

  FOR it IN
    SELECT (e->>'product_id')::uuid AS product_id,
           GREATEST(LEAST(COALESCE((e->>'quantity')::int, 0), 50), 0) AS quantity,
           NULLIF(btrim(COALESCE(e->>'notes','')), '') AS notes
    FROM jsonb_array_elements(_items) e
  LOOP
    IF it.quantity <= 0 THEN CONTINUE; END IF;

    SELECT id, name, price, provider_id, is_available, stock
      INTO prod FROM public.products WHERE id = it.product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found: %', it.product_id; END IF;
    IF prod.provider_id <> p.id THEN RAISE EXCEPTION 'product_provider_mismatch'; END IF;
    IF NOT prod.is_available THEN RAISE EXCEPTION 'product_unavailable: %', prod.name; END IF;

    IF prod.stock IS NOT NULL THEN
      UPDATE public.products
         SET stock = stock - it.quantity
       WHERE id = prod.id AND stock >= it.quantity
      RETURNING stock INTO new_stock;
      IF new_stock IS NULL THEN
        RAISE EXCEPTION 'product_out_of_stock: %', prod.name;
      END IF;
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

CREATE OR REPLACE FUNCTION public.change_order_status(_order_id uuid, _new_status order_status, _reason text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  uid uuid := auth.uid();
  actor text;
  pay record;
  pickup_ok boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  actor := public.order_actor(uid, _order_id);
  IF actor IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- طلبات السفري والحجز بالصالة: تُنهى عند الاستلام من المحل بدون مندوب
  pickup_ok := COALESCE(o.fulfillment, 'delivery') IN ('takeaway','dine_in')
    AND o.status = 'ready_for_pickup'
    AND _new_status = 'completed'
    AND actor IN ('customer','provider','staff');

  IF NOT pickup_ok AND NOT public.is_allowed_transition(actor, o.status, _new_status, o.order_type) THEN
    RAISE EXCEPTION 'transition_not_allowed: % -> % (%)', o.status, _new_status, actor;
  END IF;

  IF actor = 'customer' AND _new_status = 'completed'
     AND public.otp_flag('require_for_order_completion')
     AND NOT public.is_phone_verified(uid) THEN
    INSERT INTO public.audit_logs (actor_id, action, entity, entity_id)
    VALUES (uid, 'otp_required_blocked', 'order', _order_id);
    RAISE EXCEPTION 'phone_verification_required';
  END IF;

  UPDATE public.orders SET
    status = _new_status,
    cancel_reason = CASE WHEN _new_status = 'cancelled' THEN COALESCE(_reason, cancel_reason) ELSE cancel_reason END,
    completed_at = CASE WHEN _new_status = 'completed' THEN now() ELSE completed_at END
  WHERE id = _order_id
  RETURNING * INTO o;

  IF _new_status = 'cancelled' THEN
    UPDATE public.delivery_offers SET status = 'cancelled', responded_at = now()
    WHERE order_id = _order_id AND status = 'sent';

    FOR pay IN
      SELECT id FROM public.payments
      WHERE subject_type = 'order' AND subject_id = _order_id
        AND status = 'succeeded' AND refunded_amount < amount
    LOOP
      PERFORM public.request_payment_refund(pay.id, NULL, COALESCE(_reason, 'order_cancelled'));
    END LOOP;
  END IF;

  RETURN o;
END; $function$;