-- ============ 1) إشعارات بلا تكرار ============
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_uidx
  ON public.notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.push_notification(
  _user_id uuid, _title text, _body text, _kind text,
  _order_id uuid DEFAULT NULL, _key text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, title, body, kind, order_id, dedupe_key)
  VALUES (_user_id, _title, _body, _kind, _order_id, _key)
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
END; $$;

-- ============ 2) موافقة المدير على الطلب ============
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS requires_admin_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_approved_by uuid,
  ADD COLUMN IF NOT EXISTS admin_review_reason text;

INSERT INTO public.app_settings (key, value)
VALUES ('order_admin_approval', '{"enabled": false, "order_types": []}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.order_needs_admin_approval(_order_type order_type)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((
    SELECT (value->>'enabled')::boolean
       AND (
         COALESCE(jsonb_array_length(value->'order_types'), 0) = 0
         OR (value->'order_types') ? _order_type::text
       )
    FROM public.app_settings WHERE key = 'order_admin_approval'
  ), false);
$$;

-- ============ 3) قواعد الانتقال: نسخة واحدة شاملة ============
CREATE OR REPLACE FUNCTION public.is_allowed_transition(
  _actor text, _from order_status, _to order_status, _order_type order_type
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE direct boolean := _order_type IN ('courier'::public.order_type, 'special_delivery'::public.order_type);
BEGIN
  IF _from = _to THEN RETURN false; END IF;
  -- الحالات النهائية لا يمكن العبث بها من أي دور
  IF _from IN ('completed','cancelled') THEN RETURN false; END IF;

  IF _to = 'cancelled' THEN
    IF direct THEN
      RETURN CASE _actor
        WHEN 'customer' THEN _from IN ('new','searching_driver','offered_to_driver','driver_accepted')
        WHEN 'staff'    THEN true
        ELSE false END;
    END IF;
    RETURN CASE _actor
      WHEN 'customer' THEN _from IN ('new','awaiting_provider','accepted')
      WHEN 'provider' THEN _from IN ('new','awaiting_provider','accepted','preparing')
      WHEN 'staff'    THEN true
      ELSE false END;
  END IF;

  IF _actor = 'staff' THEN RETURN true; END IF;

  IF direct THEN
    RETURN CASE _actor
      WHEN 'driver' THEN
        (_from = 'driver_accepted' AND _to = 'driver_heading_pickup')
        OR (_from = 'driver_heading_pickup' AND _to = 'picked_up')
        OR (_from = 'picked_up' AND _to = 'on_the_way')
        OR (_from = 'on_the_way' AND _to = 'delivered')
      WHEN 'customer' THEN (_from = 'delivered' AND _to = 'completed')
      WHEN 'system' THEN
        (_from = 'new' AND _to = 'searching_driver')
        OR (_from = 'searching_driver' AND _to = 'offered_to_driver')
        OR (_from = 'offered_to_driver' AND _to IN ('searching_driver','driver_accepted'))
        OR (_from = 'delivered' AND _to = 'completed')
      ELSE false END;
  END IF;

  RETURN CASE _actor
    WHEN 'provider' THEN
      (_from = 'new' AND _to = 'awaiting_provider')
      OR (_from = 'awaiting_provider' AND _to = 'accepted')
      OR (_from = 'accepted' AND _to = 'preparing')
      OR (_from = 'preparing' AND _to = 'ready_for_pickup')
      OR (_from = 'ready_for_pickup' AND _to = 'searching_driver')
    WHEN 'driver' THEN
      (_from = 'driver_accepted' AND _to = 'driver_heading_pickup')
      OR (_from = 'driver_heading_pickup' AND _to = 'picked_up')
      OR (_from = 'picked_up' AND _to = 'on_the_way')
      OR (_from = 'on_the_way' AND _to = 'delivered')
    WHEN 'customer' THEN (_from = 'delivered' AND _to = 'completed')
    WHEN 'system' THEN
      (_from = 'ready_for_pickup' AND _to = 'searching_driver')
      OR (_from = 'searching_driver' AND _to = 'offered_to_driver')
      OR (_from = 'offered_to_driver' AND _to IN ('searching_driver','driver_accepted'))
      OR (_from = 'delivered' AND _to = 'completed')
    ELSE false END;
END; $$;

-- النسخة القديمة صارت غلافاً على النسخة الشاملة (مصدر واحد للحقيقة)
CREATE OR REPLACE FUNCTION public.is_allowed_transition(_actor text, _from order_status, _to order_status)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT public.is_allowed_transition(_actor, _from, _to, 'restaurant'::public.order_type);
$$;

-- ============ 4) تغيير الحالة: موافقة المدير + استرداد الدفع ============
CREATE OR REPLACE FUNCTION public.change_order_status(_order_id uuid, _new_status order_status, _reason text DEFAULT NULL::text)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  o public.orders;
  uid uuid := auth.uid();
  actor text;
  pay record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  actor := public.order_actor(uid, _order_id);
  IF actor IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF NOT public.is_allowed_transition(actor, o.status, _new_status, o.order_type) THEN
    RAISE EXCEPTION 'transition_not_allowed: % -> % (%)', o.status, _new_status, actor;
  END IF;

  -- لا يتقدم الطلب المطلوب اعتماده قبل موافقة المدير (الإلغاء يبقى مسموحاً)
  IF o.requires_admin_approval AND o.admin_approved_at IS NULL
     AND _new_status <> 'cancelled' AND actor <> 'staff' THEN
    RAISE EXCEPTION 'admin_approval_required';
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

    -- استرداد أي دفعة ناجحة مرة واحدة فقط
    FOR pay IN
      SELECT id, amount, refunded_amount FROM public.payments
      WHERE subject_type = 'order' AND subject_id = _order_id
        AND status = 'succeeded' AND refunded_amount < amount
      FOR UPDATE
    LOOP
      PERFORM public.record_payment_refund(pay.id, pay.amount - pay.refunded_amount,
        COALESCE(_reason, 'order_cancelled'));
    END LOOP;
  END IF;

  RETURN o;
END; $$;

-- ============ 5) مراجعة المدير للطلب ============
CREATE OR REPLACE FUNCTION public.review_order_approval(_order_id uuid, _approve boolean, _reason text DEFAULT NULL)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); o public.orders; before_row public.orders;
BEGIN
  IF uid IS NULL OR NOT public.is_staff(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO before_row FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT before_row.requires_admin_approval THEN RAISE EXCEPTION 'approval_not_required'; END IF;
  IF before_row.admin_approved_at IS NOT NULL THEN RAISE EXCEPTION 'already_reviewed'; END IF;
  IF before_row.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'order_closed'; END IF;

  IF _approve THEN
    UPDATE public.orders SET
      admin_approved_at = now(), admin_approved_by = uid, admin_review_reason = _reason
    WHERE id = _order_id RETURNING * INTO o;
    PERFORM public.push_notification(o.customer_id, 'تمت موافقة الإدارة',
      'تمت الموافقة على طلبك وسيتم تجهيزه', 'order', o.id, 'order:'||o.id||':admin_approved');
    PERFORM public.push_notification(
      (SELECT owner_id FROM public.providers WHERE id = o.provider_id),
      'طلب معتمد من الإدارة', 'يمكنك الآن قبول الطلب وتجهيزه', 'order', o.id,
      'order:'||o.id||':admin_approved_provider');
  ELSE
    UPDATE public.orders SET
      admin_review_reason = _reason, status = 'cancelled',
      cancel_reason = COALESCE(_reason, 'رفض الإدارة')
    WHERE id = _order_id RETURNING * INTO o;
    UPDATE public.delivery_offers SET status = 'cancelled', responded_at = now()
      WHERE order_id = _order_id AND status = 'sent';
    PERFORM public.push_notification(o.customer_id, 'تم رفض الطلب',
      COALESCE(_reason, 'رفضت الإدارة الطلب'), 'order', o.id, 'order:'||o.id||':admin_rejected');
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, before_data, after_data)
  VALUES (uid, CASE WHEN _approve THEN 'order_admin_approved' ELSE 'order_admin_rejected' END,
          'orders', _order_id, to_jsonb(before_row), to_jsonb(o));
  RETURN o;
END; $$;

-- ============ 6) محرّك الإشعارات على مراحل الطلب ============
CREATE OR REPLACE FUNCTION public.notify_order_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE owner uuid; s record;
BEGIN
  SELECT owner_id INTO owner FROM public.providers WHERE id = NEW.provider_id;

  IF TG_OP = 'INSERT' THEN
    IF owner IS NOT NULL THEN
      PERFORM public.push_notification(owner, 'طلب جديد',
        'وصلك طلب جديد #'||NEW.code, 'order', NEW.id, 'order:'||NEW.id||':new_provider');
    END IF;
    IF NEW.requires_admin_approval THEN
      FOR s IN SELECT DISTINCT user_id FROM public.user_roles
               WHERE role IN ('super_admin','admin','supervisor') LOOP
        PERFORM public.push_notification(s.user_id, 'طلب بانتظار موافقة الإدارة',
          'الطلب #'||NEW.code||' يحتاج موافقتك', 'order', NEW.id,
          'order:'||NEW.id||':admin_review:'||s.user_id);
      END LOOP;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'accepted' THEN
      PERFORM public.push_notification(NEW.customer_id, 'تم قبول طلبك',
        'مقدم الخدمة قبل طلبك #'||NEW.code, 'order', NEW.id, 'order:'||NEW.id||':accepted');
    ELSIF NEW.status = 'preparing' THEN
      PERFORM public.push_notification(NEW.customer_id, 'جاري تجهيز طلبك',
        'طلبك #'||NEW.code||' قيد التجهيز', 'order', NEW.id, 'order:'||NEW.id||':preparing');
    ELSIF NEW.status = 'ready_for_pickup' THEN
      PERFORM public.push_notification(NEW.customer_id, 'طلبك جاهز',
        'جاري البحث عن مندوب لتوصيل طلبك', 'order', NEW.id, 'order:'||NEW.id||':ready');
    ELSIF NEW.status = 'driver_heading_pickup' THEN
      PERFORM public.push_notification(NEW.customer_id, 'المندوب بالطريق للاستلام',
        'المندوب متوجه لاستلام طلبك #'||NEW.code, 'order', NEW.id, 'order:'||NEW.id||':heading');
    ELSIF NEW.status = 'picked_up' THEN
      PERFORM public.push_notification(NEW.customer_id, 'تم استلام الطلب',
        'المندوب استلم طلبك #'||NEW.code, 'order', NEW.id, 'order:'||NEW.id||':picked');
      PERFORM public.push_notification(owner, 'تم تسليم الطلب للمندوب',
        'المندوب استلم الطلب #'||NEW.code, 'order', NEW.id, 'order:'||NEW.id||':picked_provider');
    ELSIF NEW.status = 'on_the_way' THEN
      PERFORM public.push_notification(NEW.customer_id, 'المندوب بالطريق إليك',
        'طلبك #'||NEW.code||' بالطريق', 'order', NEW.id, 'order:'||NEW.id||':otw');
    ELSIF NEW.status = 'delivered' THEN
      PERFORM public.push_notification(NEW.customer_id, 'تم تسليم طلبك',
        'أكد الاستلام وقيّم الخدمة', 'order', NEW.id, 'order:'||NEW.id||':delivered');
    ELSIF NEW.status = 'completed' THEN
      PERFORM public.push_notification(NEW.customer_id, 'اكتمل الطلب',
        'شكراً لاستخدامك يمّك', 'order', NEW.id, 'order:'||NEW.id||':completed');
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public.push_notification(NEW.customer_id, 'تم إلغاء الطلب',
        COALESCE(NEW.cancel_reason, 'تم إلغاء طلبك'), 'order', NEW.id, 'order:'||NEW.id||':cancelled');
      PERFORM public.push_notification(owner, 'تم إلغاء طلب',
        'الطلب #'||NEW.code||' ملغى', 'order', NEW.id, 'order:'||NEW.id||':cancelled_provider');
      IF NEW.driver_id IS NOT NULL THEN
        PERFORM public.push_notification(NEW.driver_id, 'تم إلغاء المهمة',
          'الطلب #'||NEW.code||' ملغى', 'order', NEW.id, 'order:'||NEW.id||':cancelled_driver');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_order_insert ON public.orders;
CREATE TRIGGER trg_notify_order_insert AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_events();
DROP TRIGGER IF EXISTS trg_notify_order_update ON public.orders;
CREATE TRIGGER trg_notify_order_update AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_events();

-- ============ 7) وسم الطلبات المحتاجة لموافقة الإدارة عند الإنشاء ============
CREATE OR REPLACE FUNCTION public.mark_order_admin_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.requires_admin_approval IS NOT TRUE THEN
    NEW.requires_admin_approval := public.order_needs_admin_approval(NEW.order_type);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_mark_order_admin_approval ON public.orders;
CREATE TRIGGER trg_mark_order_admin_approval BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.mark_order_admin_approval();

-- ============ 8) منع تكرار التقييم ============
CREATE UNIQUE INDEX IF NOT EXISTS ratings_unique_per_order_target
  ON public.ratings(order_id, rater_id, target_type);

-- ============ 9) تقارير الإدارة ============
CREATE OR REPLACE FUNCTION public.admin_orders_report(_from timestamptz, _to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); can_finance boolean; result jsonb;
BEGIN
  IF uid IS NULL OR NOT public.is_staff(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  can_finance := public.has_role(uid,'admin') OR public.has_role(uid,'super_admin');

  SELECT jsonb_build_object(
    'from', _from, 'to', _to, 'can_finance', can_finance,
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
END; $$;

-- ============ 10) إدارة المستخدمين والأدوار ============
CREATE OR REPLACE FUNCTION public.admin_list_users(_search text DEFAULT NULL, _limit int DEFAULT 50)
RETURNS TABLE(user_id uuid, full_name text, phone text, is_blocked boolean, created_at timestamptz, roles text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.phone, p.is_blocked, p.created_at,
         COALESCE(ARRAY(SELECT r.role::text FROM public.user_roles r WHERE r.user_id = p.id ORDER BY r.role::text), '{}')
  FROM public.profiles p
  WHERE _search IS NULL OR btrim(_search) = ''
     OR p.full_name ILIKE '%'||_search||'%' OR COALESCE(p.phone,'') ILIKE '%'||_search||'%'
  ORDER BY p.created_at DESC
  LIMIT GREATEST(LEAST(COALESCE(_limit,50), 200), 1);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(_user_id uuid, _role app_role, _grant boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); is_super boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  is_super := public.has_role(uid,'super_admin');
  -- المدير العام فقط يتحكم بأدوار الإدارة، والمدير العادي بالأدوار التشغيلية
  IF _role IN ('super_admin','admin','supervisor') THEN
    IF NOT is_super THEN RAISE EXCEPTION 'forbidden'; END IF;
  ELSIF NOT (is_super OR public.has_role(uid,'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _user_id = uid AND _role = 'super_admin' AND NOT _grant THEN
    RAISE EXCEPTION 'cannot_revoke_self';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
  VALUES (uid, CASE WHEN _grant THEN 'role_granted' ELSE 'role_revoked' END,
          'user_roles', _user_id, jsonb_build_object('role', _role));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_user_blocked(_user_id uuid, _blocked boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT (public.has_role(uid,'admin') OR public.has_role(uid,'super_admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _user_id = uid THEN RAISE EXCEPTION 'cannot_block_self'; END IF;
  IF public.has_role(_user_id,'super_admin') AND NOT public.has_role(uid,'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles SET is_blocked = _blocked WHERE id = _user_id;
  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, after_data)
  VALUES (uid, CASE WHEN _blocked THEN 'user_blocked' ELSE 'user_unblocked' END,
          'profiles', _user_id, jsonb_build_object('is_blocked', _blocked));
  RETURN true;
END; $$;

-- ============ 11) realtime للإشعارات ============
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;