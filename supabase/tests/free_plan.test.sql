BEGIN;
SELECT plan(33);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password)
VALUES ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'free@example.test', 'test'),
       ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'trial@example.test', 'test'),
       ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa@example.test', 'test'),
       ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.test', 'test');
INSERT INTO public.subscriptions (user_id, plan, status, expires_at, device_limit)
VALUES ('00000000-0000-0000-0000-000000000102', 'pro', 'active', now() - interval '1 day', 2),
       ('00000000-0000-0000-0000-000000000103', 'pro_plus', 'active', NULL, 999999);
INSERT INTO public.admin_users (user_id) VALUES ('00000000-0000-0000-0000-000000000104');

-- ── Everything is free: every account gets the old Pro behaviour ────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SELECT is((check_batch_limit()->>'is_pro')::boolean, true, 'account without a plan row can batch offline');
SELECT is(check_batch_limit()->'expires_at', 'null'::jsonb, 'no expiry date is sent');
SELECT is(get_my_subscription()->>'plan' || '/' || (get_my_subscription()->>'status'), 'pro/active', 'old apps see an active Pro plan (no Upgrade button)');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
SELECT is((check_batch_limit()->>'is_pro')::boolean, true, 'expired trial can still batch offline');
SELECT is(check_batch_limit()->'expires_at', 'null'::jsonb, 'expired trial gets no expiry date');
SELECT is((check_batch_limit()->>'subscription_expired')::boolean, false, 'expired trial is not told to renew');
SELECT is((check_batch_limit()->>'can_execute')::boolean, true, 'batches stay unlimited');
SELECT is(get_my_subscription()->>'plan' || '/' || (get_my_subscription()->>'status'), 'pro/active', 'expired trial is shown as active Pro');
SELECT ok(get_my_subscription()->>'expires_at' IS NULL, 'expired trial is shown no expiry date');

-- ── Device cap: at least 3 for everyone, higher limits kept ─────────────────
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SELECT is((bind_device('free-device-0000001', 'One')->>'bound')::boolean, true, 'free account binds device 1');
SELECT is((bind_device('free-device-0000002', 'Two')->>'bound')::boolean, true, 'free account binds device 2');
SELECT is((bind_device('free-device-0000003', 'Three')->>'device_limit')::int, 3, 'free account binds device 3 under a cap of 3');
SELECT is(bind_device('free-device-0000004', 'Four')->>'code', 'DEVICE_LIMIT_REACHED', 'free account cannot bind a 4th device');
SELECT is((bind_device('free-device-0000001', 'One')->>'existing')::boolean, true, 'a bound device rebinds');
SELECT is((list_my_devices()->>'device_limit')::int, 3, 'device list shows a cap of 3');
SELECT is((device_heartbeat('free-device-0000003')->>'ok')::boolean, true, 'third device heartbeat is accepted');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
SELECT is((list_my_devices()->>'device_limit')::int, 3, 'expired trial with a stored 2 is raised to 3');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
SELECT is((list_my_devices()->>'device_limit')::int, 999999, 'QA account keeps its higher limit');

-- ── Paid paths are closed ───────────────────────────────────────────────────
RESET ROLE;
SELECT ok(NOT has_function_privilege('authenticated', 'public.start_free_trial(text)', 'EXECUTE'), 'no new free trials');
SELECT ok(NOT has_function_privilege('authenticated', 'public.validate_coupon(text)', 'EXECUTE'), 'no coupon checks');
SELECT ok(NOT has_function_privilege('authenticated', 'public.cancel_my_subscription()', 'EXECUTE'), 'no cancel (its email promises a paid plan)');
SELECT is((SELECT count(*) FROM cron.job WHERE jobname = 'expiry-reminders'), 0::bigint, 'no more expiry reminder emails');

-- ── Blur beta request form ──────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SELECT is(request_blur_beta('  Ana Cruz ', 'Marathons', '500-2000', 'Too many photos')->>'ok', 'true', 'user sends a request');
SELECT is((SELECT email || '|' || full_name FROM public.blur_beta_requests), 'free@example.test|Ana Cruz', 'email comes from the account, name is trimmed');
SELECT is(request_blur_beta('Ana Cruz', 'Trail races', 'under-500', NULL)->>'ok', 'true', 'user updates their request');
SELECT is((SELECT count(*) FROM public.blur_beta_requests), 1::bigint, 'one request per account');
SELECT throws_ok($$SELECT request_blur_beta('Ana', 'Marathons', 'lots', NULL)$$, '23514', NULL, 'unknown photo volume is rejected');
SELECT throws_ok($$SELECT request_blur_beta('', 'Marathons', 'under-500', NULL)$$, '23514', NULL, 'name is required');
WITH own AS (UPDATE public.blur_beta_requests SET key_sent_at = now() RETURNING 1)
SELECT is((SELECT count(*) FROM own), 0::bigint, 'user cannot mark their own key as sent');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
SELECT is((SELECT count(*) FROM public.blur_beta_requests), 0::bigint, 'user cannot read another request');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000104', true);
SELECT is((SELECT count(*) FROM public.blur_beta_requests WHERE user_id = '00000000-0000-0000-0000-000000000101'), 1::bigint, 'admin reads another user''s request');
WITH sent AS (UPDATE public.blur_beta_requests SET key_sent_at = now() WHERE user_id = '00000000-0000-0000-0000-000000000101' RETURNING 1)
SELECT is((SELECT count(*) FROM sent), 1::bigint, 'admin marks a key as sent');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok($$SELECT request_blur_beta('A', 'B', 'under-500', NULL)$$, '42501', NULL, 'anonymous cannot send a request');

SELECT * FROM finish();
ROLLBACK;
