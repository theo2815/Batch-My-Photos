-- ============================================================================
-- Migration: Free Trial System
-- Date: 2026-02-25
--
-- Adds:
--   1. Free trial tracking columns to subscriptions table
--   2. trial_device_claims table for HWID-based abuse prevention
-- ============================================================================

-- 1. Add trial columns to existing subscriptions table
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS free_trial_used     BOOLEAN      DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS free_trial_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS free_trial_end_at   TIMESTAMPTZ;

-- 2. HWID-based abuse prevention table
--    One physical device (identified by HWID hash) can only claim one free trial,
--    regardless of which account initiates it.
CREATE TABLE IF NOT EXISTS trial_device_claims (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hwid_hash  TEXT        NOT NULL UNIQUE,
  user_id    UUID        NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick user lookups
CREATE INDEX IF NOT EXISTS idx_trial_device_claims_user_id
  ON trial_device_claims (user_id);

-- RLS: Only the owning user can read their own claims
ALTER TABLE trial_device_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY trial_device_claims_select ON trial_device_claims
  FOR SELECT USING (auth.uid() = user_id);

-- Service role (supabaseAdmin) bypasses RLS for server-side writes
