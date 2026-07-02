
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS arrival_time TEXT;
