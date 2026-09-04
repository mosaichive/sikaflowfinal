-- Reconcile the platform-admin schema without replacing existing tenant records.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'subscription_plan'
  ) THEN
    CREATE TYPE public.subscription_plan AS ENUM (
      'trial', 'monthly', 'annual', 'lifetime', 'starter', 'business', 'business_plus'
    );
  END IF;
END
$$;

ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'trial';
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'monthly';
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'annual';
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'lifetime';
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'starter';
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'business';
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'business_plus';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'subscription_status'
  ) THEN
    CREATE TYPE public.subscription_status AS ENUM (
      'trial', 'active', 'expired', 'suspended', 'lifetime'
    );
  END IF;
END
$$;

ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'trial';
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'active';
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'suspended';
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'lifetime';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS subscription_plan public.subscription_plan NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_status public.subscription_status NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_start_date timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS trial_start_date timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS trial_end_date timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS login_count integer NOT NULL DEFAULT 0;

-- Populate only the newly introduced subscription mirrors from canonical rows.
UPDATE public.profiles AS p
SET subscription_plan = CASE s.plan
      WHEN 'monthly' THEN 'monthly'::public.subscription_plan
      WHEN 'annual' THEN 'annual'::public.subscription_plan
      WHEN 'lifetime' THEN 'lifetime'::public.subscription_plan
      WHEN 'starter' THEN 'starter'::public.subscription_plan
      WHEN 'business' THEN 'business'::public.subscription_plan
      WHEN 'business_plus' THEN 'business_plus'::public.subscription_plan
      ELSE 'trial'::public.subscription_plan
    END,
    subscription_status = CASE s.status
      WHEN 'active' THEN 'active'::public.subscription_status
      WHEN 'suspended' THEN 'suspended'::public.subscription_status
      WHEN 'lifetime' THEN 'lifetime'::public.subscription_status
      WHEN 'expired' THEN 'expired'::public.subscription_status
      WHEN 'overdue' THEN 'expired'::public.subscription_status
      WHEN 'canceled' THEN 'expired'::public.subscription_status
      ELSE 'trial'::public.subscription_status
    END,
    subscription_start_date = COALESCE(s.current_period_start, s.trial_start_date),
    subscription_end_date = COALESCE(s.current_period_end, s.trial_end_date),
    trial_start_date = COALESCE(s.trial_start_date, p.trial_start_date),
    trial_end_date = COALESCE(s.trial_end_date, p.trial_end_date)
FROM public.subscriptions AS s
WHERE s.business_id = p.business_id;

UPDATE public.profiles AS p
SET role = ranked.role::text
FROM (
  SELECT DISTINCT ON (ur.user_id) ur.user_id, ur.role
  FROM public.user_roles AS ur
  ORDER BY ur.user_id,
    CASE ur.role::text
      WHEN 'super_admin' THEN 0
      WHEN 'admin' THEN 1
      WHEN 'manager' THEN 2
      ELSE 3
    END
) AS ranked
WHERE ranked.user_id = p.user_id
  AND p.role IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_last_activity_at
  ON public.profiles (last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_last_login_at
  ON public.profiles (last_login_at DESC);

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan public.subscription_plan NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reference text,
  note text,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paystack_reference text,
  network text,
  amount_paid numeric,
  provider_response jsonb,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.subscription_payments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.subscription_payments TO authenticated;
GRANT ALL ON TABLE public.subscription_payments TO service_role;

DROP POLICY IF EXISTS "Users read own or super admins read payments" ON public.subscription_payments;
CREATE POLICY "Users read own or super admins read payments"
  ON public.subscription_payments FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'super_admin'));

DROP POLICY IF EXISTS "Users submit pending payments" ON public.subscription_payments;
CREATE POLICY "Users submit pending payments"
  ON public.subscription_payments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status = 'pending'
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
  );

DROP POLICY IF EXISTS "Super admins update payments" ON public.subscription_payments;
CREATE POLICY "Super admins update payments"
  ON public.subscription_payments FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'super_admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_sub_payments_paystack_ref
  ON public.subscription_payments (paystack_reference);
CREATE INDEX IF NOT EXISTS idx_sub_payments_user_status
  ON public.subscription_payments (user_id, status);
DROP TRIGGER IF EXISTS subscription_payments_set_updated_at ON public.subscription_payments;
CREATE TRIGGER subscription_payments_set_updated_at
  BEFORE UPDATE ON public.subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.feedback_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL DEFAULT '',
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  CONSTRAINT feedback_messages_status_check CHECK (status IN ('new', 'in_progress', 'resolved'))
);

ALTER TABLE public.feedback_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.feedback_messages FROM anon, authenticated;
GRANT INSERT ON TABLE public.feedback_messages TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON TABLE public.feedback_messages TO authenticated;
GRANT ALL ON TABLE public.feedback_messages TO service_role;

DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.feedback_messages;
CREATE POLICY "Anyone can submit feedback"
  ON public.feedback_messages FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'new' AND resolved_by IS NULL AND resolved_at IS NULL);
DROP POLICY IF EXISTS "Super admins read feedback" ON public.feedback_messages;
CREATE POLICY "Super admins read feedback"
  ON public.feedback_messages FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'super_admin'));
DROP POLICY IF EXISTS "Super admins update feedback" ON public.feedback_messages;
CREATE POLICY "Super admins update feedback"
  ON public.feedback_messages FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'super_admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'super_admin'));
DROP POLICY IF EXISTS "Super admins delete feedback" ON public.feedback_messages;
CREATE POLICY "Super admins delete feedback"
  ON public.feedback_messages FOR DELETE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'super_admin'));

CREATE TABLE IF NOT EXISTS public.ad_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text,
  business_type text,
  ad_goal text,
  budget text,
  message text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  CONSTRAINT ad_applications_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'contacted'))
);

ALTER TABLE public.ad_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ad_applications FROM anon, authenticated;
GRANT INSERT ON TABLE public.ad_applications TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON TABLE public.ad_applications TO authenticated;
GRANT ALL ON TABLE public.ad_applications TO service_role;

DROP POLICY IF EXISTS "Anyone can submit ad application" ON public.ad_applications;
CREATE POLICY "Anyone can submit ad application"
  ON public.ad_applications FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL);
DROP POLICY IF EXISTS "Super admins read ad applications" ON public.ad_applications;
CREATE POLICY "Super admins read ad applications"
  ON public.ad_applications FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'super_admin'));
DROP POLICY IF EXISTS "Super admins update ad applications" ON public.ad_applications;
CREATE POLICY "Super admins update ad applications"
  ON public.ad_applications FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'super_admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'super_admin'));
DROP POLICY IF EXISTS "Super admins delete ad applications" ON public.ad_applications;
CREATE POLICY "Super admins delete ad applications"
  ON public.ad_applications FOR DELETE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'super_admin'));

CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_monthly numeric NOT NULL DEFAULT 0,
  price_annual numeric NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  cta_label text NOT NULL DEFAULT 'Get Started',
  is_popular boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pricing_plans FROM anon, authenticated;
GRANT SELECT ON TABLE public.pricing_plans TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.pricing_plans TO authenticated;
GRANT ALL ON TABLE public.pricing_plans TO service_role;

DROP POLICY IF EXISTS "Anyone can read active pricing plans" ON public.pricing_plans;
CREATE POLICY "Anyone can read active pricing plans"
  ON public.pricing_plans FOR SELECT TO anon, authenticated
  USING (is_active OR public.has_role((SELECT auth.uid()), 'super_admin'));
DROP POLICY IF EXISTS "Super admins manage pricing plans" ON public.pricing_plans;
CREATE POLICY "Super admins manage pricing plans"
  ON public.pricing_plans FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'super_admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'super_admin'));

DROP TRIGGER IF EXISTS pricing_plans_set_updated_at ON public.pricing_plans;
CREATE TRIGGER pricing_plans_set_updated_at
  BEFORE UPDATE ON public.pricing_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pricing_plans (
  tier, name, description, price_monthly, price_annual, features, cta_label, is_popular, sort_order
) VALUES
  ('starter', 'Starter', 'Everything a solo shop owner needs to run day-to-day sales.', 20, 199,
   '["Sales","Inventory","Expenses","Customers","Basic Reports","1 Business","Up to 2 Staff"]'::jsonb,
   'Get Started', false, 10),
  ('business', 'Business', 'For growing teams that need advanced reports and SMS.', 50, 499,
   '["Everything in Starter","Unlimited Staff","Advanced Reports","SMS Notifications","Team Management","Customer Management","Business Insights","Export Reports"]'::jsonb,
   'Choose Business', true, 20),
  ('business_plus', 'Business Plus', 'The full commerce suite with online ordering and delivery.', 80, 799,
   '["Everything in Business","Online Ordering","Customer Store Link","Customer Order Tracking","Delivery Status Updates","Automatic Customer SMS","Paystack Checkout","Delivery Fee","Carrier Information","Customer Delivery Confirmation","Premium Order Management"]'::jsonb,
   'Go Premium', false, 30)
ON CONFLICT (tier) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.marketing_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  business_name text,
  testimonial text NOT NULL DEFAULT '',
  rating integer NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  media_url text,
  media_type text CHECK (media_type IN ('image', 'video')),
  media_fit text NOT NULL DEFAULT 'cover' CHECK (media_fit IN ('cover', 'contain')),
  media_position_x numeric NOT NULL DEFAULT 50 CHECK (media_position_x BETWEEN 0 AND 100),
  media_position_y numeric NOT NULL DEFAULT 50 CHECK (media_position_y BETWEEN 0 AND 100),
  media_zoom numeric NOT NULL DEFAULT 1 CHECK (media_zoom BETWEEN 1 AND 3),
  avatar_url text,
  avatar_fit text NOT NULL DEFAULT 'cover' CHECK (avatar_fit IN ('cover', 'contain')),
  avatar_position_x numeric NOT NULL DEFAULT 50 CHECK (avatar_position_x BETWEEN 0 AND 100),
  avatar_position_y numeric NOT NULL DEFAULT 50 CHECK (avatar_position_y BETWEEN 0 AND 100),
  avatar_zoom numeric NOT NULL DEFAULT 1 CHECK (avatar_zoom BETWEEN 1 AND 3),
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketing_reviews FROM anon, authenticated;
GRANT SELECT ON TABLE public.marketing_reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.marketing_reviews TO authenticated;
GRANT ALL ON TABLE public.marketing_reviews TO service_role;

DROP POLICY IF EXISTS "marketing_reviews public read visible" ON public.marketing_reviews;
CREATE POLICY "marketing_reviews public read visible"
  ON public.marketing_reviews FOR SELECT TO anon, authenticated
  USING (visible OR public.has_role((SELECT auth.uid()), 'super_admin'));
DROP POLICY IF EXISTS "marketing_reviews super admin all" ON public.marketing_reviews;
CREATE POLICY "marketing_reviews super admin all"
  ON public.marketing_reviews FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'super_admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'super_admin'));

DROP TRIGGER IF EXISTS trg_marketing_reviews_updated_at ON public.marketing_reviews;
CREATE TRIGGER trg_marketing_reviews_updated_at
  BEFORE UPDATE ON public.marketing_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.touch_user_activity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
BEGIN
  IF caller_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET last_activity_at = now()
  WHERE (id = caller_id OR user_id = caller_id)
    AND (last_activity_at IS NULL OR last_activity_at < now() - interval '5 minutes');
END;
$$;

CREATE OR REPLACE FUNCTION public.record_user_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
BEGIN
  IF caller_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET last_login_at = now(),
      last_activity_at = now(),
      login_count = COALESCE(login_count, 0) + 1
  WHERE id = caller_id OR user_id = caller_id;
END;
$$;

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
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_super_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.email,
         p.display_name,
         p.business_name,
         p.phone,
         COALESCE(p.role, role_row.role),
         p.subscription_plan::text,
         p.subscription_status::text,
         COALESCE(p.suspended, false),
         p.created_at,
         p.last_login_at,
         p.last_activity_at,
         p.login_count
  FROM public.profiles AS p
  LEFT JOIN LATERAL (
    SELECT ur.role::text AS role
    FROM public.user_roles AS ur
    WHERE ur.user_id = p.user_id
    ORDER BY CASE ur.role::text
      WHEN 'super_admin' THEN 0
      WHEN 'admin' THEN 1
      WHEN 'manager' THEN 2
      ELSE 3
    END
    LIMIT 1
  ) AS role_row ON true
  ORDER BY p.last_activity_at DESC NULLS LAST, p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_user_activity() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_user_login() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_user_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_user_activity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_user_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_activity() TO authenticated;

ALTER TABLE public.subscription_payments REPLICA IDENTITY FULL;
ALTER TABLE public.feedback_messages REPLICA IDENTITY FULL;
ALTER TABLE public.ad_applications REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'subscription_payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_payments;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'feedback_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ad_applications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_applications;
  END IF;
END
$$;
