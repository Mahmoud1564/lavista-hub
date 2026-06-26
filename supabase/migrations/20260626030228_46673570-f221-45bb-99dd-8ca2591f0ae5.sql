
-- 1. booking_rooms join table for multi-room bookings
CREATE TABLE public.booking_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  price_per_night numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_booking_rooms_booking ON public.booking_rooms(booking_id);
CREATE INDEX idx_booking_rooms_room ON public.booking_rooms(room_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_rooms TO authenticated;
GRANT ALL ON public.booking_rooms TO service_role;
ALTER TABLE public.booking_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage booking_rooms" ON public.booking_rooms FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

-- Backfill existing single-room bookings
INSERT INTO public.booking_rooms (booking_id, room_id, price_per_night)
SELECT b.id, b.room_id, r.price
FROM public.bookings b
JOIN public.rooms r ON r.id = b.room_id
WHERE b.room_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2. room_pricing for seasonal/special prices
CREATE TABLE public.room_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  price_per_night numeric(10,2) NOT NULL,
  label text,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_room_pricing_room_dates ON public.room_pricing(room_id, start_date, end_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_pricing TO authenticated;
GRANT SELECT ON public.room_pricing TO anon;
GRANT ALL ON public.room_pricing TO service_role;
ALTER TABLE public.room_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view room pricing" ON public.room_pricing FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Staff manage room pricing" ON public.room_pricing FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

-- 3. Update is_room_available to also consider booking_rooms
CREATE OR REPLACE FUNCTION public.is_room_available(_room_id uuid, _check_in date, _check_out date, _exclude_booking uuid DEFAULT NULL::uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.room_id = _room_id
      AND b.status IN ('upcoming','confirmed','pending','checked_in')
      AND (_exclude_booking IS NULL OR b.id <> _exclude_booking)
      AND b.check_in < _check_out
      AND b.check_out > _check_in
  ) AND NOT EXISTS (
    SELECT 1 FROM public.booking_rooms br
    JOIN public.bookings b2 ON b2.id = br.booking_id
    WHERE br.room_id = _room_id
      AND b2.status IN ('upcoming','confirmed','pending','checked_in')
      AND (_exclude_booking IS NULL OR b2.id <> _exclude_booking)
      AND b2.check_in < _check_out
      AND b2.check_out > _check_in
  ) AND NOT EXISTS (
    SELECT 1 FROM public.room_blocks rb
    WHERE rb.room_id = _room_id
      AND rb.start_date < _check_out
      AND (rb.end_date + 1) > _check_in
  );
$$;

-- 4. Drop staff role: promote existing staff users to admin, update approval trigger
UPDATE public.user_roles SET role = 'admin' WHERE role = 'staff'
  AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin');
DELETE FROM public.user_roles WHERE role = 'staff';

CREATE OR REPLACE FUNCTION public.handle_new_user_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.pending_approvals (user_id, email, full_name, requested_role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    'admin'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 5. Public read policies for site (anon) - add for tables that didn't have them
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rooms' AND policyname='Anyone can view active rooms') THEN
    CREATE POLICY "Anyone can view active rooms" ON public.rooms FOR SELECT TO anon USING (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='room_images' AND policyname='Anyone can view room images') THEN
    CREATE POLICY "Anyone can view room images" ON public.room_images FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='room_amenities' AND policyname='Anyone can view room amenities') THEN
    CREATE POLICY "Anyone can view room amenities" ON public.room_amenities FOR SELECT TO anon USING (true);
  END IF;
END $$;

GRANT SELECT ON public.rooms TO anon;
GRANT SELECT ON public.room_images TO anon;
GRANT SELECT ON public.room_amenities TO anon;
