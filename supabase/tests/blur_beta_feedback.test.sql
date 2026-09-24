BEGIN;
SELECT plan(32);
SELECT has_table('public', 'blur_beta_feedback', 'feedback table exists');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.blur_beta_feedback')), 'feedback RLS enabled');
SELECT is((SELECT public FROM storage.buckets WHERE id = 'blur-beta-feedback'), false, 'feedback bucket is private');
SELECT is((SELECT file_size_limit FROM storage.buckets WHERE id = 'blur-beta-feedback'), 2097152::bigint, 'JPEG upload limit is 2 MB');
SELECT is((SELECT allowed_mime_types FROM storage.buckets WHERE id = 'blur-beta-feedback'), ARRAY['image/jpeg'], 'only JPEG uploads allowed');

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password)
VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'beta-a@example.test', 'test'),
       ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'beta-b@example.test', 'test');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
SELECT lives_ok($$INSERT INTO public.blur_beta_feedback (object_name, predicted_class, score, human_label, beta_version, source_environment)
  VALUES ('00000000-0000-0000-0000-000000000011/example.jpg', 'sharp', 0.1, 'blurry', 'beta.1', 'staging')$$, 'owner inserts feedback with JWT default');
SELECT is((SELECT user_id::text FROM public.blur_beta_feedback), '00000000-0000-0000-0000-000000000011', 'JWT determines metadata owner');
SELECT throws_ok($$INSERT INTO public.blur_beta_feedback (user_id, object_name, predicted_class, score, human_label, beta_version, source_environment)
  VALUES ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000011/forged.jpg', 'sharp', 0.1, 'blurry', 'beta.1', 'staging')$$, '42501', NULL, 'cannot forge metadata owner');
SELECT throws_ok($$INSERT INTO public.blur_beta_feedback (object_name, predicted_class, score, human_label, beta_version, source_environment)
  VALUES ('00000000-0000-0000-0000-000000000022/foreign.jpg', 'sharp', 0.1, 'blurry', 'beta.1', 'staging')$$, '42501', NULL, 'cannot insert metadata in another user folder');
SELECT throws_ok($$INSERT INTO public.blur_beta_feedback (object_name, predicted_class, score, human_label, beta_version, source_environment)
  VALUES ('root.jpg', 'sharp', 0.1, 'blurry', 'beta.1', 'staging')$$, '42501', NULL, 'metadata requires a user folder');
SELECT throws_ok($$INSERT INTO public.blur_beta_feedback (object_name, predicted_class, score, human_label, beta_version, source_environment)
  VALUES ('00000000-0000-0000-0000-000000000011/example.jpg', 'sharp', 0.1, 'blurry', 'beta.1', 'staging')$$, '23505', NULL, 'object name cannot link duplicate feedback');
SELECT throws_ok($$INSERT INTO public.blur_beta_feedback (object_name, predicted_class, score, human_label, beta_version, source_environment)
  VALUES ('00000000-0000-0000-0000-000000000011/invalid.jpg', 'unknown', 0.1, 'blurry', 'beta.1', 'staging')$$, '23514', NULL, 'reject invalid prediction');
SELECT throws_ok($$INSERT INTO public.blur_beta_feedback (object_name, predicted_class, score, human_label, beta_version, source_environment)
  VALUES ('00000000-0000-0000-0000-000000000011/invalid.jpg', 'sharp', 0.1, 'unknown', 'beta.1', 'staging')$$, '23514', NULL, 'reject invalid human label');
SELECT throws_ok($$INSERT INTO public.blur_beta_feedback (object_name, predicted_class, score, human_label, beta_version, source_environment)
  VALUES ('00000000-0000-0000-0000-000000000011/invalid.jpg', 'sharp', -0.1, 'blurry', 'beta.1', 'staging')$$, '23514', NULL, 'reject negative score');
SELECT throws_ok($$INSERT INTO public.blur_beta_feedback (object_name, predicted_class, score, human_label, beta_version, source_environment)
  VALUES ('00000000-0000-0000-0000-000000000011/invalid.jpg', 'sharp', 1.1, 'blurry', 'beta.1', 'staging')$$, '23514', NULL, 'reject score above one');
SELECT throws_ok($$INSERT INTO public.blur_beta_feedback (object_name, predicted_class, score, human_label, beta_version, source_environment)
  VALUES ('00000000-0000-0000-0000-000000000011/invalid.jpg', 'sharp', 'NaN', 'blurry', 'beta.1', 'staging')$$, '23514', NULL, 'reject nonfinite score');
SELECT throws_ok($$INSERT INTO public.blur_beta_feedback (object_name, predicted_class, score, human_label, beta_version, source_environment)
  VALUES ('00000000-0000-0000-0000-000000000011/invalid.jpg', 'sharp', 0.1, 'blurry', 'beta.1', 'production')$$, '23514', NULL, 'reject non-staging feedback');

-- Storage API integration verifies bytes and deletion; transactional rows here test JWT policies only.
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner_id)
  VALUES ('blur-beta-feedback', '00000000-0000-0000-0000-000000000011/example.jpg', '00000000-0000-0000-0000-000000000011')$$, 'owner inserts Storage object');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner_id)
  VALUES ('blur-beta-feedback', '00000000-0000-0000-0000-000000000011/forged.jpg', '00000000-0000-0000-0000-000000000022')$$, '42501', NULL, 'cannot forge Storage owner');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner_id)
  VALUES ('blur-beta-feedback', '00000000-0000-0000-0000-000000000022/foreign.jpg', '00000000-0000-0000-0000-000000000011')$$, '42501', NULL, 'cannot upload outside own folder');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner_id)
  VALUES ('blur-beta-feedback', 'root.jpg', '00000000-0000-0000-0000-000000000011')$$, '42501', NULL, 'Storage requires a user folder');
SELECT is((SELECT count(*) FROM storage.objects WHERE bucket_id = 'blur-beta-feedback'), 1::bigint, 'owner reads own Storage object');
WITH changed AS (UPDATE public.blur_beta_feedback SET human_label = 'sharp' RETURNING id) SELECT is((SELECT count(*) FROM changed), 0::bigint, 'feedback cannot be updated');
WITH changed AS (UPDATE storage.objects SET name = 'changed.jpg' WHERE bucket_id = 'blur-beta-feedback' RETURNING id) SELECT is((SELECT count(*) FROM changed), 0::bigint, 'Storage objects cannot be overwritten');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000022', true);
SELECT is((SELECT count(*) FROM public.blur_beta_feedback), 0::bigint, 'second user cannot read feedback');
SELECT is((SELECT count(*) FROM storage.objects WHERE bucket_id = 'blur-beta-feedback'), 0::bigint, 'second user cannot read objects');
DELETE FROM public.blur_beta_feedback;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
SELECT is((SELECT count(*) FROM public.blur_beta_feedback), 1::bigint, 'second user could not delete feedback');

RESET ROLE;
INSERT INTO public.admin_users (user_id) VALUES ('00000000-0000-0000-0000-000000000022');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000022', true);
SELECT is((SELECT count(*) FROM public.blur_beta_feedback), 1::bigint, 'admin reviews feedback');
SELECT is((SELECT count(*) FROM storage.objects WHERE bucket_id = 'blur-beta-feedback'), 1::bigint, 'admin reviews private objects');
WITH removed AS (DELETE FROM public.blur_beta_feedback RETURNING id) SELECT is((SELECT count(*) FROM removed), 0::bigint, 'admin review does not grant deletion');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
WITH removed AS (DELETE FROM public.blur_beta_feedback RETURNING id) SELECT is((SELECT count(*) FROM removed), 1::bigint, 'owner deletes own feedback');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is((SELECT count(*) FROM storage.objects WHERE bucket_id = 'blur-beta-feedback'), 0::bigint, 'anonymous cannot read private objects');
SELECT * FROM finish();
ROLLBACK;
