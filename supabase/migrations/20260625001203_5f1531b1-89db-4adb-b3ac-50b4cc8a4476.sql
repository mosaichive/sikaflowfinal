-- 1. Add activity tracking columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS login_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_last_activity_at ON public.profiles (last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_last_login_at ON public.profiles (last_login_at DESC);

-- 2. Throttled activity touch (any authenticated user, only writes once per ~5 min)
CREATE OR REPLACE FUNCTION public.touch_user_activity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  prev timestamptz;
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  SELECT last_activity_at INTO prev FROM public.profiles WHERE id = uid;

  IF prev IS NULL OR prev < now() - interval '5 minutes' THEN
    UPDATE public.profiles
       SET last_activity_at = now()
     WHERE id = uid;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_user_activity() TO authenticated;

-- 3. Login stamp (called once on each sign-in)
CREATE OR REPLACE FUNCTION public.record_user_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
     SET last_login_at = now(),
         last_activity_at = now(),
         login_count = COALESCE(login_count, 0) + 1
   WHERE id = uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_user_login() TO authenticated;

-- 4. Super admin read-only activity report
CREATE OR REPLACE FUNCTION public.admin_user_activity()
RETURNS TABLE (
  id uuid,
  email text,
  display_name text,
  business_name text,
  phone text,
  role text,
  subscription_plan text,
  subscription_status text,
  suspended boolean,
  created_at timestamptz,
  last_login_at timestamptz,
  last_activity_at timestamptz,
  login_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.email,
         p.display_name,
         p.business_name,
         p.phone,
         p.role,
         p.subscription_plan::text,
         p.subscription_status::text,
         p.suspended,
         p.created_at,
         p.last_login_at,
         p.last_activity_at,
         p.login_count
    FROM public.profiles p
   ORDER BY p.last_activity_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_user_activity() TO authenticated;