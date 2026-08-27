ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_services text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS preferences_set_at timestamptz;