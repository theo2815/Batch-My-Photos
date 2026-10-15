BEGIN;
SELECT plan(14);

-- Switch email on for this transaction only, then read what was queued for send-email.
SELECT vault.create_secret('http://email.test/send-email', 'email_fn_url');
SELECT vault.create_secret('test-secret', 'email_fn_secret');
CREATE TEMP VIEW sent AS
  SELECT convert_from(body, 'UTF8')::jsonb AS m FROM net.http_request_queue WHERE url = 'http://email.test/send-email';
GRANT SELECT ON sent TO authenticated, anon;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password)
VALUES ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tester@example.test', 'test'),
       ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a@example.test', 'test'),
       ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-b@example.test', 'test'),
       ('00000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nobody@example.test', 'test');
INSERT INTO public.admin_users (user_id) VALUES ('00000000-0000-0000-0000-000000000203'), ('00000000-0000-0000-0000-000000000204');
CREATE TEMP TABLE admins AS
  SELECT array_agg(u.email::text ORDER BY u.email) AS emails FROM public.admin_users a JOIN auth.users u ON u.id = a.user_id;
GRANT SELECT ON admins TO authenticated;

-- ── A new request emails the requester and every admin ──────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);
SELECT request_blur_beta('Ana Cruz', 'Marathons', '500-2000', 'Too many <b>blurry</b> shots');

SELECT is((SELECT count(*) FROM sent WHERE m->>'kind' = 'beta_request_received' AND m->>'to' = 'tester@example.test'), 1::bigint,
  'requester gets a confirmation');
SELECT is((SELECT array_agg(m->>'to' ORDER BY m->>'to') FROM sent WHERE m->>'kind' = 'beta_request_admin'),
  (SELECT emails FROM admins), 'every admin gets an alert');
SELECT is((SELECT m->'data'->>'full_name' || '|' || (m->'data'->>'email') || '|' || (m->'data'->>'photos_per_event')
           FROM sent WHERE m->>'kind' = 'beta_request_admin' LIMIT 1),
  'Ana Cruz|tester@example.test|500-2000', 'admin alert carries the request details');

SELECT request_blur_beta('Ana Cruz', 'Trail races', 'under-500', NULL);
SELECT is((SELECT count(*) FROM sent), 1 + (SELECT cardinality(emails) FROM admins)::bigint, 'updating a request sends no more emails');

-- ── Sending the key ─────────────────────────────────────────────────────────
SELECT throws_ok($$SELECT send_blur_beta_key('00000000-0000-0000-0000-000000000201', 'KEY-123')$$,
  '42501', NULL, 'a non-admin cannot send a key');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000203', true);
SELECT throws_ok($$SELECT send_blur_beta_key('00000000-0000-0000-0000-000000000201', 'has space')$$,
  '22023', NULL, 'a key with a space is rejected');
SELECT throws_ok($$SELECT send_blur_beta_key('00000000-0000-0000-0000-000000000201', '')$$,
  '22023', NULL, 'an empty key is rejected');
SELECT throws_ok($$SELECT send_blur_beta_key('00000000-0000-0000-0000-000000000201', repeat('k', 1025))$$,
  '22023', NULL, 'a key over 1024 characters is rejected');
SELECT throws_ok($$SELECT send_blur_beta_key('00000000-0000-0000-0000-000000000205', 'KEY-123')$$,
  'P0002', NULL, 'no key for someone who never asked');
SELECT is((SELECT count(*) FROM sent WHERE m->>'kind' = 'beta_key'), 0::bigint, 'rejected sends email nothing');

SELECT is(send_blur_beta_key('00000000-0000-0000-0000-000000000201', 'KEY-123')->>'ok', 'true', 'admin sends a key');
SELECT is((SELECT m->'data'->>'key' FROM sent WHERE m->>'kind' = 'beta_key' AND m->>'to' = 'tester@example.test'),
  'KEY-123', 'the key is emailed to the requester');
SELECT ok((SELECT key_sent_at IS NOT NULL FROM public.blur_beta_requests WHERE user_id = '00000000-0000-0000-0000-000000000201'),
  'the request is marked as sent');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok($$SELECT send_blur_beta_key('00000000-0000-0000-0000-000000000201', 'KEY-123')$$,
  '42501', NULL, 'anonymous cannot send a key');

SELECT * FROM finish();
ROLLBACK;
