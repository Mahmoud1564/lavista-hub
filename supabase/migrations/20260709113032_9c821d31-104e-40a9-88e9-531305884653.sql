GRANT SELECT, INSERT, UPDATE ON public.online_visitors TO anon;
GRANT SELECT, INSERT, UPDATE ON public.online_visitors TO authenticated;
GRANT ALL ON public.online_visitors TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'online_visitors'
      AND policyname = 'Anon can insert online visitor heartbeats'
  ) THEN
    CREATE POLICY "Anon can insert online visitor heartbeats"
    ON public.online_visitors
    FOR INSERT
    TO anon
    WITH CHECK (
      session_id IS NOT NULL
      AND last_seen IS NOT NULL
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'online_visitors'
      AND policyname = 'Anon can update online visitor heartbeats'
  ) THEN
    CREATE POLICY "Anon can update online visitor heartbeats"
    ON public.online_visitors
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (
      session_id IS NOT NULL
      AND last_seen IS NOT NULL
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'online_visitors'
      AND policyname = 'Anon can read recent online visitors'
  ) THEN
    CREATE POLICY "Anon can read recent online visitors"
    ON public.online_visitors
    FOR SELECT
    TO anon
    USING (last_seen > now() - interval '2 minutes');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'online_visitors'
      AND policyname = 'Authenticated can read online visitors'
  ) THEN
    CREATE POLICY "Authenticated can read online visitors"
    ON public.online_visitors
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
END $$;