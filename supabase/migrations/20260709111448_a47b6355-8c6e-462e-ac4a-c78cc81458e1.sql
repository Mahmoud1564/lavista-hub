
CREATE TABLE public.online_visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID UNIQUE NOT NULL,
  current_path TEXT,
  user_agent TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.online_visitors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_visitors TO authenticated;
GRANT ALL ON public.online_visitors TO service_role;

ALTER TABLE public.online_visitors ENABLE ROW LEVEL SECURITY;

-- Public site visitors (anon + authenticated) can upsert their heartbeat.
CREATE POLICY "Anyone can insert a visitor heartbeat"
  ON public.online_visitors FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update a visitor heartbeat"
  ON public.online_visitors FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Only signed-in staff can read the online-visitor list for the dashboard.
CREATE POLICY "Authenticated can view online visitors"
  ON public.online_visitors FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX online_visitors_last_seen_idx ON public.online_visitors (last_seen DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.online_visitors;
