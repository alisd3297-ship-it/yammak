CREATE POLICY "Provider owners manage own images"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'provider-images'
  AND EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.owner_id = auth.uid()
      AND storage.objects.name LIKE 'providers/' || p.id::text || '/%'
  )
)
WITH CHECK (
  bucket_id = 'provider-images'
  AND EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.owner_id = auth.uid()
      AND storage.objects.name LIKE 'providers/' || p.id::text || '/%'
  )
);