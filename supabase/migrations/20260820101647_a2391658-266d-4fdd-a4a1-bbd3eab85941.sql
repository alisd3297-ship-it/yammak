CREATE OR REPLACE FUNCTION public.create_service_request(
  _service_id uuid,
  _address_text text,
  _description text DEFAULT NULL,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL,
  _scheduled_at timestamptz DEFAULT NULL
) RETURNS service_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  s public.provider_services;
  p record;
  r public.service_requests;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF COALESCE(btrim(_address_text), '') = '' AND (_lat IS NULL OR _lng IS NULL) THEN
    RAISE EXCEPTION 'missing_location';
  END IF;
  IF _scheduled_at IS NOT NULL AND _scheduled_at < now() - interval '1 hour' THEN
    RAISE EXCEPTION 'invalid_schedule';
  END IF;

  SELECT * INTO s FROM public.provider_services WHERE id = _service_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'service_not_found'; END IF;
  IF NOT s.is_active THEN RAISE EXCEPTION 'service_unavailable'; END IF;

  SELECT id, kind, status, is_open, city_id, owner_id INTO p FROM public.providers WHERE id = s.provider_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_not_found'; END IF;
  IF p.status <> 'approved' THEN RAISE EXCEPTION 'provider_not_approved'; END IF;
  IF p.kind <> 'profession' THEN RAISE EXCEPTION 'provider_kind_not_service'; END IF;
  IF p.owner_id = uid THEN RAISE EXCEPTION 'cannot_order_own_service'; END IF;

  INSERT INTO public.service_requests (
    customer_id, provider_id, service_id, city_id, service_name,
    price_amount, price_unit, description, address_text, lat, lng, scheduled_at,
    status
  ) VALUES (
    uid, p.id, s.id, p.city_id, s.name,
    s.price_amount, s.price_unit,
    NULLIF(btrim(COALESCE(_description,'')),''),
    COALESCE(NULLIF(btrim(_address_text),''), 'موقع محدد على الخريطة'),
    _lat, _lng, _scheduled_at,
    'requested'::public.service_request_status
  ) RETURNING * INTO r;

  IF p.owner_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, kind)
    VALUES (p.owner_id, 'طلب خدمة جديد', 'وصلك طلب خدمة: ' || s.name, 'service');
  END IF;

  RETURN r;
END; $$;