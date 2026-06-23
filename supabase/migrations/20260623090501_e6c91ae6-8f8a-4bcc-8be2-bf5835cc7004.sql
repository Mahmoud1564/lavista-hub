
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(UUID) TO authenticated, service_role;

DROP POLICY "public create booking" ON public.bookings;
CREATE POLICY "public create booking" ON public.bookings
  FOR INSERT TO anon
  WITH CHECK (
    check_out > check_in
    AND status = 'upcoming'
    AND guest_id IS NOT NULL
    AND room_id IS NOT NULL
  );
