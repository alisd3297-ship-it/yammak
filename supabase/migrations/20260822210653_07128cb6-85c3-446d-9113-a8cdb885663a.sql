CREATE OR REPLACE FUNCTION public.log_admin_table_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_id_text text;
  v_entity_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    IF v_before = v_after THEN
      RETURN NEW;
    END IF;
  ELSE
    v_before := to_jsonb(OLD);
  END IF;

  v_id_text := COALESCE(v_after ->> 'id', v_before ->> 'id');
  IF v_id_text IS NOT NULL AND v_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_entity_id := v_id_text::uuid;
  ELSE
    v_entity_id := NULL;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, before_data, after_data)
  VALUES (auth.uid(), TG_TABLE_NAME || '_' || lower(TG_OP), TG_TABLE_NAME, v_entity_id, v_before, v_after);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'service_sections','services','profession_categories','ad_categories',
    'cities','areas','pricing_rules','commission_rules','app_settings','user_roles'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s_changes ON public.%1$s', t);
    EXECUTE format(
      'CREATE TRIGGER audit_%1$s_changes AFTER INSERT OR UPDATE OR DELETE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.log_admin_table_change()',
      t
    );
  END LOOP;
END;
$$;