
ALTER TABLE public.provider_services
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'IQD';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_services_currency_check') THEN
    ALTER TABLE public.provider_services
      ADD CONSTRAINT provider_services_currency_check CHECK (currency IN ('IQD','USD'));
  END IF;
END $$;

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'IQD',
  ADD COLUMN IF NOT EXISTS cost_amount numeric;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_requests_currency_check') THEN
    ALTER TABLE public.service_requests
      ADD CONSTRAINT service_requests_currency_check CHECK (currency IN ('IQD','USD'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_service_request(_service_id uuid, _address_text text, _description text DEFAULT NULL::text, _lat double precision DEFAULT NULL::double precision, _lng double precision DEFAULT NULL::double precision, _scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS service_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    price_amount, price_unit, currency, cost_amount,
    description, address_text, lat, lng, scheduled_at,
    status
  ) VALUES (
    uid, p.id, s.id, p.city_id, s.name,
    s.price_amount, s.price_unit,
    CASE WHEN upper(COALESCE(s.currency,'IQD')) = 'USD' THEN 'USD' ELSE 'IQD' END,
    s.cost_amount,
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
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_orders_report(_from timestamp with time zone, _to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); can_finance boolean; result jsonb;
BEGIN
  IF uid IS NULL OR NOT public.is_staff(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  can_finance := public.has_role(uid,'admin') OR public.has_role(uid,'super_admin');

  SELECT jsonb_build_object(
    'from', _from, 'to', _to, 'can_finance', can_finance,
    'currency', 'IQD',
    'totals', (
      SELECT jsonb_build_object(
        'orders', count(*),
        'completed', count(*) FILTER (WHERE status IN ('completed','delivered')),
        'cancelled', count(*) FILTER (WHERE status = 'cancelled'),
        'active', count(*) FILTER (WHERE status NOT IN ('completed','cancelled','delivered')),
        'gross_sales', CASE WHEN can_finance THEN COALESCE(sum(subtotal),0) ELSE NULL END,
        'delivery_fees', CASE WHEN can_finance THEN COALESCE(sum(delivery_fee),0) ELSE NULL END,
        'revenue', CASE WHEN can_finance THEN COALESCE(sum(total),0) ELSE NULL END
      ) FROM public.orders WHERE created_at >= _from AND created_at < _to
    ),
    'finance_by_currency', CASE WHEN can_finance THEN (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'currency', cur,
        'sales', sales,
        'costs', costs,
        'commission', commission,
        'delivery_fees', delivery_fees,
        'gross_profit', sales - costs,
        'platform_net', commission + delivery_fees,
        'provider_net', sales - costs - commission,
        'items', items,
        'cost_known_items', cost_known
      ) ORDER BY cur), '[]'::jsonb)
      FROM (
        SELECT cur,
               sum(sales) sales, sum(costs) costs, sum(commission) commission,
               sum(delivery_fees) delivery_fees, sum(items) items, sum(cost_known) cost_known
        FROM (
          -- مبيعات الطلبات المكتملة وعمولتها ورسوم توصيلها (بالدينار)
          SELECT 'IQD' cur,
                 COALESCE(sum(o.subtotal),0) sales,
                 0::numeric costs,
                 COALESCE(sum(o.subtotal * COALESCE(p.commission_percent,0) / 100.0),0) commission,
                 COALESCE(sum(o.delivery_fee),0) delivery_fees,
                 0::bigint items, 0::bigint cost_known
          FROM public.orders o
          LEFT JOIN public.providers p ON p.id = o.provider_id
          WHERE o.created_at >= _from AND o.created_at < _to
            AND o.status IN ('completed','delivered')

          UNION ALL
          -- تكلفة المنتجات المباعة
          SELECT 'IQD', 0, COALESCE(sum(oi.quantity * pr.cost_price) FILTER (WHERE pr.cost_price IS NOT NULL),0),
                 0, 0,
                 count(*),
                 count(*) FILTER (WHERE pr.cost_price IS NOT NULL)
          FROM public.order_items oi
          JOIN public.orders o ON o.id = oi.order_id
          LEFT JOIN public.products pr ON pr.id = oi.product_id
          WHERE o.created_at >= _from AND o.created_at < _to
            AND o.status IN ('completed','delivered')

          UNION ALL
          -- الخدمات والمهن المكتملة، كل عملة على حدة
          SELECT upper(COALESCE(sr.currency,'IQD')),
                 COALESCE(sum(sr.price_amount),0),
                 COALESCE(sum(COALESCE(sr.cost_amount, ps.cost_amount)) FILTER (WHERE COALESCE(sr.cost_amount, ps.cost_amount) IS NOT NULL),0),
                 COALESCE(sum(sr.price_amount * COALESCE(pv.commission_percent,0) / 100.0),0),
                 0,
                 count(*),
                 count(*) FILTER (WHERE COALESCE(sr.cost_amount, ps.cost_amount) IS NOT NULL)
          FROM public.service_requests sr
          LEFT JOIN public.provider_services ps ON ps.id = sr.service_id
          LEFT JOIN public.providers pv ON pv.id = sr.provider_id
          WHERE sr.created_at >= _from AND sr.created_at < _to
            AND sr.status = 'completed'
          GROUP BY 1
        ) u
        GROUP BY cur
      ) fc) ELSE NULL END,
    'payments_by_currency', CASE WHEN can_finance THEN (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'currency', cur, 'count', c, 'paid', paid, 'refunded', refunded, 'net', paid - refunded)
        ORDER BY cur), '[]'::jsonb)
      FROM (
        SELECT upper(COALESCE(currency,'IQD')) cur, count(*) c,
               COALESCE(sum(amount) FILTER (WHERE status IN ('succeeded','refunded')),0) paid,
               COALESCE(sum(refunded_amount),0) refunded
        FROM public.payments WHERE created_at >= _from AND created_at < _to
        GROUP BY 1
      ) pc) ELSE NULL END,
    'refunds', CASE WHEN can_finance THEN (
      SELECT jsonb_build_object(
        'pending', count(*) FILTER (WHERE refund_status IN ('pending','processing')),
        'manual_required', count(*) FILTER (WHERE refund_status = 'manual_required'),
        'failed', count(*) FILTER (WHERE refund_status = 'failed'),
        'succeeded', count(*) FILTER (WHERE refund_status = 'succeeded'))
      FROM public.payments WHERE created_at >= _from AND created_at < _to) ELSE NULL END,
    'ads_by_currency', CASE WHEN can_finance THEN (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('currency', cur, 'count', c, 'amount', amt) ORDER BY cur), '[]'::jsonb)
      FROM (
        SELECT upper(COALESCE(currency,'IQD')) cur, count(*) c, COALESCE(sum(price),0) amt
        FROM public.ads WHERE created_at >= _from AND created_at < _to GROUP BY 1
      ) ac) ELSE NULL END,
    'by_status', (
      SELECT COALESCE(jsonb_object_agg(status, c), '{}'::jsonb) FROM (
        SELECT status::text AS status, count(*) c FROM public.orders
        WHERE created_at >= _from AND created_at < _to GROUP BY status
      ) t
    ),
    'daily', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d, 'orders', c,
        'revenue', CASE WHEN can_finance THEN r ELSE NULL END) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', created_at)::date d, count(*) c, COALESCE(sum(total),0) r
        FROM public.orders WHERE created_at >= _from AND created_at < _to
        GROUP BY 1
      ) x
    ),
    'providers', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'orders', c,
        'revenue', CASE WHEN can_finance THEN r ELSE NULL END, 'rating', rating) ORDER BY c DESC), '[]'::jsonb)
      FROM (
        SELECT p.id, p.name, p.rating, count(o.id) c, COALESCE(sum(o.total),0) r
        FROM public.providers p
        JOIN public.orders o ON o.provider_id = p.id AND o.created_at >= _from AND o.created_at < _to
        GROUP BY p.id, p.name, p.rating ORDER BY count(o.id) DESC LIMIT 20
      ) y
    ),
    'drivers', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', user_id, 'name', full_name,
        'delivered', delivered, 'cancelled', cancelled, 'rating', rating) ORDER BY delivered DESC), '[]'::jsonb)
      FROM (
        SELECT w.user_id, COALESCE(pr.full_name,'مندوب') full_name, w.rating,
               count(*) FILTER (WHERE o.status IN ('delivered','completed')) delivered,
               count(*) FILTER (WHERE o.status = 'cancelled') cancelled
        FROM public.worker_profiles w
        LEFT JOIN public.profiles pr ON pr.id = w.user_id
        JOIN public.orders o ON o.driver_id = w.user_id AND o.created_at >= _from AND o.created_at < _to
        GROUP BY w.user_id, pr.full_name, w.rating LIMIT 20
      ) z
    ),
    'trips', (
      SELECT jsonb_build_object('count', count(*),
        'fare', CASE WHEN can_finance THEN COALESCE(sum(fare),0) ELSE NULL END)
      FROM public.trips WHERE created_at >= _from AND created_at < _to
    ),
    'service_requests', (
      SELECT jsonb_build_object('count', count(*),
        'amount', CASE WHEN can_finance THEN COALESCE(sum(price_amount),0) ELSE NULL END)
      FROM public.service_requests WHERE created_at >= _from AND created_at < _to
    )
  ) INTO result;
  RETURN result;
END; $function$;
