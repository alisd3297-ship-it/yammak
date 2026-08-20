DROP POLICY IF EXISTS ad_images_public_read ON storage.objects;

CREATE POLICY ad_images_scoped_read ON storage.objects
FOR SELECT
USING (
  bucket_id = 'ad-images'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.ads a
      WHERE a.status = 'published' AND a.images @> ARRAY[storage.objects.name]
    )
  )
);

CREATE OR REPLACE FUNCTION public.run_sql_maintenance()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ex int; cp int; tx int; ads int;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('maint:sql')) THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;

  ex  := public.expire_stale_offers(NULL);
  tx  := public.expire_stale_trip_offers(NULL);
  cp  := public.auto_complete_delivered_orders();
  ads := public.expire_due_ads();

  INSERT INTO public.maintenance_runs (source, expired, completed, note)
  VALUES ('pg_cron_sql', COALESCE(ex,0) + COALESCE(tx,0), COALESCE(cp,0),
          'ads_expired=' || COALESCE(ads,0));

  DELETE FROM public.maintenance_runs WHERE created_at < now() - interval '7 days';

  RETURN jsonb_build_object('expired', ex, 'trip_expired', tx, 'completed', cp, 'ads_expired', ads);
END; $function$;