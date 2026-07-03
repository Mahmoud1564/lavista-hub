-- Allow admins to fully manage guests (was missing, blocking booking creation from the dashboard)
CREATE POLICY "admin read guests" ON public.guests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin insert guests" ON public.guests
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin update guests" ON public.guests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin delete guests" ON public.guests
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
