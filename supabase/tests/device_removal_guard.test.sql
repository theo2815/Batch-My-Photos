BEGIN;
SELECT plan(12);

-- A has no subscriptions row (like every new account); B has one with a removal window.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password)
VALUES ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'norow@example.test', 'test'),
       ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'withrow@example.test', 'test');
INSERT INTO public.subscriptions (user_id, plan, status, device_removals_limit, device_removals_reset_at)
VALUES ('00000000-0000-0000-0000-000000000302', 'pro', 'active', 3, now() + interval '10 days');
INSERT INTO public.device_bindings (id, user_id, hwid_hash, device_label)
VALUES ('00000000-0000-0000-0000-000000000311', '00000000-0000-0000-0000-000000000301', 'norow-device-000001', 'A1'),
       ('00000000-0000-0000-0000-000000000312', '00000000-0000-0000-0000-000000000301', 'norow-device-000002', 'A2'),
       ('00000000-0000-0000-0000-000000000313', '00000000-0000-0000-0000-000000000301', 'norow-device-000003', 'A3'),
       ('00000000-0000-0000-0000-000000000314', '00000000-0000-0000-0000-000000000301', 'norow-device-000004', 'A4'),
       ('00000000-0000-0000-0000-000000000321', '00000000-0000-0000-0000-000000000302', 'withrow-device-0001', 'B1'),
       ('00000000-0000-0000-0000-000000000322', '00000000-0000-0000-0000-000000000302', 'withrow-device-0002', 'B2');
-- A's 31-day-old removals have rolled out. B's 25-day-old ones are inside a rolling
-- 30 days but before B's stored period began (now() - 20 days), so they do not count.
INSERT INTO public.device_removals (user_id, removed_hwid, removed_at)
SELECT u, 'old-removal-' || u || i, now() - d
FROM (VALUES ('00000000-0000-0000-0000-000000000301'::uuid, interval '31 days'),
             ('00000000-0000-0000-0000-000000000302'::uuid, interval '25 days')) AS v(u, d),
     generate_series(1, 3) AS i;

-- ── No subscriptions row: 3 removals per rolling 30 days ────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
SELECT is((remove_device('00000000-0000-0000-0000-000000000311')->>'success')::boolean, true, 'row-less account removes device 1');
SELECT is((remove_device('00000000-0000-0000-0000-000000000312')->>'success')::boolean, true, 'row-less account removes device 2');
SELECT is((remove_device('00000000-0000-0000-0000-000000000313')->>'success')::boolean, true, 'row-less account removes device 3');
SELECT is(remove_device('00000000-0000-0000-0000-000000000314')->>'code', 'REMOVAL_LIMIT_REACHED', 'row-less account cannot remove a 4th device in 30 days');
SELECT ok(remove_device('00000000-0000-0000-0000-000000000314')->>'removals_reset_at' IS NOT NULL, 'the refusal says when a removal frees up');
SELECT is((list_my_devices()->>'removals_used')::int, 3, 'device list shows 3 removals used');
SELECT is((list_my_devices()->>'removals_limit')::int, 3, 'device list shows a limit of 3');
SELECT ok(list_my_devices()->>'removals_reset_at' IS NOT NULL, 'device list shows when a removal frees up');
SELECT ok(list_my_devices()->>'cooldown_ends_at' IS NOT NULL, 'device list shows the 24-hour cooldown');

-- Last for A: before the fix this DELETE succeeds and would empty A's devices.
SELECT throws_ok($$DELETE FROM public.device_bindings WHERE user_id = '00000000-0000-0000-0000-000000000301'$$, '42501', NULL, 'users cannot delete device rows directly');

-- ── With a subscriptions row: the stored window is kept ─────────────────────
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000302', true);
SELECT is((remove_device('00000000-0000-0000-0000-000000000321')->>'success')::boolean, true, 'account with a row removes a device');
SELECT is((list_my_devices()->>'removals_reset_at')::timestamptz, now() + interval '10 days', 'account with a row keeps its stored reset date');

SELECT * FROM finish();
ROLLBACK;
