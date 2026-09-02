-- ============================================================================
-- Migration: Batch processing is unlimited for all users
-- Date: 2026-09-02
-- ============================================================================
-- Removes the Free-tier monthly batch cap (was 2/month). Batch processing is
-- now unlimited for EVERY account. Only the three batch RPCs from
-- 20260831000004_client_rpcs.sql are redefined; the batch limit becomes NULL
-- (unlimited) regardless of plan.
--
-- Deliberately unchanged:
--   * Usage is STILL tracked (track_batch keeps inserting batch_usage rows) —
--     only the cap is removed, so dashboards can still show batches-this-month.
--   * track_batch_usage() is untouched — it is generic (p_limit=NULL => no cap).
--   * Device limits, offline-batching-is-Pro, trial/coupon/payment logic, and
--     blur detection are separate restrictions and are NOT affected.
--
-- CREATE OR REPLACE preserves the existing grants (authenticated, service_role),
-- so no re-GRANT is needed.
-- ============================================================================

-- ── get_my_subscription() — dashboard now shows unlimited for everyone ────────

CREATE OR REPLACE FUNCTION get_my_subscription()
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_sub           subscriptions%ROWTYPE;
  v_used          int;
  v_trial_used    boolean;
  v_trial_expired boolean;
  v_expired       boolean;
  v_eff_plan      text;
  v_eff_status    text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_used := _month_usage(v_uid);

  SELECT * INTO v_sub FROM subscriptions WHERE user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'plan', 'free',
      'status', 'active',
      'free_trial_used', false,
      'usage', jsonb_build_object('used', v_used, 'limit', NULL)  -- null = unlimited
    );
  END IF;

  v_trial_used    := coalesce(v_sub.free_trial_used, false);
  v_trial_expired := v_trial_used AND v_sub.free_trial_end_at IS NOT NULL AND v_sub.free_trial_end_at < now();
  v_expired       := v_sub.expires_at IS NOT NULL AND v_sub.expires_at < now();

  v_eff_plan   := v_sub.plan;
  v_eff_status := v_sub.status;
  IF v_trial_expired AND v_sub.amount = 0 THEN
    v_eff_plan := 'free'; v_eff_status := 'trial_expired';   -- trial-only user, trial over
  ELSIF v_expired THEN
    v_eff_plan := 'free'; v_eff_status := 'expired';
  END IF;

  RETURN jsonb_build_object(
    'plan', v_eff_plan,
    'status', v_eff_status,
    'paid_at', v_sub.paid_at,
    'expires_at', v_sub.expires_at,
    'amount', v_sub.amount,
    'currency', v_sub.currency,
    'paymongo_checkout_id', v_sub.paymongo_checkout_id,
    'free_trial_used', v_trial_used,
    'free_trial_start_at', v_sub.free_trial_start_at,
    'free_trial_end_at', v_sub.free_trial_end_at,
    'usage', jsonb_build_object(
      'used', v_used,
      'limit', NULL  -- null = unlimited for all plans
    )
  );
END;
$$;

-- ── check_batch_limit() — the pre-batch gate now always allows ────────────────

CREATE OR REPLACE FUNCTION check_batch_limit()
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_used       int;
  v_plan       text;
  v_status     text;
  v_expires_at timestamptz;
  v_found      boolean;
  v_expired    boolean;
  v_is_pro     boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_used := _month_usage(v_uid);

  SELECT plan, status, expires_at INTO v_plan, v_status, v_expires_at
  FROM subscriptions WHERE user_id = v_uid;
  v_found   := FOUND;
  v_expired := v_found AND v_expires_at IS NOT NULL AND v_expires_at < now();
  v_is_pro  := v_found AND v_plan = 'pro' AND NOT v_expired AND v_status = 'active';

  RETURN jsonb_build_object(
    'can_execute', true,          -- batch processing is unlimited for all users
    'is_pro', v_is_pro,
    'usage', jsonb_build_object(
      'used', v_used,
      'limit', NULL,              -- null = unlimited
      'remaining', NULL
    ),
    'expires_at', v_expires_at,
    'subscription_expired', v_expired,
    'needs_renewal', v_expired
  );
END;
$$;

-- ── track_batch() — records usage, never rejects ─────────────────────────────
-- Count stays hardcoded to 1 per call (preserves the old normalisation of
-- clients that sent folder counts). Passing NULL as the limit means
-- track_batch_usage never rejects, so every call succeeds.

CREATE OR REPLACE FUNCTION track_batch()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_result := track_batch_usage(v_uid, _month_key(), 1, NULL::int);  -- NULL limit = no cap

  RETURN jsonb_build_object(
    'success', true,
    'usage', jsonb_build_object(
      'used', v_result->'used',
      'limit', v_result->'limit',
      'remaining', v_result->'remaining'
    )
  );
END;
$$;
