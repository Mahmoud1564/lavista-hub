
CREATE POLICY "read branding" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'branding');
CREATE POLICY "staff write branding" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'staff'::public.app_role)));
CREATE POLICY "staff update branding" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'staff'::public.app_role)));
CREATE POLICY "staff delete branding" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'staff'::public.app_role)));
