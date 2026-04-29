-- Subscription plan enum and profile fields
DO $$ BEGIN
  CREATE TYPE public.subscription_plan AS ENUM ('trial', 'monthly', 'annual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('trial', 'active', 'expired', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_plan public.subscription_plan NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_status public.subscription_status NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_start_date timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;

-- Super admin can view & update all profiles (for user management)
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.profiles;
CREATE POLICY "Super admins can view all profiles"
ON public.profiles FOR SELECT
USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Super admins can update all profiles" ON public.profiles;
CREATE POLICY "Super admins can update all profiles"
ON public.profiles FOR UPDATE
USING (public.has_role(auth.uid(), 'super_admin'));

-- Payment methods configured by super admin, visible to all signed-in users
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL, -- 'bank' | 'momo' | 'note'
  label text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_methods readable by signed-in" ON public.payment_methods;
CREATE POLICY "payment_methods readable by signed-in"
ON public.payment_methods FOR SELECT
USING (auth.uid() IS NOT NULL AND active = true);

DROP POLICY IF EXISTS "payment_methods managed by super admin" ON public.payment_methods;
CREATE POLICY "payment_methods managed by super admin"
ON public.payment_methods FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_payment_methods_updated
BEFORE UPDATE ON public.payment_methods
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Subscription payment requests (users submit, admin approves)
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan public.subscription_plan NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL,
  reference text,
  note text,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sub_payments user view own"
ON public.subscription_payments FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "sub_payments user insert own"
ON public.subscription_payments FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sub_payments admin update"
ON public.subscription_payments FOR UPDATE
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_sub_payments_updated
BEFORE UPDATE ON public.subscription_payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add target_user_id to announcements for specific-user targeting
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS target_user_id uuid,
  ADD COLUMN IF NOT EXISTS target_plan public.subscription_plan;

-- Replace announcement read policy to respect targeting
DROP POLICY IF EXISTS "announcements readable by signed in users" ON public.announcements;
CREATE POLICY "announcements readable by audience"
ON public.announcements FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND publish_at <= now()
  AND (
    (target_user_id IS NULL AND target_plan IS NULL)
    OR target_user_id = auth.uid()
    OR target_plan IN (
      SELECT subscription_plan FROM public.profiles WHERE id = auth.uid()
    )
  )
);

-- Platform stats view for super admin (counts only, no business data)
CREATE OR REPLACE FUNCTION public.admin_platform_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'total_users', (SELECT count(*) FROM public.profiles),
    'trial_users', (SELECT count(*) FROM public.profiles WHERE subscription_status = 'trial'),
    'active_users', (SELECT count(*) FROM public.profiles WHERE subscription_status = 'active'),
    'expired_users', (SELECT count(*) FROM public.profiles WHERE subscription_status = 'expired'),
    'suspended_users', (SELECT count(*) FROM public.profiles WHERE suspended = true),
    'monthly_subs', (SELECT count(*) FROM public.profiles WHERE subscription_plan = 'monthly' AND subscription_status = 'active'),
    'annual_subs', (SELECT count(*) FROM public.profiles WHERE subscription_plan = 'annual' AND subscription_status = 'active'),
    'pending_payments', (SELECT count(*) FROM public.subscription_payments WHERE status = 'pending'),
    'signups_last_30d', (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '30 days')
  ) INTO result;

  RETURN result;
END;
$$;