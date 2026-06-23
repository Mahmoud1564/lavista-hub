
CREATE POLICY "public read hotel images" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id IN ('room-images','experience-images','review-images'));

CREATE POLICY "staff upload hotel images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('room-images','experience-images','review-images')
    AND public.is_staff(auth.uid())
  );

CREATE POLICY "staff update hotel images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('room-images','experience-images','review-images')
    AND public.is_staff(auth.uid())
  );

CREATE POLICY "staff delete hotel images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('room-images','experience-images','review-images')
    AND public.is_staff(auth.uid())
  );
