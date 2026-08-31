-- ============================================================================
-- Migration: Self-securing client RPCs (replace the Express /api layer)
-- Date: 2026-08-31
-- ============================================================================
-- Every function here:
--   * SECURITY DEFINER, SET search_path = public
--   * derives the user from auth.uid() (never from an argument)
--   * derives limits from the subscriptions table (never from an argument)
--   * returns a jsonb body that MIRRORS the old Express response — including
--     `code` fields — so clients branch on JSON fields, not HTTP statuses.
--     (Business "failures" like limit-reached return HTTP 200 with
--     success:false / bound:false + code, replacing the old 403/404/409.)
--   * EXECUTE granted to authenticated only.
-- The legacy trusted RPCs (track_batch_usage, check_and_bind_device,
-- enforce_concurrent_sessions, check_removal_allowed) are wrapped, not
-- re-exposed (revoked in 20260831000001).
--
-- Ported from backend/routes/paymongo.js + backend/routes/devices.js.
-- Month key stays UTC (old code: new Date().toISOString().slice(0,7)).
-- ============================================================================

-- ── Internal helpers ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _month_key()
RETURNS text
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM');
$$;

CREATE OR REPLACE FUNCTION _month_usage(p_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(batch_count), 0)::int
  FROM batch_usage
  WHERE user_id = p_user_id AND month_year = _month_key();
$$;

REVOKE EXECUTE ON FUNCTION _month_key() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _month_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION _month_key() TO service_role;
GRANT EXECUTE ON FUNCTION _month_usage(uuid) TO service_role;

-- ── get_my_subscription() — replaces GET /api/subscription ───────────────────
-- (paymongo.js:464-542)

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
      'usage', jsonb_build_object('used', v_used, 'limit', 2)
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
      'limit', CASE WHEN v_eff_plan = 'pro' THEN NULL ELSE 2 END  -- null = unlimited
    )
  );
END;
$$;

-- ── check_batch_limit() — replaces POST /api/check-batch-limit ───────────────
-- (paymongo.js:576-632; is_pro deliberately means plan='pro' only, as before)

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
    'can_execute', v_is_pro OR v_used < 2,
    'is_pro', v_is_pro,
    'usage', jsonb_build_object(
      'used', v_used,
      'limit',     CASE WHEN v_is_pro THEN NULL ELSE 2 END,
      'remaining', CASE WHEN v_is_pro THEN NULL ELSE greatest(0, 2 - v_used) END
    ),
    'expires_at', v_expires_at,
    'subscription_expired', v_expired,
    'needs_renewal', v_expired
  );
END;
$$;

-- ── track_batch() — replaces POST /api/track-batch ───────────────────────────
-- (paymongo.js:636-702). Count is hardcoded to 1 per call — preserves the
-- Express hotfix normalising old clients that sent folder counts.
-- Limit-reached: HTTP 200 + {success:false, upgrade_required:true} (was 403).

CREATE OR REPLACE FUNCTION track_batch()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_plan       text;
  v_status     text;
  v_expires_at timestamptz;
  v_expired    boolean;
  v_is_pro     boolean;
  v_limit      int;
  v_result     jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT plan, status, expires_at INTO v_plan, v_status, v_expires_at
  FROM subscriptions WHERE user_id = v_uid;
  v_expired := FOUND AND v_expires_at IS NOT NULL AND v_expires_at < now();
  v_is_pro  := FOUND AND v_plan = 'pro' AND NOT v_expired AND v_status = 'active';
  v_limit   := CASE WHEN v_is_pro THEN NULL ELSE 2 END;

  v_result := track_batch_usage(v_uid, _month_key(), 1, v_limit);

  IF (v_result->>'success')::boolean THEN
    RETURN jsonb_build_object(
      'success', true,
      'usage', jsonb_build_object(
        'used', v_result->'used',
        'limit', v_result->'limit',
        'remaining', v_result->'remaining'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'error', v_result->>'error',
    'used', v_result->'used',
    'limit', v_result->'limit',
    'upgrade_required', true
  );
END;
$$;

-- ── bind_device(p_hwid, p_label) — replaces POST /api/devices/bind ───────────
-- (devices.js:20-105). Wraps check_and_bind_device. Failures: HTTP 200 +
-- {bound:false, code:'COOLDOWN_ACTIVE'|'DEVICE_LIMIT_REACHED'} (was 403).

CREATE OR REPLACE FUNCTION bind_device(p_hwid text, p_label text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_label      text := coalesce(nullif(trim(p_label), ''), 'Unknown Device');
  v_plan       text;
  v_status     text;
  v_expires_at timestamptz;
  v_dev_limit  int;
  v_expired    boolean;
  v_is_pro     boolean;
  v_limit      int;
  v_result     jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_hwid IS NULL OR length(p_hwid) < 16 OR length(p_hwid) > 128 THEN
    RETURN jsonb_build_object('bound', false, 'error', 'Invalid or missing device ID');
  END IF;

  SELECT plan, status, expires_at, device_limit INTO v_plan, v_status, v_expires_at, v_dev_limit
  FROM subscriptions WHERE user_id = v_uid;
  v_expired := FOUND AND v_expires_at IS NOT NULL AND v_expires_at < now();
  v_is_pro  := FOUND AND v_plan IN ('pro', 'pro_plus') AND NOT v_expired AND v_status = 'active';
  v_limit   := CASE WHEN v_is_pro
                 THEN coalesce(v_dev_limit, CASE WHEN v_plan = 'pro_plus' THEN 5 ELSE 2 END)
                 ELSE 1 END;

  v_result := check_and_bind_device(v_uid, p_hwid, left(v_label, 64), v_limit);

  IF (v_result->>'bound')::boolean THEN
    IF NOT coalesce((v_result->>'existing')::boolean, false) THEN
      PERFORM _send_email('new_device', v_uid,
        jsonb_build_object('device_label', v_label, 'bound_at', now()));
    END IF;
    RETURN jsonb_build_object(
      'bound', true,
      'existing', coalesce((v_result->>'existing')::boolean, false),
      'device_limit', v_limit
    );
  END IF;

  IF v_result->>'reason' = 'cooldown_active' THEN
    RETURN jsonb_build_object(
      'bound', false,
      'error', 'A device was recently removed. Please wait before adding a new device.',
      'code', 'COOLDOWN_ACTIVE',
      'cooldown_ends', v_result->'cooldown_ends'
    );
  END IF;

  RETURN jsonb_build_object(
    'bound', false,
    'error', 'Device limit reached. Remove an existing device to use this one.',
    'code', 'DEVICE_LIMIT_REACHED',
    'count', v_result->'count',
    'limit', coalesce(v_result->'limit', to_jsonb(v_limit))
  );
END;
$$;

-- ── device_heartbeat(p_hwid) — replaces POST /api/devices/heartbeat ──────────
-- (devices.js:112-178). Wraps enforce_concurrent_sessions. Status signaling
-- becomes body fields: DEVICE_NOT_FOUND (was 404), invalidated:true (was 409).

CREATE OR REPLACE FUNCTION device_heartbeat(p_hwid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_plan      text;
  v_dev_limit int;
  v_limit     int;
  v_result    jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_hwid IS NULL OR p_hwid = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Missing device ID');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM device_bindings WHERE user_id = v_uid AND hwid_hash = p_hwid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Device not registered', 'code', 'DEVICE_NOT_FOUND');
  END IF;

  SELECT device_limit, plan INTO v_dev_limit, v_plan FROM subscriptions WHERE user_id = v_uid;
  v_limit := coalesce(v_dev_limit,
               CASE WHEN v_plan = 'pro_plus' THEN 5 WHEN v_plan = 'pro' THEN 2 ELSE 1 END);

  v_result := enforce_concurrent_sessions(v_uid, p_hwid, v_limit);

  IF v_result IS NOT NULL
     AND NOT coalesce((v_result->>'ok')::boolean, true)
     AND coalesce((v_result->>'invalidated')::boolean, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'invalidated', true,
      'message', 'A concurrent session exceeded your plan limit and was removed.'
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── list_my_devices() — replaces GET /api/devices ────────────────────────────
-- (devices.js:185-251). Note: like the Express route, the displayed
-- device_limit here does NOT check plan expiry — display-only quirk, ported.

CREATE OR REPLACE FUNCTION list_my_devices()
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_devices        jsonb;
  v_plan           text;
  v_dev_limit      int;
  v_removals_limit int;
  v_reset_at       timestamptz;
  v_used           int := 0;
  v_last_removal   timestamptz;
  v_cooldown       timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'hwid_hash', hwid_hash,
           'device_label', device_label,
           'bound_at', bound_at,
           'last_seen_at', last_seen_at
         ) ORDER BY bound_at ASC), '[]'::jsonb)
  INTO v_devices
  FROM device_bindings WHERE user_id = v_uid;

  SELECT device_limit, plan, device_removals_limit, device_removals_reset_at
  INTO v_dev_limit, v_plan, v_removals_limit, v_reset_at
  FROM subscriptions WHERE user_id = v_uid;

  v_dev_limit      := coalesce(v_dev_limit,
                        CASE WHEN v_plan = 'pro_plus' THEN 5 WHEN v_plan = 'pro' THEN 2 ELSE 1 END);
  v_removals_limit := coalesce(v_removals_limit, 3);

  IF v_reset_at IS NOT NULL THEN
    SELECT count(*)::int, max(removed_at) INTO v_used, v_last_removal
    FROM device_removals
    WHERE user_id = v_uid AND removed_at >= v_reset_at - interval '30 days';

    IF v_last_removal IS NOT NULL AND v_last_removal + interval '24 hours' > now() THEN
      v_cooldown := v_last_removal + interval '24 hours';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'devices', v_devices,
    'device_limit', v_dev_limit,
    'device_count', jsonb_array_length(v_devices),
    'removals_used', coalesce(v_used, 0),
    'removals_limit', v_removals_limit,
    'removals_reset_at', v_reset_at,
    'cooldown_ends_at', v_cooldown
  );
END;
$$;

-- ── remove_device(p_device_id) — replaces DELETE /api/devices/:id ────────────
-- (devices.js:258-377). Wraps check_removal_allowed. Advisory lock shares the
-- key with check_and_bind_device, closing the old bind/remove race.
-- Limit hit: HTTP 200 + {success:false, code:'REMOVAL_LIMIT_REACHED'} (was 403).

CREATE OR REPLACE FUNCTION remove_device(p_device_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_rlimit    int;
  v_reset     timestamptz;
  v_check     jsonb;
  v_row       RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));

  SELECT device_removals_limit, device_removals_reset_at INTO v_rlimit, v_reset
  FROM subscriptions WHERE user_id = v_uid;
  v_rlimit := coalesce(v_rlimit, 3);

  -- Auto-reset an expired removal period (purge old audit rows, roll the window)
  IF v_reset IS NOT NULL AND v_reset <= now() THEN
    DELETE FROM device_removals WHERE user_id = v_uid AND removed_at < v_reset;
    v_reset := now() + interval '30 days';
    UPDATE subscriptions SET device_removals_reset_at = v_reset WHERE user_id = v_uid;
  END IF;

  v_check := check_removal_allowed(v_uid, v_rlimit, v_reset);

  IF NOT (v_check->>'allowed')::boolean THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'You''ve used all %s device removals for this billing period. Removals reset on %s.',
        v_rlimit, to_char(v_reset, 'FMMonth FMDD, YYYY')),
      'code', 'REMOVAL_LIMIT_REACHED',
      'removals_used', v_check->'used',
      'removals_limit', v_check->'limit',
      'removals_reset_at', v_reset
    );
  END IF;

  SELECT id, hwid_hash, device_label INTO v_row
  FROM device_bindings WHERE id = p_device_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Device not found or not owned by you');
  END IF;

  DELETE FROM device_bindings WHERE id = p_device_id AND user_id = v_uid;

  INSERT INTO device_removals (user_id, removed_hwid, device_label)
  VALUES (v_uid, v_row.hwid_hash, v_row.device_label);

  PERFORM _send_email('device_removed', v_uid,
    jsonb_build_object('device_label', v_row.device_label, 'removed_at', now()));

  RETURN jsonb_build_object(
    'success', true,
    'removed', jsonb_build_object('id', v_row.id, 'hwid_hash', v_row.hwid_hash, 'device_label', v_row.device_label),
    'removals_used', coalesce((v_check->>'used')::int, 0) + 1,
    'removals_limit', v_rlimit,
    'cooldown_ends_at', now() + interval '24 hours',
    'removals_reset_at', v_reset
  );
END;
$$;

-- ── start_free_trial(p_hwid) — replaces POST /api/start-free-trial ───────────
-- (paymongo.js:151-258). Website omits p_hwid; desktop may pass it. The
-- advisory lock is new: it closes the double-claim race the Express route had.

CREATE OR REPLACE FUNCTION start_free_trial(p_hwid text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_sub        RECORD;
  v_expired    boolean;
  v_now        timestamptz := now();
  v_end        timestamptz := now() + interval '30 days';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('trial' || v_uid::text));

  SELECT free_trial_used, plan, status, expires_at INTO v_sub
  FROM subscriptions WHERE user_id = v_uid;

  IF FOUND AND coalesce(v_sub.free_trial_used, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You have already used your free trial.');
  END IF;

  IF FOUND THEN
    v_expired := v_sub.expires_at IS NOT NULL AND v_sub.expires_at < v_now;
    IF v_sub.plan = 'pro' AND v_sub.status = 'active' AND NOT v_expired THEN
      RETURN jsonb_build_object('success', false, 'error', 'You already have an active Pro subscription.');
    END IF;
  END IF;

  IF p_hwid IS NOT NULL AND length(p_hwid) >= 16 THEN
    IF EXISTS (SELECT 1 FROM trial_device_claims WHERE hwid_hash = p_hwid) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'A free trial has already been used on this device.',
        'code', 'DEVICE_TRIAL_CLAIMED'
      );
    END IF;
  END IF;

  INSERT INTO subscriptions (
    user_id, plan, status, free_trial_used, free_trial_start_at, free_trial_end_at,
    expires_at, amount, currency, device_limit, device_removals_limit,
    device_removals_reset_at, paid_at, updated_at
  ) VALUES (
    v_uid, 'pro', 'active', true, v_now, v_end,
    v_end, 0, 'PHP', 2, 3,
    v_end, v_now, v_now
  )
  ON CONFLICT (user_id) DO UPDATE SET
    plan = EXCLUDED.plan,
    status = EXCLUDED.status,
    free_trial_used = EXCLUDED.free_trial_used,
    free_trial_start_at = EXCLUDED.free_trial_start_at,
    free_trial_end_at = EXCLUDED.free_trial_end_at,
    expires_at = EXCLUDED.expires_at,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    device_limit = EXCLUDED.device_limit,
    device_removals_limit = EXCLUDED.device_removals_limit,
    device_removals_reset_at = EXCLUDED.device_removals_reset_at,
    paid_at = EXCLUDED.paid_at,
    updated_at = EXCLUDED.updated_at;

  IF p_hwid IS NOT NULL AND length(p_hwid) >= 16 THEN
    INSERT INTO trial_device_claims (hwid_hash, user_id)
    VALUES (p_hwid, v_uid)
    ON CONFLICT (hwid_hash) DO NOTHING;
  END IF;

  PERFORM _send_email('trial_started', v_uid, jsonb_build_object('trial_end_at', v_end));

  RETURN jsonb_build_object(
    'success', true,
    'plan', 'pro',
    'status', 'active',
    'free_trial_used', true,
    'free_trial_start_at', v_now,
    'free_trial_end_at', v_end,
    'expires_at', v_end
  );
END;
$$;

-- ── cancel_my_subscription() — replaces POST /api/cancel-subscription ────────
-- (paymongo.js:845-891). DB-only, as before (one-off charges, nothing
-- recurring to cancel at PayMongo).

CREATE OR REPLACE FUNCTION cancel_my_subscription()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT status INTO v_status FROM subscriptions WHERE user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription not found');
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription is already cancelled');
  END IF;

  UPDATE subscriptions
  SET plan = 'free', status = 'cancelled', expires_at = now(), updated_at = now()
  WHERE user_id = v_uid;

  PERFORM _send_email('subscription_cancelled', v_uid, '{}'::jsonb);

  RETURN jsonb_build_object('success', true, 'message', 'Subscription cancelled successfully');
END;
$$;

-- ── validate_coupon(p_code) — replaces POST /api/validate-coupon ─────────────
-- (paymongo.js:262-324) minus the hardcoded EARLY149 (expired 2026-03-31).
-- SECURITY DEFINER is what lets users check a code without any read access to
-- referral_coupons — do not replace with a client-side .from() read.

CREATE OR REPLACE FUNCTION validate_coupon(p_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_code text;
  v_c    referral_coupons%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_code IS NULL OR trim(p_code) = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Please enter a coupon code.');
  END IF;
  v_code := upper(trim(p_code));

  SELECT * INTO v_c FROM referral_coupons WHERE code = v_code AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Invalid coupon code.');
  END IF;

  IF now() > v_c.expires_at THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This coupon has expired.');
  END IF;

  IF EXISTS (SELECT 1 FROM transactions WHERE user_id = v_uid AND coupon_code IS NOT NULL) THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'You have already used a coupon code.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = v_uid AND plan = 'pro' AND status = 'active'
      AND expires_at IS NOT NULL AND expires_at > now()
  ) THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupons cannot be applied to existing subscriptions.');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'code', v_code,
    'originalPrice', 29900,
    'discountedPrice', v_c.discounted_price_centavos,
    'description', v_c.description
  );
END;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION get_my_subscription() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION check_batch_limit() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION track_batch() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION bind_device(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION device_heartbeat(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION list_my_devices() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION remove_device(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION start_free_trial(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cancel_my_subscription() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION validate_coupon(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION get_my_subscription() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION check_batch_limit() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION track_batch() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bind_device(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION device_heartbeat(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION list_my_devices() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION remove_device(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION start_free_trial(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cancel_my_subscription() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION validate_coupon(text) TO authenticated, service_role;
