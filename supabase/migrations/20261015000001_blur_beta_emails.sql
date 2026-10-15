-- ============================================================================
-- Migration: blur beta emails
-- Date: 2026-10-15
-- ============================================================================
-- Reuses _send_email() (pg_net -> send-email Edge Function -> Resend):
--   * a NEW request emails the requester a confirmation and every admin an
--     alert (updates to an existing request send nothing);
--   * admins send the beta key with send_blur_beta_key(), which emails it and
--     marks the request as sent. This replaces the admin's direct UPDATE of
--     key_sent_at, so that grant and policy are dropped.
-- The key travels in the pg_net request body; net.http_request_queue is
-- readable only by postgres/service_role and rows are removed once sent.
-- ============================================================================

-- ── request_blur_beta — same as 20261015000000, plus the two emails ─────────
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
  v_req record;
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
    updated_at       = now()
  RETURNING email, full_name, photography_type, photos_per_event, reason,
            (xmax = 0) AS inserted  -- true for a new row, false for an update
  INTO v_req;

  IF v_req.inserted THEN
    PERFORM _send_email('beta_request_received', v_uid, jsonb_build_object('full_name', v_req.full_name));
    PERFORM _send_email('beta_request_admin', a.user_id, jsonb_build_object(
      'full_name', v_req.full_name, 'email', v_req.email, 'photography_type', v_req.photography_type,
      'photos_per_event', v_req.photos_per_event, 'reason', v_req.reason))
    FROM admin_users a;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── send_blur_beta_key — admin emails a key and marks the request sent ──────
CREATE OR REPLACE FUNCTION send_blur_beta_key(p_user_id uuid, p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF NOT coalesce(is_admin(), false) THEN
    RAISE EXCEPTION 'Only admins can send beta keys' USING ERRCODE = '42501';
  END IF;

  -- Same rule as the desktop key store (blurBetaKeyStore.js): printable ASCII, no spaces, ≤ 1024
  IF p_key IS NULL OR p_key !~ '^[!-~]+$' OR length(p_key) > 1024 THEN
    RAISE EXCEPTION 'Enter a valid beta key without spaces (maximum 1024 characters).' USING ERRCODE = '22023';
  END IF;

  UPDATE blur_beta_requests SET key_sent_at = now(), updated_at = now()
  WHERE user_id = p_user_id
  RETURNING full_name INTO v_name;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This person has not requested a beta key' USING ERRCODE = 'P0002';
  END IF;

  PERFORM _send_email('beta_key', p_user_id, jsonb_build_object('full_name', v_name, 'key', p_key));
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION send_blur_beta_key(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION send_blur_beta_key(uuid, text) TO authenticated, service_role;

-- ── Keys are marked sent only by sending them ───────────────────────────────
DROP POLICY blur_beta_requests_admin_update ON public.blur_beta_requests;
REVOKE UPDATE ON public.blur_beta_requests FROM authenticated;
