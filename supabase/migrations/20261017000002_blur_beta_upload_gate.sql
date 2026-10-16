-- ============================================================================
-- Blur-beta upload gate (security audit C-04)
-- ============================================================================
-- The example uploads were meant for invited testers, but the insert policies
-- asked only for "signed in" and "your own folder", so any account could fill
-- the operator-paid bucket. Both inserts now also need a sent beta key
-- (blur_beta_requests.key_sent_at) and stop at 500 examples per user. The app
-- uploads the object first, then the metadata row, so each table is counted
-- on its own. Read and delete policies are unchanged: deleting makes room.
-- A policy cannot count its own table (Postgres reports infinite recursion),
-- so the Storage count goes through a SECURITY DEFINER function that returns
-- only the caller's own number. The metadata table is reachable over REST,
-- where one JSON array is one multi-row INSERT that a policy counts only once,
-- so its cap is a statement-level trigger that sees the statement's rows.
-- ============================================================================

CREATE OR REPLACE FUNCTION _blur_beta_feedback_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.blur_beta_feedback WHERE user_id = auth.uid()) > 500 THEN
    RAISE EXCEPTION 'blur beta example limit reached' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER blur_beta_feedback_cap
  AFTER INSERT ON public.blur_beta_feedback
  FOR EACH STATEMENT EXECUTE FUNCTION _blur_beta_feedback_cap();

CREATE OR REPLACE FUNCTION _my_blur_beta_object_count()
RETURNS bigint
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*) FROM storage.objects
  WHERE bucket_id = 'blur-beta-feedback' AND owner_id = auth.uid()::text;
$$;

REVOKE EXECUTE ON FUNCTION _my_blur_beta_object_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION _my_blur_beta_object_count() TO authenticated, service_role;

ALTER POLICY blur_beta_owner_insert ON public.blur_beta_feedback
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (storage.foldername(object_name))[1] = (SELECT auth.uid()::text)
    AND EXISTS (SELECT 1 FROM public.blur_beta_requests r
                WHERE r.user_id = (SELECT auth.uid()) AND r.key_sent_at IS NOT NULL)
  );

ALTER POLICY blur_beta_object_insert ON storage.objects
  WITH CHECK (
    bucket_id = 'blur-beta-feedback'
    AND owner_id = (SELECT auth.uid()::text)
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
    AND EXISTS (SELECT 1 FROM public.blur_beta_requests r
                WHERE r.user_id = (SELECT auth.uid()) AND r.key_sent_at IS NOT NULL)
    AND (SELECT public._my_blur_beta_object_count()) < 500
  );
