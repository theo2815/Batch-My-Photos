-- ============================================================================
-- Migration: Secure SECURITY DEFINER functions & tighten RLS policies
-- Date: 2026-02-19
-- ============================================================================
-- This migration:
-- 1. Adds SET search_path = public to all SECURITY DEFINER functions
--    to prevent search_path manipulation attacks.
-- 2. Drops overly permissive "Service role can manage *" RLS policies
--    (the service role bypasses RLS anyway, so these only widen access
--    to non-service-role callers via USING(true)).
-- ============================================================================


-- ============================================================================
-- 1. Drop overly permissive RLS catch-all policies
-- ============================================================================

DROP POLICY IF EXISTS "Service role can manage devices" ON device_bindings;
DROP POLICY IF EXISTS "Service role can manage removals" ON device_removals;


-- ============================================================================
-- 2. Re-create all SECURITY DEFINER functions with SET search_path = public
-- ============================================================================

-- 2a. get_monthly_usage (from 001_batch_usage_tracking.sql)
CREATE OR REPLACE FUNCTION get_monthly_usage(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  current_month VARCHAR(7);
  total_usage INTEGER;
BEGIN
  current_month := TO_CHAR(NOW(), 'YYYY-MM');
  SELECT COALESCE(SUM(batch_count), 0)
  INTO total_usage
  FROM batch_usage
  WHERE user_id = p_user_id
    AND month_year = current_month;
  RETURN total_usage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 2b. track_batch_usage (from 20260218_track_batch_usage_func.sql)
CREATE OR REPLACE FUNCTION track_batch_usage(
  p_user_id uuid,
  p_month_year text,
  p_count int,
  p_limit int
) RETURNS jsonb AS $$
DECLARE
  v_current_usage int;
  v_new_usage int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('track_batch_usage' || p_user_id::text || p_month_year));

  SELECT COALESCE(SUM(batch_count), 0) INTO v_current_usage
  FROM batch_usage
  WHERE user_id = p_user_id AND month_year = p_month_year;

  v_new_usage := v_current_usage + p_count;

  IF p_limit IS NOT NULL AND v_new_usage > p_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Monthly batch limit exceeded',
      'used', v_current_usage,
      'limit', p_limit,
      'remaining', 0
    );
  END IF;

  INSERT INTO batch_usage (user_id, month_year, batch_count, executed_at)
  VALUES (p_user_id, p_month_year, p_count, NOW());

  RETURN jsonb_build_object(
    'success', true,
    'used', v_new_usage,
    'limit', p_limit,
    'remaining', CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit - v_new_usage END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 2c. check_removal_allowed (from 20260219_device_removal_limits.sql)
CREATE OR REPLACE FUNCTION check_removal_allowed(
  p_user_id         UUID,
  p_removals_limit  INTEGER,
  p_reset_at        TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start TIMESTAMPTZ;
  v_used INTEGER;
BEGIN
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


-- 2d. check_and_bind_device (latest version with cooldown, from 20260219_device_removal_limits.sql)
CREATE OR REPLACE FUNCTION check_and_bind_device(
  p_user_id   UUID,
  p_hwid      TEXT,
  p_label     TEXT,
  p_limit     INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing  UUID;
  v_count     INTEGER;
  v_last_removal TIMESTAMPTZ;
  v_is_same_device BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT id INTO v_existing
  FROM device_bindings
  WHERE user_id = p_user_id AND hwid_hash = p_hwid;

  IF v_existing IS NOT NULL THEN
    UPDATE device_bindings
    SET last_seen_at = NOW(),
        device_label = COALESCE(p_label, device_label)
    WHERE id = v_existing;
    RETURN jsonb_build_object('bound', true, 'existing', true);
  END IF;

  SELECT removed_at INTO v_last_removal
  FROM device_removals
  WHERE user_id = p_user_id
  ORDER BY removed_at DESC
  LIMIT 1;

  IF v_last_removal IS NOT NULL AND v_last_removal > NOW() - INTERVAL '24 hours' THEN
    SELECT EXISTS (
      SELECT 1 FROM device_removals
      WHERE user_id = p_user_id AND removed_hwid = p_hwid
    ) INTO v_is_same_device;

    IF NOT v_is_same_device THEN
      RETURN jsonb_build_object(
        'bound', false,
        'reason', 'cooldown_active',
        'cooldown_ends', (v_last_removal + INTERVAL '24 hours')::text
      );
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM device_bindings
  WHERE user_id = p_user_id;

  IF v_count >= p_limit THEN
    RETURN jsonb_build_object(
      'bound', false,
      'reason', 'limit_reached',
      'count', v_count,
      'limit', p_limit
    );
  END IF;

  INSERT INTO device_bindings (user_id, hwid_hash, device_label)
  VALUES (p_user_id, p_hwid, p_label);

  RETURN jsonb_build_object('bound', true, 'existing', false);
END;
$$;


-- 2e. enforce_concurrent_sessions (from 20260218_add_device_bindings.sql)
CREATE OR REPLACE FUNCTION enforce_concurrent_sessions(
  p_user_id UUID,
  p_hwid    TEXT,
  p_limit   INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_count INTEGER;
  v_oldest_id    UUID;
  v_oldest_hwid  TEXT;
BEGIN
  UPDATE device_bindings
  SET last_seen_at = NOW()
  WHERE user_id = p_user_id AND hwid_hash = p_hwid;

  SELECT COUNT(*) INTO v_active_count
  FROM device_bindings
  WHERE user_id = p_user_id
    AND last_seen_at > NOW() - INTERVAL '10 minutes';

  IF v_active_count <= p_limit THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

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
-- Migration Complete
-- ============================================================================
