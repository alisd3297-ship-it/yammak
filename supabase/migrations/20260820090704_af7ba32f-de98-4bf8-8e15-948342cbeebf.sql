CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.maintenance_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  expired int NOT NULL DEFAULT 0,
  completed int NOT NULL DEFAULT 0,
  redispatched int NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.maintenance_runs TO authenticated;
GRANT ALL ON public.maintenance_runs TO service_role;

ALTER TABLE public.maintenance_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read maintenance runs" ON public.maintenance_runs;
CREATE POLICY "staff read maintenance runs" ON public.maintenance_runs
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS maintenance_runs_created_idx ON public.maintenance_runs (created_at DESC);

-- قفل منطقي يمنع التشغيل المتزامن أو المتكرر خلال فترة قصيرة
CREATE TABLE IF NOT EXISTS public.maintenance_locks (
  name text PRIMARY KEY,
  last_started_at timestamptz NOT NULL DEFAULT to_timestamp(0)
);
GRANT ALL ON public.maintenance_locks TO service_role;
ALTER TABLE public.maintenance_locks ENABLE ROW LEVEL SECURITY;

INSERT INTO public.maintenance_locks (name) VALUES ('dispatch_maintenance')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_maintenance_slot(_name text DEFAULT 'dispatch_maintenance', _min_seconds int DEFAULT 30)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE ok boolean := false;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('maint:' || _name)) THEN
    RETURN false;
  END IF;

  INSERT INTO public.maintenance_locks (name) VALUES (_name) ON CONFLICT (name) DO NOTHING;

  UPDATE public.maintenance_locks
     SET last_started_at = now()
   WHERE name = _name
     AND last_started_at < now() - make_interval(secs => GREATEST(_min_seconds, 1))
  RETURNING true INTO ok;

  RETURN COALESCE(ok, false);
END; $$;

REVOKE ALL ON FUNCTION public.claim_maintenance_slot(text, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_maintenance_slot(text, int) TO service_role;

-- صيانة SQL خالصة: تعمل دائماً حتى لو تعذر استدعاء التطبيق
CREATE OR REPLACE FUNCTION public.run_sql_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE ex int; cp int;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('maint:sql')) THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;

  ex := public.expire_stale_offers(NULL);
  cp := public.auto_complete_delivered_orders();

  INSERT INTO public.maintenance_runs (source, expired, completed, note)
  VALUES ('pg_cron_sql', COALESCE(ex,0), COALESCE(cp,0), NULL);

  DELETE FROM public.maintenance_runs WHERE created_at < now() - interval '7 days';

  RETURN jsonb_build_object('expired', ex, 'completed', cp);
END; $$;

REVOKE ALL ON FUNCTION public.run_sql_maintenance() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_sql_maintenance() TO service_role;

-- جدولة: صيانة SQL كل دقيقة
SELECT cron.unschedule('yammak-sql-maintenance')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'yammak-sql-maintenance');

SELECT cron.schedule('yammak-sql-maintenance', '* * * * *', $$SELECT public.run_sql_maintenance();$$);

-- جدولة: استدعاء رابط الصيانة في التطبيق لإعادة التوزيع كل دقيقة
SELECT cron.unschedule('yammak-dispatch-maintenance')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'yammak-dispatch-maintenance');

SELECT cron.schedule(
  'yammak-dispatch-maintenance',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--729acaeb-a297-44ff-bcda-163988b47b73-dev.lovable.app/api/public/maintenance',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_GnBLunGQZ9JBdc7mkZrfpQ_SEHealiW"}'::jsonb,
    body := '{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 8000
  );
  $$
);