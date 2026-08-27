CREATE TABLE public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'android',
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_devices_token_uniq UNIQUE (token)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_devices TO authenticated;
GRANT ALL ON public.push_devices TO service_role;

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own devices"
  ON public.push_devices FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX push_devices_user_idx ON public.push_devices (user_id) WHERE is_active;

CREATE OR REPLACE FUNCTION public.touch_push_devices_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_push_devices_updated_at
  BEFORE UPDATE ON public.push_devices
  FOR EACH ROW EXECUTE FUNCTION public.touch_push_devices_updated_at();

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS pushed_at timestamptz;
CREATE INDEX IF NOT EXISTS notifications_pending_push_idx
  ON public.notifications (created_at) WHERE pushed_at IS NULL;