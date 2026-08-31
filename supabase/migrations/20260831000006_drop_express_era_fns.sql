-- ============================================================================
-- Decommission cleanup: drop functions only the Express server called
-- Date: 2026-08-31 (Railway service deleted)
-- ============================================================================
-- get_user_emails: the old cron resolved emails via this service-role RPC;
--   the pg_cron path reads auth.users inside _send_email() directly.
-- get_monthly_usage: never called by any surviving code path.

DROP FUNCTION IF EXISTS get_user_emails(uuid[]);
DROP FUNCTION IF EXISTS get_monthly_usage(uuid);
