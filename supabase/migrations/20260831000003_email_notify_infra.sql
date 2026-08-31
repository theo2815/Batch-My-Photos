-- ============================================================================
-- Migration: Email notification infra (pg_net -> send-email Edge Function)
--            + expiring-soon reminder cron (pg_cron) with dedupe
-- Date: 2026-08-31
-- ============================================================================
-- Replaces backend/services/emailService.js triggering + cronService.js.
-- Transactional emails fired from RPCs go through _send_email() ->
-- net.http_post -> the send-email Edge Function (async, fire-and-forget —
-- mirrors the old .catch(() => {}) semantics; email failure never fails the
-- calling transaction).
--
-- Manual setup required once per project (Vault):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-email', 'email_fn_url');
--   select vault.create_secret('<random shared secret>', 'email_fn_secret');
-- The same shared secret must be set as EMAIL_FN_SECRET on the send-email
-- Edge Function. If the Vault secrets are absent, _send_email() no-ops
-- (mirrors emailService.js behaviour when RESEND_API_KEY is unset).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

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

-- ── Expiring-soon reminder ───────────────────────────────────────────────────
-- Dedupe marker: one reminder per expires_at value. The old Express cron sent
-- the same reminder every day inside the 3-day window (and trials matched two
-- queries), producing 3-6 duplicate emails per expiry. A renewal writes a new
-- expires_at, which re-arms the reminder automatically.

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS expiry_notified_for timestamptz;

CREATE OR REPLACE FUNCTION notify_expiring_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT user_id, expires_at, amount, free_trial_used, free_trial_end_at
    FROM subscriptions
    WHERE status = 'active'
      AND expires_at BETWEEN now() AND now() + interval '3 days'
      AND expiry_notified_for IS DISTINCT FROM expires_at
  LOOP
    PERFORM _send_email(
      'subscription_expiring',
      r.user_id,
      jsonb_build_object(
        'expires_at', r.expires_at,
        'is_trial', (coalesce(r.free_trial_used, false) AND r.amount = 0 AND r.free_trial_end_at = r.expires_at)
      )
    );
    UPDATE subscriptions SET expiry_notified_for = r.expires_at WHERE user_id = r.user_id;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION notify_expiring_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION notify_expiring_subscriptions() TO service_role;

-- Daily at 09:00 UTC — same hour as the old Express cron.
-- (No monthly usage-summary job: dropped by decision, 2026-08-31.)
SELECT cron.schedule('expiry-reminders', '0 9 * * *', $$SELECT public.notify_expiring_subscriptions()$$);
