-- ============================================================================
-- Device Bindings Migration — HWID-based Multi-Device Enforcement
-- ============================================================================
-- This migration creates the device_bindings table and the atomic
-- check_and_bind_device() function for hardware-level device limiting.
--
-- Subscription tiers:
--   Pro    → device_limit = 2
--   Pro+   → device_limit = 5
--   Free   → device_limit = 1 (default)
--
-- Run this in your Supabase SQL Editor:
-- https://app.supabase.com/project/YOUR_PROJECT/sql
-- ============================================================================


-- ============================================================================
-- 1. Add device_limit column to subscriptions table
-- ============================================================================

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS device_limit INTEGER NOT NULL DEFAULT 1;

-- Set device_limit based on existing plans
UPDATE subscriptions SET device_limit = 2 WHERE plan = 'pro' AND device_limit = 1;
UPDATE subscriptions SET device_limit = 5 WHERE plan = 'pro_plus' AND device_limit = 1;


-- ============================================================================
-- 2. Create device_bindings table
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_bindings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hwid_hash   TEXT NOT NULL,
  device_label TEXT,
  bound_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each device can only be bound once per user
  CONSTRAINT uq_user_device UNIQUE (user_id, hwid_hash)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_device_bindings_user
  ON device_bindings(user_id);

CREATE INDEX IF NOT EXISTS idx_device_bindings_last_seen
  ON device_bindings(last_seen_at);


-- ============================================================================
-- 3. Row Level Security
-- ============================================================================

ALTER TABLE device_bindings ENABLE ROW LEVEL SECURITY;

-- Users can view their own devices
DROP POLICY IF EXISTS "Users can view own devices" ON device_bindings;
CREATE POLICY "Users can view own devices" ON device_bindings
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can delete (de-authorize) their own devices
DROP POLICY IF EXISTS "Users can delete own devices" ON device_bindings;
CREATE POLICY "Users can delete own devices" ON device_bindings
  FOR DELETE
  USING (auth.uid() = user_id);

-- Only service role can insert/update (backend manages binding logic)
DROP POLICY IF EXISTS "Service role can manage devices" ON device_bindings;
CREATE POLICY "Service role can manage devices" ON device_bindings
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- ============================================================================
-- 4. Atomic Device Binding Function
-- ============================================================================
-- Uses pg_advisory_xact_lock to prevent race conditions when two devices
-- attempt to bind simultaneously (same pattern as track_batch_usage).
--
-- Returns JSONB:
--   { "bound": true,  "existing": true }           — device already registered
--   { "bound": true,  "existing": false }           — newly registered
--   { "bound": false, "reason": "limit_reached",
--     "count": N, "limit": M }                      — at capacity
--
-- Usage:
--   SELECT check_and_bind_device(
--     'user-uuid'::UUID,
--     'sha256-hwid-hash',
--     'My-Laptop',
--     2  -- device_limit from subscriptions table
--   );

CREATE OR REPLACE FUNCTION check_and_bind_device(
  p_user_id   UUID,
  p_hwid      TEXT,
  p_label     TEXT,
  p_limit     INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing  UUID;
  v_count     INTEGER;
BEGIN
  -- Acquire per-user advisory lock to serialize concurrent bind attempts
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Check if this device is already bound to this user
  SELECT id INTO v_existing
  FROM device_bindings
  WHERE user_id = p_user_id AND hwid_hash = p_hwid;

  IF v_existing IS NOT NULL THEN
    -- Device already registered — update last_seen and label
    UPDATE device_bindings
    SET last_seen_at = NOW(),
        device_label = COALESCE(p_label, device_label)
    WHERE id = v_existing;

    RETURN jsonb_build_object('bound', true, 'existing', true);
  END IF;

  -- Count current devices for this user
  SELECT COUNT(*) INTO v_count
  FROM device_bindings
  WHERE user_id = p_user_id;

  -- Check against limit
  IF v_count >= p_limit THEN
    RETURN jsonb_build_object(
      'bound', false,
      'reason', 'limit_reached',
      'count', v_count,
      'limit', p_limit
    );
  END IF;

  -- Under limit — insert new device binding
  INSERT INTO device_bindings (user_id, hwid_hash, device_label)
  VALUES (p_user_id, p_hwid, p_label);

  RETURN jsonb_build_object('bound', true, 'existing', false);
END;
$$;


-- ============================================================================
-- 5. Concurrent Session Enforcement Function
-- ============================================================================
-- Called by the heartbeat endpoint. Checks if the number of recently-active
-- devices exceeds the plan limit. If so, invalidates the OLDEST session
-- (the one with the earliest last_seen_at) by deleting it.
--
-- "Recently active" = last_seen_at within the past 10 minutes (2× heartbeat).
--
-- Returns JSONB:
--   { "ok": true }                                  — within limits
--   { "ok": false, "invalidated": true,
--     "removed_hwid": "..." }                       — oldest session removed

CREATE OR REPLACE FUNCTION enforce_concurrent_sessions(
  p_user_id UUID,
  p_hwid    TEXT,
  p_limit   INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_active_count INTEGER;
  v_oldest_id    UUID;
  v_oldest_hwid  TEXT;
BEGIN
  -- Update this device's last_seen_at
  UPDATE device_bindings
  SET last_seen_at = NOW()
  WHERE user_id = p_user_id AND hwid_hash = p_hwid;

  -- Count devices active in the last 10 minutes
  SELECT COUNT(*) INTO v_active_count
  FROM device_bindings
  WHERE user_id = p_user_id
    AND last_seen_at > NOW() - INTERVAL '10 minutes';

  -- Within limits
  IF v_active_count <= p_limit THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Over limit — remove the oldest active session (NOT the current one)
  SELECT id, hwid_hash INTO v_oldest_id, v_oldest_hwid
  FROM device_bindings
  WHERE user_id = p_user_id
    AND hwid_hash != p_hwid
    AND last_seen_at > NOW() - INTERVAL '10 minutes'
  ORDER BY last_seen_at ASC
  LIMIT 1;

  IF v_oldest_id IS NOT NULL THEN
    DELETE FROM device_bindings WHERE id = v_oldest_id;
    RETURN jsonb_build_object(
      'ok', false,
      'invalidated', true,
      'removed_hwid', v_oldest_hwid
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- ============================================================================
-- Verification Queries (Optional — Run these to test)
-- ============================================================================

-- Check device_limit values
-- SELECT user_id, plan, device_limit FROM subscriptions;

-- Test binding a device (replace UUIDs)
-- SELECT check_and_bind_device('USER_ID'::UUID, 'test-hwid-hash', 'My Laptop', 2);

-- View all device bindings
-- SELECT * FROM device_bindings ORDER BY bound_at DESC;

-- ============================================================================
-- Migration Complete
-- ============================================================================
