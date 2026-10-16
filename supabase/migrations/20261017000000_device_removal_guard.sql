-- ============================================================================
-- Device removal guard (security audit C-02 + C-15)
-- ============================================================================
-- C-02: the RLS policy "Users can delete own devices" (20260218000001) let a
-- signed-in user delete device_bindings rows straight through the REST API,
-- skipping remove_device(): no removal recorded, no cooldown, no limit.
-- Both clients remove devices only through the RPC (website useDevices.js,
-- desktop deviceService.js), so the policy and the DELETE grant go.
--
-- C-15: remove_device() capped removals only when the subscriptions row had a
-- device_removals_reset_at; accounts without one (every new account) could
-- remove without limit. There is no row to hold a date for them, so they get
-- a rolling window instead: at most v_rlimit (3) removals in the last 30 days,
-- reset date = the day the oldest counted removal drops out. Accounts with a
-- stored date keep the old window. list_my_devices() shows the same numbers.
-- ============================================================================

DROP POLICY IF EXISTS "Users can delete own devices" ON public.device_bindings;
REVOKE DELETE ON public.device_bindings FROM authenticated;

-- ── remove_device — same as 20260831000004 except the rolling window ────────
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
  v_used      int;
  v_check     jsonb;
  v_row       RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));

  SELECT device_removals_limit, device_removals_reset_at INTO v_rlimit, v_reset
  FROM subscriptions WHERE user_id = v_uid;
  v_rlimit := coalesce(v_rlimit, 3);

  IF v_reset IS NULL THEN
    -- No stored window: count removals in the last 30 days.
    SELECT count(*)::int, min(removed_at) + interval '30 days' INTO v_used, v_reset
    FROM device_removals
    WHERE user_id = v_uid AND removed_at > now() - interval '30 days';
    v_check := jsonb_build_object('allowed', v_used < v_rlimit, 'used', v_used, 'limit', v_rlimit);
  ELSE
    -- Auto-reset an expired removal period (purge old audit rows, roll the window)
    IF v_reset <= now() THEN
      DELETE FROM device_removals WHERE user_id = v_uid AND removed_at < v_reset;
      v_reset := now() + interval '30 days';
      UPDATE subscriptions SET device_removals_reset_at = v_reset WHERE user_id = v_uid;
    END IF;

    v_check := check_removal_allowed(v_uid, v_rlimit, v_reset);
  END IF;

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

-- ── list_my_devices — same as 20261015000000 except the rolling window ──────
CREATE OR REPLACE FUNCTION list_my_devices()
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_devices        jsonb;
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

  SELECT device_removals_limit, device_removals_reset_at
  INTO v_removals_limit, v_reset_at
  FROM subscriptions WHERE user_id = v_uid;

  v_removals_limit := coalesce(v_removals_limit, 3);

  IF v_reset_at IS NOT NULL THEN
    SELECT count(*)::int, max(removed_at) INTO v_used, v_last_removal
    FROM device_removals
    WHERE user_id = v_uid AND removed_at >= v_reset_at - interval '30 days';
  ELSE
    -- No stored window: same rolling 30 days as remove_device.
    SELECT count(*)::int, min(removed_at) + interval '30 days', max(removed_at)
    INTO v_used, v_reset_at, v_last_removal
    FROM device_removals
    WHERE user_id = v_uid AND removed_at > now() - interval '30 days';
  END IF;

  IF v_last_removal IS NOT NULL AND v_last_removal + interval '24 hours' > now() THEN
    v_cooldown := v_last_removal + interval '24 hours';
  END IF;

  RETURN jsonb_build_object(
    'devices', v_devices,
    'device_limit', _device_limit(v_uid),
    'device_count', jsonb_array_length(v_devices),
    'removals_used', coalesce(v_used, 0),
    'removals_limit', v_removals_limit,
    'removals_reset_at', v_reset_at,
    'cooldown_ends_at', v_cooldown
  );
END;
$$;
