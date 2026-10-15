-- ============================================================================
-- Migration: BatchMyPhotos is free for everyone + blur beta request form
-- Date: 2026-10-15
-- ============================================================================
-- Paid plans are gone. Every account now gets what Pro used to give:
--   * check_batch_limit says is_pro=true with no expiry, so installed desktop
--     apps (1.0.5+) allow offline batching without an app update;
--   * get_my_subscription says plan=pro, status=active, so 1.0.7 stops
--     offering "Upgrade to Pro" and shows Manage Devices;
--   * every device check uses _device_limit(): at least 3, higher stored
--     limits (QA accounts) kept.
-- New trials, coupon checks, cancelling and the expiry-reminder emails are
-- switched off.
-- Payment tables and history are kept untouched.
--
-- blur_beta_requests: signed-in users ask to join the blur detection beta via
-- request_blur_beta(); admins read the list and mark when a key was emailed.
-- ============================================================================

-- ── Device cap: one home for the number ─────────────────────────────────────
CREATE OR REPLACE FUNCTION _device_limit(p_uid uuid)
RETURNS int
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT greatest(coalesce((SELECT device_limit FROM subscriptions WHERE user_id = p_uid), 0), 3);
$$;

REVOKE EXECUTE ON FUNCTION _device_limit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION _device_limit(uuid) TO service_role;

-- ── check_batch_limit() — everyone is treated as Pro, nothing expires ───────
CREATE OR REPLACE FUNCTION check_batch_limit()
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN jsonb_build_object(
    'can_execute', true,
    'is_pro', true,               -- desktop reads this to allow offline batching
    'usage', jsonb_build_object(
      'used', _month_usage(v_uid),
      'limit', NULL,
      'remaining', NULL
    ),
    'expires_at', NULL,           -- a date here makes old apps block when it passes
    'subscription_expired', false,
    'needs_renewal', false
  );
END;
$$;

-- ── get_my_subscription() — everyone shows as active Pro ────────────────────
-- Desktop 1.0.7 reads plan/status to hide "Upgrade to Pro" and show "Manage
-- Devices". The website and 1.0.8+ only read usage.
CREATE OR REPLACE FUNCTION get_my_subscription()
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN jsonb_build_object(
    'plan', 'pro',
    'status', 'active',
    'usage', jsonb_build_object('used', _month_usage(v_uid), 'limit', NULL)
  );
END;
$$;

-- ── bind_device — same as 20260831000004 except the limit ───────────────────
CREATE OR REPLACE FUNCTION bind_device(p_hwid text, p_label text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_label  text := coalesce(nullif(trim(p_label), ''), 'Unknown Device');
  v_limit  int;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_hwid IS NULL OR length(p_hwid) < 16 OR length(p_hwid) > 128 THEN
    RETURN jsonb_build_object('bound', false, 'error', 'Invalid or missing device ID');
  END IF;

  v_limit  := _device_limit(v_uid);
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

-- ── device_heartbeat — same as 20260831000004 except the limit ──────────────
CREATE OR REPLACE FUNCTION device_heartbeat(p_hwid text)
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

  IF p_hwid IS NULL OR p_hwid = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Missing device ID');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM device_bindings WHERE user_id = v_uid AND hwid_hash = p_hwid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Device not registered', 'code', 'DEVICE_NOT_FOUND');
  END IF;

  v_result := enforce_concurrent_sessions(v_uid, p_hwid, _device_limit(v_uid));

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

-- ── list_my_devices — same as 20260831000004 except the limit ───────────────
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

    IF v_last_removal IS NOT NULL AND v_last_removal + interval '24 hours' > now() THEN
      v_cooldown := v_last_removal + interval '24 hours';
    END IF;
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

-- ── Paid paths off ──────────────────────────────────────────────────────────
-- The checkout Edge Function is closed in code (needs a functions deploy).
REVOKE EXECUTE ON FUNCTION start_free_trial(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION validate_coupon(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION cancel_my_subscription() FROM authenticated;  -- its email offers "Re-subscribe"
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'expiry-reminders';

-- ── Blur beta requests ──────────────────────────────────────────────────────
CREATE TABLE public.blur_beta_requests (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  full_name        TEXT NOT NULL CHECK (length(full_name) BETWEEN 1 AND 100),
  photography_type TEXT NOT NULL CHECK (length(photography_type) BETWEEN 1 AND 100),
  photos_per_event TEXT NOT NULL CHECK (photos_per_event IN ('under-500', '500-2000', '2000-5000', 'over-5000')),
  reason           TEXT CHECK (length(reason) <= 1000),
  key_sent_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.blur_beta_requests ENABLE ROW LEVEL SECURITY;

-- Users write only through request_blur_beta(); they may read their own row.
CREATE POLICY blur_beta_requests_owner_read ON public.blur_beta_requests
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY blur_beta_requests_admin_read ON public.blur_beta_requests
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY blur_beta_requests_admin_update ON public.blur_beta_requests
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

REVOKE ALL ON public.blur_beta_requests FROM anon, authenticated;
GRANT SELECT ON public.blur_beta_requests TO authenticated;
GRANT UPDATE (key_sent_at) ON public.blur_beta_requests TO authenticated;

CREATE OR REPLACE FUNCTION request_blur_beta(
  p_full_name text, p_photography_type text, p_photos_per_event text, p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO blur_beta_requests (user_id, email, full_name, photography_type, photos_per_event, reason)
  SELECT v_uid, u.email, trim(p_full_name), trim(p_photography_type), p_photos_per_event,
         nullif(trim(p_reason), '')
  FROM auth.users u WHERE u.id = v_uid
  ON CONFLICT (user_id) DO UPDATE SET
    full_name        = EXCLUDED.full_name,
    photography_type = EXCLUDED.photography_type,
    photos_per_event = EXCLUDED.photos_per_event,
    reason           = EXCLUDED.reason,
    updated_at       = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION request_blur_beta(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION request_blur_beta(text, text, text, text) TO authenticated, service_role;
