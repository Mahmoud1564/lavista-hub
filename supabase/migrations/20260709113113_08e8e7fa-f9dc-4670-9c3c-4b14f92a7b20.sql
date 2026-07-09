DROP POLICY IF EXISTS "Anyone can insert a visitor heartbeat" ON public.online_visitors;
DROP POLICY IF EXISTS "Anyone can update a visitor heartbeat" ON public.online_visitors;
DROP POLICY IF EXISTS "Anon can insert online visitor heartbeats" ON public.online_visitors;
DROP POLICY IF EXISTS "Anon can update online visitor heartbeats" ON public.online_visitors;
DROP POLICY IF EXISTS "Anon can read recent online visitors" ON public.online_visitors;
DROP POLICY IF EXISTS "Authenticated can read online visitors" ON public.online_visitors;
DROP POLICY IF EXISTS "Authenticated can view online visitors" ON public.online_visitors;

GRANT SELECT, INSERT, UPDATE ON public.online_visitors TO anon;
GRANT SELECT, INSERT, UPDATE ON public.online_visitors TO authenticated;
GRANT ALL ON public.online_visitors TO service_role;

CREATE POLICY "Anon can insert presence heartbeats"
ON public.online_visitors
FOR INSERT
TO anon
WITH CHECK (
  session_id IS NOT NULL
  AND current_path IS NOT NULL
  AND last_seen IS NOT NULL
  AND last_seen >= now() - interval '5 minutes'
  AND last_seen <= now() + interval '5 minutes'
);

CREATE POLICY "Anon can update presence heartbeats"
ON public.online_visitors
FOR UPDATE
TO anon
USING (
  session_id IS NOT NULL
)
WITH CHECK (
  session_id IS NOT NULL
  AND current_path IS NOT NULL
  AND last_seen IS NOT NULL
  AND last_seen >= now() - interval '5 minutes'
  AND last_seen <= now() + interval '5 minutes'
);

CREATE POLICY "Anon can read recent presence"
ON public.online_visitors
FOR SELECT
TO anon
USING (
  session_id IS NOT NULL
  AND last_seen > now() - interval '2 minutes'
);

CREATE POLICY "Authenticated can read presence"
ON public.online_visitors
FOR SELECT
TO authenticated
USING (
  session_id IS NOT NULL
);