
REVOKE EXECUTE ON FUNCTION public.approve_pending_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_pending_user(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.is_room_available(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_room_available(uuid, date, date, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user_approval() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "anon can update bookings" ON public.bookings;
DROP POLICY IF EXISTS "anon update bookings" ON public.bookings;

DROP POLICY IF EXISTS "anon can insert bookings" ON public.bookings;
DROP POLICY IF EXISTS "anon insert bookings" ON public.bookings;
CREATE POLICY "anon insert bookings" ON public.bookings
  FOR INSERT TO anon
  WITH CHECK (status IN ('upcoming','pending') AND check_in < check_out AND check_in >= CURRENT_DATE);

DROP POLICY IF EXISTS "public create booking_rooms" ON public.booking_rooms;
DROP POLICY IF EXISTS "anon can insert booking_rooms" ON public.booking_rooms;
DROP POLICY IF EXISTS "anon insert booking_rooms" ON public.booking_rooms;
CREATE POLICY "anon insert booking_rooms" ON public.booking_rooms
  FOR INSERT TO anon
  WITH CHECK (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.status IN ('upcoming','pending')));

DROP POLICY IF EXISTS "allow anon insert guests" ON public.guests;
DROP POLICY IF EXISTS "anon can insert guests" ON public.guests;
DROP POLICY IF EXISTS "anon insert guests" ON public.guests;
CREATE POLICY "anon insert guests" ON public.guests
  FOR INSERT TO anon
  WITH CHECK (length(coalesce(name,'')) > 0 AND (coalesce(email,'') <> '' OR coalesce(phone,'') <> ''));

DROP POLICY IF EXISTS "anyone insert page_views" ON public.page_views;
CREATE POLICY "anon insert page_views" ON public.page_views
  FOR INSERT TO anon, authenticated
  WITH CHECK (length(coalesce(path,'')) > 0);

DROP POLICY IF EXISTS "public read hotel images" ON storage.objects;
DROP POLICY IF EXISTS "public read storage" ON storage.objects;
CREATE POLICY "authenticated list hotel images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = ANY (ARRAY['room-images','experience-images','review-images','branding']));
