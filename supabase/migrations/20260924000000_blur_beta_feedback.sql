-- Private, explicitly submitted examples for the invited blur staging beta.
CREATE TABLE public.blur_beta_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  object_name TEXT NOT NULL UNIQUE,
  predicted_class TEXT NOT NULL CHECK (predicted_class IN ('sharp', 'defocused_blurred', 'defocused_object_portrait', 'motion_blurred')),
  score DOUBLE PRECISION NOT NULL CHECK (score BETWEEN 0 AND 1),
  human_label TEXT NOT NULL CHECK (human_label IN ('sharp', 'blurry')),
  beta_version TEXT NOT NULL CHECK (length(trim(beta_version)) > 0),
  source_environment TEXT NOT NULL CHECK (source_environment = 'staging'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.blur_beta_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY blur_beta_owner_insert ON public.blur_beta_feedback
  FOR INSERT TO authenticated WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (storage.foldername(object_name))[1] = (SELECT auth.uid()::text)
  );
CREATE POLICY blur_beta_owner_read ON public.blur_beta_feedback
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY blur_beta_owner_delete ON public.blur_beta_feedback
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY blur_beta_admin_read ON public.blur_beta_feedback
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('blur-beta-feedback', 'blur-beta-feedback', false, 2097152, ARRAY['image/jpeg']);

CREATE POLICY blur_beta_object_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'blur-beta-feedback'
    AND owner_id = (SELECT auth.uid()::text)
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );
CREATE POLICY blur_beta_object_read ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'blur-beta-feedback' AND owner_id = (SELECT auth.uid()::text)
  );
CREATE POLICY blur_beta_object_delete ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'blur-beta-feedback' AND owner_id = (SELECT auth.uid()::text)
  );
CREATE POLICY blur_beta_object_admin_read ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'blur-beta-feedback' AND (SELECT public.is_admin())
  );
