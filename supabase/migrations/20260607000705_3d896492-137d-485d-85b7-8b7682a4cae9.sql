
-- 1. referral_codes: remove public read, restrict to owner
DROP POLICY IF EXISTS "ref codes anyone read" ON public.referral_codes;
REVOKE SELECT ON public.referral_codes FROM anon;

CREATE POLICY "ref codes owner read"
  ON public.referral_codes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2. profiles: add explicit WITH CHECK on user self-update
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 3. audit_log: tighten insert policy + add content length limits
DROP POLICY IF EXISTS "audit_log insert own" ON public.audit_log;
CREATE POLICY "audit_log insert own"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND performed_by = auth.uid()
    AND char_length(action) <= 80
    AND (details IS NULL OR char_length(details) <= 1000)
  );

-- 4. Remove sensitive tables from Realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.user_roles;
ALTER PUBLICATION supabase_realtime DROP TABLE public.feedback_messages;
ALTER PUBLICATION supabase_realtime DROP TABLE public.ad_applications;
