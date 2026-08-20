-- 1) منع المخزون السالب
ALTER TABLE public.products
  ADD CONSTRAINT products_stock_non_negative CHECK (stock IS NULL OR stock >= 0);

-- 2) قاعدة تسعير للمتاجر
INSERT INTO public.pricing_rules (name, order_type, base_fee, per_km_fee, min_fee, is_active)
SELECT 'توصيل المتاجر - افتراضي', 'store', 2500, 500, 2500, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricing_rules WHERE order_type = 'store' AND city_id IS NULL AND provider_id IS NULL
);

-- 3) إنشاء الطلب: اشتقاق النوع + خصم المخزون ذرياً
CREATE OR REPLACE FUNCTION public.create_customer_order(
  _provider_id uuid,
  _items jsonb,
  _dropoff_text text,
  _dropoff_lat double precision DEFAULT NULL,
  _dropoff_lng double precision DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;
  IF COALESCE(btrim(_dropoff_text), '') = '' AND (_dropoff_lat IS NULL OR _dropoff_lng IS NULL) THEN
    RAISE EXCEPTION 'missing_dropoff';
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

  km := public.haversine_km(p.lat, p.lng, _dropoff_lat, _dropoff_lng);
  fee := public.compute_delivery_fee(otype, p.city_id, p.id, km);

  INSERT INTO public.orders (
    customer_id, provider_id, order_type, status, city_id,
    pickup_text, pickup_lat, pickup_lng,
    dropoff_text, dropoff_lat, dropoff_lng, notes,
    subtotal, delivery_fee, total
  ) VALUES (
    uid, p.id, otype, 'awaiting_provider', p.city_id,
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

REVOKE EXECUTE ON FUNCTION public.create_customer_order(uuid, jsonb, text, double precision, double precision, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_customer_order(uuid, jsonb, text, double precision, double precision, text) TO authenticated;

-- 4) طلب الانضمام كمزوّد (حالة pending فقط)
CREATE OR REPLACE FUNCTION public.apply_as_provider(
  _kind public.provider_kind,
  _name text,
  _description text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _city_id uuid DEFAULT NULL,
  _area_id uuid DEFAULT NULL,
  _address_text text DEFAULT NULL,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL
) RETURNS public.providers
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); pr public.providers;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _kind NOT IN ('restaurant','store') THEN RAISE EXCEPTION 'kind_not_allowed'; END IF;
  IF COALESCE(btrim(_name), '') = '' THEN RAISE EXCEPTION 'missing_name'; END IF;
  IF EXISTS (SELECT 1 FROM public.providers WHERE owner_id = uid) THEN
    RAISE EXCEPTION 'provider_already_exists';
  END IF;

  INSERT INTO public.providers (owner_id, kind, name, description, phone, city_id, area_id, address_text, lat, lng, status, is_open)
  VALUES (uid, _kind, btrim(_name), NULLIF(btrim(COALESCE(_description,'')),''), NULLIF(btrim(COALESCE(_phone,'')),''),
          _city_id, _area_id, NULLIF(btrim(COALESCE(_address_text,'')),''), _lat, _lng, 'pending', false)
  RETURNING * INTO pr;

  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'provider') ON CONFLICT DO NOTHING;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
  VALUES (uid, 'provider_application', 'providers', pr.id, to_jsonb(pr));

  RETURN pr;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.apply_as_provider(public.provider_kind, text, text, text, uuid, uuid, text, double precision, double precision) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.apply_as_provider(public.provider_kind, text, text, text, uuid, uuid, text, double precision, double precision) TO authenticated;

-- منع الإدراج المباشر للمزوّد من الواجهة (الانضمام عبر الدالة فقط)
DROP POLICY IF EXISTS providers_owner_insert ON public.providers;

-- 5) إجراء إداري لتغيير حالة المزوّد
CREATE OR REPLACE FUNCTION public.set_provider_status(
  _provider_id uuid,
  _status public.provider_status,
  _reason text DEFAULT NULL
) RETURNS public.providers
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); before_row public.providers; pr public.providers;
BEGIN
  IF uid IS NULL OR NOT public.is_staff(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO before_row FROM public.providers WHERE id = _provider_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_not_found'; END IF;

  UPDATE public.providers
     SET status = _status,
         is_open = CASE WHEN _status = 'approved' THEN is_open ELSE false END
   WHERE id = _provider_id
  RETURNING * INTO pr;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, before_data, after_data)
  VALUES (uid, 'provider_status_' || _status::text, 'providers', pr.id,
          to_jsonb(before_row), to_jsonb(pr) || jsonb_build_object('reason', _reason));

  INSERT INTO public.notifications (user_id, title, body, kind)
  SELECT pr.owner_id,
         CASE _status WHEN 'approved' THEN 'تم اعتماد متجرك'
                      WHEN 'rejected' THEN 'تم رفض طلب انضمامك'
                      WHEN 'suspended' THEN 'تم تعليق متجرك'
                      ELSE 'تحديث حالة متجرك' END,
         COALESCE(_reason, ''), 'provider'
  WHERE pr.owner_id IS NOT NULL;

  RETURN pr;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.set_provider_status(uuid, public.provider_status, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_provider_status(uuid, public.provider_status, text) TO authenticated;

-- 6) بيانات تجريبية: متجران في بغداد
INSERT INTO public.providers (id, kind, name, description, keywords, status, city_id, address_text, lat, lng, phone, is_open, rating, ratings_count, avg_prep_minutes)
SELECT '22222222-2222-4222-8222-222222222221', 'store', 'سوبرماركت الرشيد',
       'مواد غذائية ومنظفات واحتياجات البيت', ARRAY['سوبرماركت','بقالة','مواد غذائية','منظفات'],
       'approved', (SELECT id FROM public.cities ORDER BY sort_order LIMIT 1),
       'بغداد - الكرادة', 33.3050, 44.4200, '07700000011', true, 4.6, 12, 20
WHERE NOT EXISTS (SELECT 1 FROM public.providers WHERE id = '22222222-2222-4222-8222-222222222221');

INSERT INTO public.providers (id, kind, name, description, keywords, status, city_id, address_text, lat, lng, phone, is_open, rating, ratings_count, avg_prep_minutes)
SELECT '22222222-2222-4222-8222-222222222222', 'store', 'صيدلية الشفاء',
       'أدوية ومستلزمات صحية وعناية شخصية', ARRAY['صيدلية','دواء','عناية','مستلزمات طبية'],
       'approved', (SELECT id FROM public.cities ORDER BY sort_order LIMIT 1),
       'بغداد - المنصور', 33.3120, 44.3450, '07700000012', true, 4.8, 9, 15
WHERE NOT EXISTS (SELECT 1 FROM public.providers WHERE id = '22222222-2222-4222-8222-222222222222');

INSERT INTO public.menu_categories (id, provider_id, name, sort_order)
SELECT * FROM (VALUES
  ('33333333-3333-4333-8333-333333333301'::uuid, '22222222-2222-4222-8222-222222222221'::uuid, 'مواد غذائية', 1),
  ('33333333-3333-4333-8333-333333333302'::uuid, '22222222-2222-4222-8222-222222222221'::uuid, 'منظفات', 2),
  ('33333333-3333-4333-8333-333333333303'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'أدوية بدون وصفة', 1),
  ('33333333-3333-4333-8333-333333333304'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'عناية شخصية', 2)
) v(id, provider_id, name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.menu_categories WHERE id = v.id);

INSERT INTO public.products (id, provider_id, category_id, name, description, price, keywords, stock, is_available, sort_order)
SELECT * FROM (VALUES
  ('44444444-4444-4444-8444-444444444401'::uuid, '22222222-2222-4222-8222-222222222221'::uuid, '33333333-3333-4333-8333-333333333301'::uuid, 'رز عنبر 5 كغم', 'رز عراقي فاخر', 12000::numeric, ARRAY['رز','عنبر','طعام'], 40, true, 1),
  ('44444444-4444-4444-8444-444444444402'::uuid, '22222222-2222-4222-8222-222222222221'::uuid, '33333333-3333-4333-8333-333333333301'::uuid, 'زيت طعام 1 لتر', 'زيت نباتي للطبخ', 3500::numeric, ARRAY['زيت','طبخ'], 60, true, 2),
  ('44444444-4444-4444-8444-444444444403'::uuid, '22222222-2222-4222-8222-222222222221'::uuid, '33333333-3333-4333-8333-333333333302'::uuid, 'منظف أرضيات 2 لتر', 'برائحة الليمون', 4000::numeric, ARRAY['منظف','تنظيف'], 25, true, 3),
  ('44444444-4444-4444-8444-444444444404'::uuid, '22222222-2222-4222-8222-222222222221'::uuid, '33333333-3333-4333-8333-333333333302'::uuid, 'مسحوق غسيل 3 كغم', 'للغسالات الأوتوماتيكية', 9000::numeric, ARRAY['غسيل','مسحوق'], 0, true, 4),
  ('44444444-4444-4444-8444-444444444405'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, '33333333-3333-4333-8333-333333333303'::uuid, 'مسكن ألم 20 حبة', 'باراسيتامول 500 ملغم', 2500::numeric, ARRAY['مسكن','دواء','صداع'], 100, true, 1),
  ('44444444-4444-4444-8444-444444444406'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, '33333333-3333-4333-8333-333333333303'::uuid, 'فيتامين سي 30 حبة', 'مكمل غذائي', 7000::numeric, ARRAY['فيتامين','مكمل'], 30, true, 2),
  ('44444444-4444-4444-8444-444444444407'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, '33333333-3333-4333-8333-333333333304'::uuid, 'شامبو 400 مل', 'للشعر الجاف', 5500::numeric, ARRAY['شامبو','عناية'], 18, true, 3)
) v(id, provider_id, category_id, name, description, price, keywords, stock, is_available, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE id = v.id);