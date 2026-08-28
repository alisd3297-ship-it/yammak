CREATE TABLE public.taxi_stands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  city_id UUID REFERENCES public.cities(id),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  radius_km NUMERIC NOT NULL DEFAULT 1.5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.taxi_stands TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxi_stands TO authenticated;
GRANT ALL ON public.taxi_stands TO service_role;

ALTER TABLE public.taxi_stands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "taxi_stands_public_read" ON public.taxi_stands
  FOR SELECT USING (is_active = true OR public.is_staff(auth.uid()));

CREATE POLICY "taxi_stands_staff_manage" ON public.taxi_stands
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.taxi_stand_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stand_id UUID NOT NULL REFERENCES public.taxi_stands(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX taxi_stand_queue_active_driver
  ON public.taxi_stand_queue (driver_id) WHERE left_at IS NULL;
CREATE INDEX taxi_stand_queue_stand_idx
  ON public.taxi_stand_queue (stand_id, joined_at) WHERE left_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.taxi_stand_queue TO authenticated;
GRANT ALL ON public.taxi_stand_queue TO service_role;

ALTER TABLE public.taxi_stand_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "taxi_queue_read" ON public.taxi_stand_queue
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "taxi_queue_driver_join" ON public.taxi_stand_queue
  FOR INSERT TO authenticated WITH CHECK (driver_id = auth.uid());

CREATE POLICY "taxi_queue_driver_update" ON public.taxi_stand_queue
  FOR UPDATE TO authenticated
  USING (driver_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (driver_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_taxi_stands_updated_at BEFORE UPDATE ON public.taxi_stands
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER update_taxi_stand_queue_updated_at BEFORE UPDATE ON public.taxi_stand_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.taxi_stands (name, lat, lng, sort_order)
VALUES
  ('موقف قضاء الحسينية المركزي', 32.6156, 44.0537, 1),
  ('موقف كراج كربلاء الموحد', 32.6110, 44.0300, 2);