-- 1. Extend the subscription_plan enum with the new tiers (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'starter' AND enumtypid = 'public.subscription_plan'::regtype) THEN
    ALTER TYPE public.subscription_plan ADD VALUE 'starter';
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'business' AND enumtypid = 'public.subscription_plan'::regtype) THEN
    ALTER TYPE public.subscription_plan ADD VALUE 'business';
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'business_plus' AND enumtypid = 'public.subscription_plan'::regtype) THEN
    ALTER TYPE public.subscription_plan ADD VALUE 'business_plus';
  END IF;
END$$;

-- 2. Pricing plans catalog (editable by super admin, readable by everyone)
CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tier TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_monthly NUMERIC NOT NULL DEFAULT 0,
  price_annual NUMERIC NOT NULL DEFAULT 0,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  cta_label TEXT NOT NULL DEFAULT 'Get Started',
  is_popular BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pricing_plans TO anon, authenticated;
GRANT ALL ON public.pricing_plans TO service_role;
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active pricing plans"
  ON public.pricing_plans FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins manage pricing plans"
  ON public.pricing_plans FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER pricing_plans_set_updated_at
  BEFORE UPDATE ON public.pricing_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Seed the three tiers
INSERT INTO public.pricing_plans (tier, name, description, price_monthly, price_annual, features, cta_label, is_popular, sort_order) VALUES
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