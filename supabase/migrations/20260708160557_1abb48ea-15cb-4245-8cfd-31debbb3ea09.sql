GRANT INSERT ON public.page_views TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.page_views_id_seq TO anon, authenticated;
GRANT SELECT ON public.page_views TO authenticated;
GRANT ALL ON public.page_views TO service_role;
GRANT ALL ON SEQUENCE public.page_views_id_seq TO service_role;