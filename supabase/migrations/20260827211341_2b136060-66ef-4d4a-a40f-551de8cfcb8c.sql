CREATE TABLE public.app_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  source text NOT NULL DEFAULT 'client',
  kind text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  path text,
  user_agent text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT INSERT ON public.app_error_logs TO anon;
GRANT SELECT, INSERT, DELETE ON public.app_error_logs TO authenticated;
GRANT ALL ON public.app_error_logs TO service_role;

ALTER TABLE public.app_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can report an error"
  ON public.app_error_logs FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "staff can read error logs"
  ON public.app_error_logs FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff can delete error logs"
  ON public.app_error_logs FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE INDEX app_error_logs_created_at_idx ON public.app_error_logs (created_at DESC);
CREATE INDEX app_error_logs_kind_idx ON public.app_error_logs (kind, created_at DESC);