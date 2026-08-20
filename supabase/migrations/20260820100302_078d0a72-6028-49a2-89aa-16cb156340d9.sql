CREATE OR REPLACE FUNCTION public.guard_provider_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_staff(auth.uid()) THEN RETURN NEW; END IF;
  IF auth.uid() IS DISTINCT FROM OLD.owner_id THEN RETURN NEW; END IF;
  NEW.status := OLD.status;
  NEW.approval_code := OLD.approval_code;
  NEW.commission_percent := OLD.commission_percent;
  NEW.rating := OLD.rating;
  NEW.ratings_count := OLD.ratings_count;
  NEW.orders_count := OLD.orders_count;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.guard_worker_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_staff(auth.uid()) THEN RETURN NEW; END IF;
  IF auth.uid() IS DISTINCT FROM OLD.user_id THEN RETURN NEW; END IF;
  NEW.worker_kind := OLD.worker_kind;
  NEW.is_approved := OLD.is_approved;
  NEW.max_active_orders := OLD.max_active_orders;
  NEW.rating := OLD.rating;
  NEW.ratings_count := OLD.ratings_count;
  RETURN NEW;
END; $function$;