-- ============================================================================
-- Ensure `subscriptions` is in the Realtime publication
-- Date: 2026-08-31
-- ============================================================================
-- The website subscribes to postgres_changes on public.subscriptions
-- (useSubscription.js) to refetch after the PayMongo webhook lands. In prod
-- this was enabled via the dashboard; this makes it reproducible for fresh
-- environments. Guarded: no-op when already a member.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'subscriptions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
  END IF;
END $$;
