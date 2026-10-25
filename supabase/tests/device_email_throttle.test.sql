BEGIN;
SELECT plan(9);

-- Switch email on for this transaction only, then read what was queued for send-email.
SELECT vault.create_secret('http://email.test/send-email', 'email_fn_url');
SELECT vault.create_secret('test-secret', 'email_fn_secret');
CREATE TEMP VIEW sent AS
  SELECT convert_from(body, 'UTF8')::jsonb AS m FROM net.http_request_queue WHERE url = 'http://email.test/send-email';

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password)
VALUES ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'busy@example.test', 'test'),
       ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@example.test', 'test'),
       ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'recent@example.test', 'test'),
       ('00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aged@example.test', 'test');

-- ── Device emails stop at 5 per kind per user per hour ──────────────────────
SELECT _send_email('new_device', '00000000-0000-0000-0000-000000000401', '{}') FROM generate_series(1, 7);
SELECT is((SELECT count(*) FROM sent WHERE m->>'kind' = 'new_device' AND m->>'to' = 'busy@example.test'), 5::bigint,
  '7 new_device emails to one user queue only 5');

SELECT _send_email('device_removed', '00000000-0000-0000-0000-000000000401', '{}') FROM generate_series(1, 7);
SELECT is((SELECT count(*) FROM sent WHERE m->>'kind' = 'device_removed' AND m->>'to' = 'busy@example.test'), 5::bigint,
  '7 device_removed emails to one user queue only 5');

-- ── The limit is per user ───────────────────────────────────────────────────
SELECT _send_email('new_device', '00000000-0000-0000-0000-000000000402', '{}');
SELECT is((SELECT count(*) FROM sent WHERE m->>'kind' = 'new_device' AND m->>'to' = 'other@example.test'), 1::bigint,
  'another user still gets a new_device email');

-- ── The window is one hour ──────────────────────────────────────────────────
INSERT INTO public.email_send_log (user_id, kind, sent_at)
SELECT u, 'new_device', now() - d
FROM (VALUES ('00000000-0000-0000-0000-000000000403'::uuid, interval '30 minutes'),
             ('00000000-0000-0000-0000-000000000404'::uuid, interval '61 minutes')) AS t(u, d),
     generate_series(1, 5);
SELECT _send_email('new_device', '00000000-0000-0000-0000-000000000403', '{}');
SELECT _send_email('new_device', '00000000-0000-0000-0000-000000000404', '{}');
SELECT is((SELECT count(*) FROM sent WHERE m->>'kind' = 'new_device' AND m->>'to' = 'recent@example.test'), 0::bigint,
  '5 new_device emails 30 minutes ago still block the next one');
SELECT is((SELECT count(*) FROM sent WHERE m->>'kind' = 'new_device' AND m->>'to' = 'aged@example.test'), 1::bigint,
  '5 new_device emails 61 minutes ago no longer count');

-- ── Other kinds are never throttled ─────────────────────────────────────────
SELECT _send_email('beta_key', '00000000-0000-0000-0000-000000000401', '{}') FROM generate_series(1, 7);
SELECT is((SELECT count(*) FROM sent WHERE m->>'kind' = 'beta_key' AND m->>'to' = 'busy@example.test'), 7::bigint,
  'beta_key emails are not limited');

-- ── Admin beta alerts share the cap ─────────────────────────────────────────
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password)
VALUES ('00000000-0000-0000-0000-000000000405', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.test', 'test');
SELECT _send_email('beta_request_admin', '00000000-0000-0000-0000-000000000405', '{}') FROM generate_series(1, 7);
SELECT is((SELECT count(*) FROM sent WHERE m->>'kind' = 'beta_request_admin' AND m->>'to' = 'admin@example.test'), 5::bigint,
  'admin alerts are capped at 5 per hour');

-- ── The log is private ──────────────────────────────────────────────────────
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE relname = 'email_send_log' AND relnamespace = 'public'::regnamespace),
  'email_send_log has row level security on');

SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT * FROM public.email_send_log', '42501', NULL, 'signed-in users cannot read email_send_log');

SELECT * FROM finish();
ROLLBACK;
