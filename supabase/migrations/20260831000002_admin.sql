-- ============================================================================
-- Migration: Admin role via admin_users table + is_admin() + admin RLS
-- Date: 2026-08-31
-- ============================================================================
-- Replaces the Express ADMIN_EMAILS env allowlist (routes/admin.js). The
-- website's admin pages will use supabase-js directly:
--   - rpc('is_admin') replaces GET /api/admin/check
--   - .from('referral_coupons' / 'referral_usage') CRUD replaces /api/admin/coupons*
-- ============================================================================

CREATE TABLE admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

-- RLS on, no client policies: only service_role / SECURITY DEFINER can read it.
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated, service_role;

-- Seed: mirrors the Express default ADMIN_EMAILS=batchmyphotos@gmail.com
INSERT INTO admin_users (user_id)
SELECT id FROM auth.users WHERE lower(email) = 'batchmyphotos@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- Admin CRUD policies. These are ADDITIVE (permissive) next to the existing
-- service-role-only policies from 20260222_referral_coupons.sql, so nothing
-- else gains access. Regular users still cannot read coupons — validate_coupon()
-- (SECURITY DEFINER) is their only path.
CREATE POLICY admin_all_referral_coupons ON referral_coupons
  FOR ALL USING ((SELECT is_admin())) WITH CHECK ((SELECT is_admin()));

CREATE POLICY admin_all_referral_usage ON referral_usage
  FOR ALL USING ((SELECT is_admin())) WITH CHECK ((SELECT is_admin()));
