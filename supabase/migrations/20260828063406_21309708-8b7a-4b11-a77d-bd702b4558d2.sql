CREATE OR REPLACE FUNCTION public.is_plus(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.plus_subscriptions
    WHERE user_id = _user_id
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;

REVOKE ALL ON FUNCTION public.is_plus(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_plus(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.subscribe_plus(_plan text DEFAULT 'monthly')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_plan text := lower(coalesce(_plan, 'monthly'));
  v_amount numeric;
  v_months int;
  v_currency text;
  v_balance numeric;
  v_locked boolean;
  v_sub public.plus_subscriptions;
  v_base timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF v_plan NOT IN ('monthly','yearly') THEN RAISE EXCEPTION 'invalid_plan'; END IF;

  v_amount := CASE WHEN v_plan = 'yearly' THEN 50000 ELSE 5000 END;
  v_months := CASE WHEN v_plan = 'yearly' THEN 12 ELSE 1 END;

  INSERT INTO public.wallets(user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;

  SELECT balance, currency, is_locked INTO v_balance, v_currency, v_locked
  FROM public.wallets WHERE user_id = v_user FOR UPDATE;

  IF v_locked THEN RAISE EXCEPTION 'wallet_locked'; END IF;
  IF v_balance < v_amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  UPDATE public.wallets
     SET balance = balance - v_amount, updated_at = now()
   WHERE user_id = v_user
  RETURNING balance INTO v_balance;

  INSERT INTO public.wallet_transactions(
    user_id, direction, amount, balance_after, currency, reason,
    subject_type, idempotency_key, created_by)
  VALUES (v_user, 'debit', v_amount, v_balance, coalesce(v_currency,'IQD'),
    'plus_subscription', 'plus', 'plus:' || v_user::text || ':' || extract(epoch from now())::bigint, v_user);

  SELECT * INTO v_sub FROM public.plus_subscriptions
   WHERE user_id = v_user AND status = 'active' AND (expires_at IS NULL OR expires_at > now())
   ORDER BY expires_at DESC NULLS LAST LIMIT 1;

  v_base := coalesce(v_sub.expires_at, now());

  INSERT INTO public.plus_subscriptions(user_id, plan, status, amount, currency, started_at, expires_at)
  VALUES (v_user, v_plan, 'active', v_amount, coalesce(v_currency,'IQD'), now(), v_base + (v_months || ' months')::interval)
  RETURNING * INTO v_sub;

  RETURN json_build_object(
    'ok', true,
    'plan', v_sub.plan,
    'expires_at', v_sub.expires_at,
    'balance_after', v_balance,
    'amount', v_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.subscribe_plus(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.subscribe_plus(text) TO authenticated;