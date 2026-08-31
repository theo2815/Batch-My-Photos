-- ============================================================================
-- Migration: Revoke client EXECUTE on legacy server-trusted RPCs
-- Date: 2026-08-31
-- ============================================================================
-- These functions take user_id / limit as TRUSTED arguments (the Express
-- backend supplied them with the service-role key). They were created without
-- any REVOKE, and Postgres grants EXECUTE to PUBLIC by default — so any
-- authenticated user could call e.g.
--   track_batch_usage(p_user_id => <anyone>, p_limit => NULL)
-- via PostgREST. Close that hole. The Express backend keeps working: it
-- connects as service_role.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION track_batch_usage(uuid, text, int, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION check_and_bind_device(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION enforce_concurrent_sessions(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION check_removal_allowed(uuid, integer, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_monthly_usage(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION track_batch_usage(uuid, text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION check_and_bind_device(uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION enforce_concurrent_sessions(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION check_removal_allowed(uuid, integer, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION get_monthly_usage(uuid) TO service_role;
