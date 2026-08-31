-- ============================================================================
-- Device Removal Limits Migration — Cooldown + Monthly Cap
-- ============================================================================
-- Prevents account sharing by rate-limiting device removals:
--   • 24-hour cooldown after removing a device before a NEW device can bind
--   • Max 3 removals per billing period (30 days)
--   • Re-adding the SAME HWID (reinstall scenario) bypasses the cooldown
--
-- Run this AFTER 20260218_add_device_bindings.sql
-- ============================================================================


-- ============================================================================
-- 1. Device Removals audit table
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_removals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  removed_hwid TEXT NOT NULL,
  device_label TEXT,
  removed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_removals_user_date
  ON device_removals(user_id, removed_at DESC);


-- ============================================================================
-- 2. Add removal-tracking columns to subscriptions
-- ============================================================================

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS device_removals_limit INTEGER NOT NULL DEFAULT 3;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS device_removals_reset_at TIMESTAMPTZ;

-- Initialize reset date for existing active subscriptions (30 days from now)
UPDATE subscriptions
SET device_removals_reset_at = NOW() + INTERVAL '30 days'
WHERE device_removals_reset_at IS NULL
  AND status = 'active';


-- ============================================================================
-- 3. RLS for device_removals
-- ============================================================================

ALTER TABLE device_removals ENABLE ROW LEVEL SECURITY;

-- Users can view their own removal history
DROP POLICY IF EXISTS "Users can view own removals" ON device_removals;
CREATE POLICY "Users can view own removals" ON device_removals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert/delete (backend manages removal logic)
DROP POLICY IF EXISTS "Service role can manage removals" ON device_removals;
CREATE POLICY "Service role can manage removals" ON device_removals
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- ============================================================================
-- 4. check_removal_allowed() — Can the user remove another device?
-- ============================================================================
-- Counts removals since the billing period start.
-- If the reset date has passed, we treat the count as 0 (caller resets it).
--
-- Returns JSONB:
--   { "allowed": true,  "used": N, "limit": M }
--   { "allowed": false, "used": N, "limit": M }

CREATE OR REPLACE FUNCTION check_removal_allowed(
  p_user_id         UUID,
  p_removals_limit  INTEGER,
  p_reset_at        TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period_start TIMESTAMPTZ;
  v_used INTEGER;
BEGIN
  -- Calculate period start (reset_at - 30 days)
  -- If reset_at is null or in the past, new period → 0 used
  IF p_reset_at IS NULL OR p_reset_at <= NOW() THEN
    RETURN jsonb_build_object('allowed', true, 'used', 0, 'limit', p_removals_limit);
  END IF;

  v_period_start := p_reset_at - INTERVAL '30 days';

  SELECT COUNT(*) INTO v_used
  FROM device_removals
  WHERE user_id = p_user_id
    AND removed_at >= v_period_start;

  IF v_used >= p_removals_limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', v_used, 'limit', p_removals_limit);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'used', v_used, 'limit', p_removals_limit);
END;
$$;


-- ============================================================================
-- 5. Update check_and_bind_device() — Add 24h cooldown enforcement
-- ============================================================================
-- When binding a NEW device (not already registered), checks if any device
-- was removed in the last 24 hours. If so, blocks the bind UNLESS the
-- incoming HWID matches a previously-removed HWID (= re-adding same device).

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
  v_last_removal TIMESTAMPTZ;
  v_is_same_device BOOLEAN;
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

  -- ── Cooldown check (only applies to NEW devices) ──

  -- Find the most recent removal by this user
  SELECT removed_at INTO v_last_removal
  FROM device_removals
  WHERE user_id = p_user_id
  ORDER BY removed_at DESC
  LIMIT 1;

  IF v_last_removal IS NOT NULL AND v_last_removal > NOW() - INTERVAL '24 hours' THEN
    -- Check if this HWID was ever removed (same-device re-add = exempt)
    SELECT EXISTS (
      SELECT 1 FROM device_removals
      WHERE user_id = p_user_id AND removed_hwid = p_hwid
    ) INTO v_is_same_device;

    IF NOT v_is_same_device THEN
      -- Block: cooldown still active for new devices
      RETURN jsonb_build_object(
        'bound', false,
        'reason', 'cooldown_active',
        'cooldown_ends', (v_last_removal + INTERVAL '24 hours')::text
      );
    END IF;
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
-- Verification Queries (Optional)
-- ============================================================================

-- Check removal limits for a user
-- SELECT check_removal_allowed('USER_ID'::UUID, 3, (SELECT device_removals_reset_at FROM subscriptions WHERE user_id = 'USER_ID'));

-- View removal history
-- SELECT * FROM device_removals ORDER BY removed_at DESC;

-- ============================================================================
-- Migration Complete
-- ============================================================================
