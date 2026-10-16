-- ============================================================================
-- Device email throttle (security audit C-17)
-- ============================================================================
-- Every bind_device and remove_device sent one email through _send_email()
-- with no limit, so one account could drain the Resend quota and silently
-- stop other users' emails. Only the two device kinds (new_device,
-- device_removed) are capped: admin alerts, beta keys and trial/subscription
-- emails are never throttled. email_send_log is read and written only by
-- this SECURITY DEFINER function; clients have no access.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_send_log (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind    text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_send_log_user_kind_sent_idx ON public.email_send_log (user_id, kind, sent_at);
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_send_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION _send_email(p_kind text, p_user_id uuid, p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    text;
  v_secret text;
  v_email  text;
BEGIN
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'email_fn_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'email_fn_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN; -- email not configured — silently no-op
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RETURN;
  END IF;

  IF p_kind IN ('new_device', 'device_removed') THEN
    DELETE FROM email_send_log WHERE user_id = p_user_id AND sent_at < now() - interval '1 day';
    -- Limit: 5 emails per device kind per user per hour (owner default, O-5).
    IF (SELECT count(*) FROM email_send_log
        WHERE user_id = p_user_id AND kind = p_kind AND sent_at > now() - interval '1 hour') >= 5 THEN
      RAISE NOTICE '_send_email(%) throttled for user %', p_kind, p_user_id;
      RETURN;
    END IF;
    INSERT INTO email_send_log (user_id, kind) VALUES (p_user_id, p_kind);
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    body    := jsonb_build_object('kind', p_kind, 'to', v_email, 'data', coalesce(p_data, '{}'::jsonb)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-email-secret', v_secret)
  );
EXCEPTION WHEN OTHERS THEN
  -- Fire-and-forget: never let email plumbing break the calling operation.
  RAISE WARNING '_send_email(%) failed: %', p_kind, SQLERRM;
END;
$$;

REVOKE EXECUTE ON FUNCTION _send_email(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION _send_email(text, uuid, jsonb) TO service_role;
