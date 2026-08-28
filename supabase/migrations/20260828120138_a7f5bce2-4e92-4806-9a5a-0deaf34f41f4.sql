CREATE POLICY "Staff manage provider images"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'provider-images' AND public.is_staff(auth.uid()))
WITH CHECK (bucket_id = 'provider-images' AND public.is_staff(auth.uid()));