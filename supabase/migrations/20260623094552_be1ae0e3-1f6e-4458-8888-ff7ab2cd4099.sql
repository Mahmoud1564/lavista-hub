
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','staff'))
$$;

REVOKE ALL ON FUNCTION private.has_role(UUID, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_staff(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(UUID, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_staff(UUID) TO authenticated, service_role;

-- public.user_roles
DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "staff write rooms" ON public.rooms;
CREATE POLICY "staff write rooms" ON public.rooms FOR ALL TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff write room images" ON public.room_images;
CREATE POLICY "staff write room images" ON public.room_images FOR ALL TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff write amenities" ON public.room_amenities;
CREATE POLICY "staff write amenities" ON public.room_amenities FOR ALL TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff read guests" ON public.guests;
DROP POLICY IF EXISTS "staff write guests" ON public.guests;
CREATE POLICY "staff read guests" ON public.guests FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff write guests" ON public.guests FOR ALL TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff read bookings" ON public.bookings;
DROP POLICY IF EXISTS "staff write bookings" ON public.bookings;
CREATE POLICY "staff read bookings" ON public.bookings FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff write bookings" ON public.bookings FOR ALL TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff write experiences" ON public.experiences;
CREATE POLICY "staff write experiences" ON public.experiences FOR ALL TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff write exp images" ON public.experience_images;
CREATE POLICY "staff write exp images" ON public.experience_images FOR ALL TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff write reviews" ON public.reviews;
CREATE POLICY "staff write reviews" ON public.reviews FOR ALL TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff write faq" ON public.faq;
CREATE POLICY "staff write faq" ON public.faq FOR ALL TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff write content" ON public.website_content;
CREATE POLICY "staff write content" ON public.website_content FOR ALL TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff write settings" ON public.settings;
CREATE POLICY "staff write settings" ON public.settings FOR ALL TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

-- storage.objects policies
DROP POLICY IF EXISTS "staff upload hotel images" ON storage.objects;
DROP POLICY IF EXISTS "staff update hotel images" ON storage.objects;
DROP POLICY IF EXISTS "staff delete hotel images" ON storage.objects;
CREATE POLICY "staff upload hotel images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('room-images','experience-images','review-images') AND private.is_staff(auth.uid()));
CREATE POLICY "staff update hotel images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('room-images','experience-images','review-images') AND private.is_staff(auth.uid()))
  WITH CHECK (bucket_id IN ('room-images','experience-images','review-images') AND private.is_staff(auth.uid()));
CREATE POLICY "staff delete hotel images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('room-images','experience-images','review-images') AND private.is_staff(auth.uid()));

DROP FUNCTION IF EXISTS public.has_role(UUID, public.app_role);
DROP FUNCTION IF EXISTS public.is_staff(UUID);
