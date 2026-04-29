-- ============ ROLES ============
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('super_admin', 'business_owner', 'staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Super admins manage roles" ON public.user_roles;
CREATE POLICY "Super admins manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Backfill business_owner role for existing users
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'business_owner'::public.app_role FROM auth.users
ON CONFLICT (user_id, role) DO NOTHING;

-- Promote existing admin if present
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::public.app_role FROM auth.users WHERE email = 'admin@sikaflow.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Update handle_new_user trigger to also assign roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, trial_start_date, trial_end_date)
  VALUES (NEW.id, NEW.email, now(), now() + INTERVAL '30 days')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'business_owner')
  ON CONFLICT (user_id, role) DO NOTHING;

  IF NEW.email = 'admin@sikaflow.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure the trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ CUSTOMERS ============
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers select own" ON public.customers;
CREATE POLICY "customers select own" ON public.customers FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "customers insert own" ON public.customers;
CREATE POLICY "customers insert own" ON public.customers FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "customers update own" ON public.customers;
CREATE POLICY "customers update own" ON public.customers FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "customers delete own" ON public.customers;
CREATE POLICY "customers delete own" ON public.customers FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS customers_updated_at ON public.customers;
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Optional link from sales to customer
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer_id uuid;

-- ============ OTHER INCOME ============
CREATE TABLE IF NOT EXISTS public.other_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  note text,
  income_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.other_income ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "other_income select own" ON public.other_income;
CREATE POLICY "other_income select own" ON public.other_income FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "other_income insert own" ON public.other_income;
CREATE POLICY "other_income insert own" ON public.other_income FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "other_income update own" ON public.other_income;
CREATE POLICY "other_income update own" ON public.other_income FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "other_income delete own" ON public.other_income;
CREATE POLICY "other_income delete own" ON public.other_income FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS other_income_updated_at ON public.other_income;
CREATE TRIGGER other_income_updated_at BEFORE UPDATE ON public.other_income
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ANNOUNCEMENTS ============
DO $$ BEGIN
  CREATE TYPE public.announcement_audience AS ENUM ('all', 'trial', 'active', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.announcement_priority AS ENUM ('low', 'normal', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  audience public.announcement_audience NOT NULL DEFAULT 'all',
  priority public.announcement_priority NOT NULL DEFAULT 'normal',
  publish_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements readable by signed in users" ON public.announcements;
CREATE POLICY "announcements readable by signed in users" ON public.announcements
  FOR SELECT USING (auth.uid() IS NOT NULL AND publish_at <= now());

DROP POLICY IF EXISTS "announcements managed by super admin" ON public.announcements;
CREATE POLICY "announcements managed by super admin" ON public.announcements
  FOR ALL USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP TRIGGER IF EXISTS announcements_updated_at ON public.announcements;
CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();