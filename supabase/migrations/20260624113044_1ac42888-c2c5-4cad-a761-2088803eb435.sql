
-- has_role helper (was missing)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;

-- Rooms
ALTER TABLE public.rooms RENAME COLUMN capacity TO guests;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS beds INT NOT NULL DEFAULT 1;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE public.room_images ADD COLUMN IF NOT EXISTS is_thumbnail BOOLEAN NOT NULL DEFAULT false;

-- Experiences
ALTER TABLE public.experiences ADD COLUMN IF NOT EXISTS duration TEXT;
ALTER TABLE public.experiences ADD COLUMN IF NOT EXISTS meeting_point TEXT;
ALTER TABLE public.experiences ADD COLUMN IF NOT EXISTS pickup_info TEXT;
ALTER TABLE public.experiences ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE public.experience_images ADD COLUMN IF NOT EXISTS is_thumbnail BOOLEAN NOT NULL DEFAULT false;

-- experience_dates
CREATE TABLE IF NOT EXISTS public.experience_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id UUID NOT NULL REFERENCES public.experiences(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (experience_id, date)
);
GRANT SELECT ON public.experience_dates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.experience_dates TO authenticated;
GRANT ALL ON public.experience_dates TO service_role;
ALTER TABLE public.experience_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read experience_dates" ON public.experience_dates FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "staff manage experience_dates" ON public.experience_dates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'staff'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'staff'::public.app_role));

-- room_blocks
CREATE TABLE IF NOT EXISTS public.room_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
GRANT SELECT ON public.room_blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_blocks TO authenticated;
GRANT ALL ON public.room_blocks TO service_role;
ALTER TABLE public.room_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read room_blocks" ON public.room_blocks FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "staff manage room_blocks" ON public.room_blocks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'staff'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'staff'::public.app_role));

-- about_images
CREATE TABLE IF NOT EXISTS public.about_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  caption TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.about_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.about_images TO authenticated;
GRANT ALL ON public.about_images TO service_role;
ALTER TABLE public.about_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read about_images" ON public.about_images FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "staff manage about_images" ON public.about_images FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'staff'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'staff'::public.app_role));

-- page_views
CREATE TABLE IF NOT EXISTS public.page_views (
  id BIGSERIAL PRIMARY KEY,
  path TEXT NOT NULL,
  session_id TEXT,
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.page_views TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.page_views_id_seq TO anon, authenticated;
GRANT SELECT ON public.page_views TO authenticated;
GRANT ALL ON public.page_views TO service_role;
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone insert page_views" ON public.page_views FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "staff read page_views" ON public.page_views FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'staff'::public.app_role));
CREATE INDEX IF NOT EXISTS page_views_created_at_idx ON public.page_views (created_at DESC);

-- pending_approvals
CREATE TABLE IF NOT EXISTS public.pending_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  requested_role TEXT NOT NULL DEFAULT 'staff',
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_approvals TO authenticated;
GRANT ALL ON public.pending_approvals TO service_role;
ALTER TABLE public.pending_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage approvals" ON public.pending_approvals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "user reads own approval" ON public.pending_approvals FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.pending_approvals (user_id, email, full_name, requested_role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'requested_role', 'staff')
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created_approval ON auth.users;
CREATE TRIGGER on_auth_user_created_approval
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_approval();

-- availability
CREATE OR REPLACE FUNCTION public.is_room_available(
  _room_id UUID,
  _check_in DATE,
  _check_out DATE,
  _exclude_booking UUID DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.room_id = _room_id
      AND b.status IN ('upcoming','confirmed','pending','checked_in')
      AND (_exclude_booking IS NULL OR b.id <> _exclude_booking)
      AND b.check_in < _check_out
      AND b.check_out > _check_in
  ) AND NOT EXISTS (
    SELECT 1 FROM public.room_blocks rb
    WHERE rb.room_id = _room_id
      AND rb.start_date < _check_out
      AND (rb.end_date + 1) > _check_in
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_room_available(UUID, DATE, DATE, UUID) TO anon, authenticated;
