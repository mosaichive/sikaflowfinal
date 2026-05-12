-- Core schema alignment for the canonical production project.
-- Safe rules for this migration:
-- - no data deletion
-- - no table drops
-- - additive columns are nullable first where existing rows may be present
-- - existing user-scoped data is mapped into a one-user/one-business workspace

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'staff', 'manager', 'salesperson', 'distributor', 'super_admin');
  END IF;
END $$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'salesperson';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'distributor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  slug text,
  business_type text NOT NULL DEFAULT '',
  email text,
  phone text,
  location text,
  number_of_employees integer,
  owner_user_id uuid,
  status text NOT NULL DEFAULT 'active',
  email_verified boolean NOT NULL DEFAULT true,
  phone_verified boolean NOT NULL DEFAULT false,
  logo_light_url text,
  logo_dark_url text,
  allow_sales_without_stock boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS number_of_employees integer,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS email_verified boolean,
  ADD COLUMN IF NOT EXISTS phone_verified boolean,
  ADD COLUMN IF NOT EXISTS logo_light_url text,
  ADD COLUMN IF NOT EXISTS logo_dark_url text,
  ADD COLUMN IF NOT EXISTS allow_sales_without_stock boolean,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS business_id uuid,
  ADD COLUMN IF NOT EXISTS email_verified boolean,
  ADD COLUMN IF NOT EXISTS phone_verified boolean,
  ADD COLUMN IF NOT EXISTS referred_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS referral_claimed_at timestamptz;

UPDATE public.profiles
SET user_id = id
WHERE user_id IS NULL;

UPDATE public.profiles
SET business_id = COALESCE(business_id, user_id, id)
WHERE business_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_unique_idx
  ON public.profiles (user_id)
  WHERE user_id IS NOT NULL;

INSERT INTO public.businesses (
  id,
  name,
  business_type,
  email,
  phone,
  location,
  number_of_employees,
  owner_user_id,
  status,
  email_verified,
  phone_verified,
  logo_light_url,
  logo_dark_url,
  created_at,
  updated_at
)
SELECT
  p.business_id,
  COALESCE(NULLIF(p.business_name, ''), NULLIF(p.display_name, ''), p.email, 'My Business'),
  COALESCE(p.business_type, ''),
  p.email,
  p.phone,
  p.location,
  CASE WHEN COALESCE(p.num_employees, '') ~ '^[0-9]+$' THEN p.num_employees::integer ELSE NULL END,
  p.user_id,
  CASE WHEN p.suspended THEN 'suspended' ELSE 'active' END,
  COALESCE(p.email_verified, false),
  COALESCE(p.phone_verified, false),
  p.logo_url,
  p.logo_url,
  COALESCE(p.created_at, now()),
  COALESCE(p.updated_at, now())
FROM public.profiles p
WHERE p.business_id IS NOT NULL
ON CONFLICT (id) DO UPDATE
SET
  name = COALESCE(NULLIF(EXCLUDED.name, ''), public.businesses.name),
  email = COALESCE(EXCLUDED.email, public.businesses.email),
  phone = COALESCE(EXCLUDED.phone, public.businesses.phone),
  location = COALESCE(EXCLUDED.location, public.businesses.location),
  owner_user_id = COALESCE(EXCLUDED.owner_user_id, public.businesses.owner_user_id),
  updated_at = now();

CREATE OR REPLACE FUNCTION public.get_user_business_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT p.business_id
      FROM public.profiles p
      WHERE p.user_id = _user_id OR p.id = _user_id
      ORDER BY (p.user_id = _user_id) DESC
      LIMIT 1
    ),
    _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role::text = 'super_admin'
  );
$$;

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS business_id uuid;

UPDATE public.user_roles ur
SET business_id = public.get_user_business_id(ur.user_id)
WHERE ur.business_id IS NULL
  AND ur.role::text <> 'super_admin';

CREATE INDEX IF NOT EXISTS user_roles_business_user_idx
  ON public.user_roles (business_id, user_id);

CREATE OR REPLACE FUNCTION public.has_role_in_business(
  _user_id uuid,
  _role public.app_role,
  _business_id uuid DEFAULT public.get_user_business_id(_user_id)
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role = _role
        AND (
          ur.business_id IS NULL
          OR _business_id IS NULL
          OR ur.business_id = _business_id
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_business(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(auth.uid())
    OR _business_id = public.get_user_business_id(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = _business_id
        AND b.owner_user_id = auth.uid()
    );
$$;

DROP POLICY IF EXISTS "Users view own business" ON public.businesses;
CREATE POLICY "Users view own business"
ON public.businesses
FOR SELECT TO authenticated
USING (public.user_can_access_business(id));

DROP POLICY IF EXISTS "Users update own business" ON public.businesses;
CREATE POLICY "Users update own business"
ON public.businesses
FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR owner_user_id = auth.uid()
  OR public.has_role_in_business(auth.uid(), 'admin'::public.app_role, id)
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR owner_user_id = auth.uid()
  OR public.has_role_in_business(auth.uid(), 'admin'::public.app_role, id)
);

DROP POLICY IF EXISTS "Users insert own business" ON public.businesses;
CREATE POLICY "Users insert own business"
ON public.businesses
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR owner_user_id = auth.uid()
  OR id = auth.uid()
);

DROP POLICY IF EXISTS "Super admin manage businesses" ON public.businesses;
CREATE POLICY "Super admin manage businesses"
ON public.businesses
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS businesses_set_updated_at ON public.businesses;
CREATE TRIGGER businesses_set_updated_at
BEFORE UPDATE ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.ensure_business_workspace_membership(
  _business_id uuid,
  _display_name text DEFAULT '',
  _phone text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _resolved_business_id uuid := _business_id;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _resolved_business_id IS NULL THEN
    SELECT public.get_user_business_id(_uid) INTO _resolved_business_id;
  END IF;

  INSERT INTO public.businesses (id, name, owner_user_id)
  VALUES (_resolved_business_id, COALESCE(NULLIF(_display_name, ''), 'My Business'), _uid)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, user_id, business_id, display_name, phone)
  VALUES (_uid, _uid, _resolved_business_id, NULLIF(_display_name, ''), NULLIF(_phone, ''))
  ON CONFLICT (id) DO UPDATE
  SET
    user_id = COALESCE(public.profiles.user_id, EXCLUDED.user_id),
    business_id = COALESCE(public.profiles.business_id, EXCLUDED.business_id),
    display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.profiles.display_name),
    phone = COALESCE(NULLIF(EXCLUDED.phone, ''), public.profiles.phone);

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _uid
      AND ur.business_id IS NOT DISTINCT FROM _resolved_business_id
  ) AND NOT public.is_super_admin(_uid) THEN
    INSERT INTO public.user_roles (user_id, role, business_id)
    VALUES (_uid, 'admin'::public.app_role, _resolved_business_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN _resolved_business_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_business_for_owner(
  _name text,
  _email text,
  _phone text,
  _location text,
  _employees int,
  _logo_light_url text,
  _logo_dark_url text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing uuid;
  _biz_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.business_id INTO _existing
  FROM public.profiles p
  WHERE p.user_id = _uid OR p.id = _uid
  LIMIT 1;

  IF _existing IS NOT NULL THEN
    PERFORM public.ensure_business_workspace_membership(_existing, _name, _phone);
    RETURN _existing;
  END IF;

  _biz_id := _uid;

  INSERT INTO public.businesses (
    id, name, email, phone, location, number_of_employees,
    owner_user_id, status, logo_light_url, logo_dark_url
  )
  VALUES (
    _biz_id, COALESCE(NULLIF(_name, ''), 'My Business'), NULLIF(_email, ''),
    NULLIF(_phone, ''), NULLIF(_location, ''), _employees,
    _uid, 'active', NULLIF(_logo_light_url, ''), NULLIF(_logo_dark_url, '')
  )
  ON CONFLICT (id) DO UPDATE
  SET
    name = COALESCE(NULLIF(EXCLUDED.name, ''), public.businesses.name),
    email = COALESCE(EXCLUDED.email, public.businesses.email),
    phone = COALESCE(EXCLUDED.phone, public.businesses.phone),
    location = COALESCE(EXCLUDED.location, public.businesses.location),
    number_of_employees = COALESCE(EXCLUDED.number_of_employees, public.businesses.number_of_employees),
    logo_light_url = COALESCE(EXCLUDED.logo_light_url, public.businesses.logo_light_url),
    logo_dark_url = COALESCE(EXCLUDED.logo_dark_url, public.businesses.logo_dark_url);

  PERFORM public.ensure_business_workspace_membership(_biz_id, _name, _phone);
  RETURN _biz_id;
END;
$$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS business_id uuid,
  ADD COLUMN IF NOT EXISTS selling_price numeric,
  ADD COLUMN IF NOT EXISTS cost_price numeric,
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS reorder_level numeric,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS is_archived boolean;

UPDATE public.products
SET
  business_id = COALESCE(business_id, user_id),
  selling_price = COALESCE(selling_price, price),
  cost_price = COALESCE(cost_price, cost),
  quantity = COALESCE(quantity, stock),
  reorder_level = COALESCE(reorder_level, low_stock_threshold),
  is_archived = COALESCE(is_archived, false);

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS business_id uuid;

UPDATE public.customers
SET business_id = COALESCE(business_id, user_id)
WHERE business_id IS NULL;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS business_id uuid,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS staff_id uuid,
  ADD COLUMN IF NOT EXISTS staff_name text,
  ADD COLUMN IF NOT EXISTS subtotal numeric,
  ADD COLUMN IF NOT EXISTS balance numeric,
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS sale_channel text,
  ADD COLUMN IF NOT EXISTS due_date timestamptz,
  ADD COLUMN IF NOT EXISTS order_id uuid;

UPDATE public.sales
SET
  business_id = COALESCE(business_id, user_id),
  subtotal = COALESCE(subtotal, total),
  balance = COALESCE(balance, 0),
  payment_status = COALESCE(payment_status, 'paid'),
  status = COALESCE(status, 'completed'),
  sale_channel = COALESCE(sale_channel, 'pos')
WHERE business_id IS NULL
   OR subtotal IS NULL
   OR balance IS NULL
   OR payment_status IS NULL
   OR status IS NULL
   OR sale_channel IS NULL;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS business_id uuid,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS cost_price numeric,
  ADD COLUMN IF NOT EXISTS line_total numeric;

UPDATE public.sale_items si
SET
  business_id = COALESCE(si.business_id, s.business_id, si.user_id),
  cost_price = COALESCE(si.cost_price, si.unit_cost, 0),
  line_total = COALESCE(si.line_total, si.quantity * si.unit_price, 0)
FROM public.sales s
WHERE si.sale_id = s.id
  AND (
    si.business_id IS NULL
    OR si.cost_price IS NULL
    OR si.line_total IS NULL
  );

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid,
  user_id uuid,
  customer_name text,
  customer_phone text,
  delivery_location text,
  notes text,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  balance numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  payment_status text NOT NULL DEFAULT 'unpaid',
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  created_by_name text,
  assigned_to uuid,
  assigned_to_name text,
  due_date timestamptz,
  delivered_at timestamptz,
  order_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS business_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS delivery_location text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS subtotal numeric,
  ADD COLUMN IF NOT EXISTS discount numeric,
  ADD COLUMN IF NOT EXISTS total numeric,
  ADD COLUMN IF NOT EXISTS amount_paid numeric,
  ADD COLUMN IF NOT EXISTS balance numeric,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS assigned_to_name text,
  ADD COLUMN IF NOT EXISTS due_date timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS order_date timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid,
  user_id uuid,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid,
  product_name text NOT NULL DEFAULT '',
  sku text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  cost_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS business_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS order_id uuid,
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS unit_price numeric,
  ADD COLUMN IF NOT EXISTS cost_price numeric,
  ADD COLUMN IF NOT EXISTS line_total numeric,
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE public.orders
SET user_id = COALESCE(user_id, created_by, business_id)
WHERE user_id IS NULL;

UPDATE public.order_items oi
SET user_id = COALESCE(oi.user_id, o.user_id, o.created_by, oi.business_id)
FROM public.orders o
WHERE oi.order_id = o.id
  AND oi.user_id IS NULL;

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS business_id uuid,
  ADD COLUMN IF NOT EXISTS movement_type text,
  ADD COLUMN IF NOT EXISTS quantity_change numeric,
  ADD COLUMN IF NOT EXISTS quantity_after numeric,
  ADD COLUMN IF NOT EXISTS unit_cost numeric,
  ADD COLUMN IF NOT EXISTS unit_price numeric,
  ADD COLUMN IF NOT EXISTS source_table text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS movement_date timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.stock_movements sm
SET
  business_id = COALESCE(sm.business_id, sm.user_id),
  movement_type = COALESCE(sm.movement_type, CASE WHEN sm.reason = 'sold' THEN 'sale' ELSE COALESCE(sm.reason, 'manual_adjustment') END),
  quantity_change = COALESCE(sm.quantity_change, sm.change),
  quantity_after = COALESCE(sm.quantity_after, 0),
  source_id = COALESCE(sm.source_id, sm.reference_id),
  created_by = COALESCE(sm.created_by, sm.user_id),
  created_by_name = COALESCE(sm.created_by_name, sm.added_by_name),
  movement_date = COALESCE(sm.movement_date, sm.created_at),
  updated_at = COALESCE(sm.updated_at, sm.created_at, now())
WHERE sm.business_id IS NULL
   OR sm.movement_type IS NULL
   OR sm.quantity_change IS NULL
   OR sm.movement_date IS NULL;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS business_id uuid;

UPDATE public.expenses
SET business_id = COALESCE(business_id, user_id)
WHERE business_id IS NULL;

ALTER TABLE public.savings
  ADD COLUMN IF NOT EXISTS business_id uuid;

UPDATE public.savings
SET business_id = COALESCE(business_id, user_id)
WHERE business_id IS NULL;

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS business_id uuid;

UPDATE public.bank_accounts
SET business_id = COALESCE(business_id, user_id)
WHERE business_id IS NULL;

ALTER TABLE public.other_income
  ADD COLUMN IF NOT EXISTS business_id uuid;

UPDATE public.other_income
SET business_id = COALESCE(business_id, user_id)
WHERE business_id IS NULL;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid UNIQUE,
  plan text NOT NULL DEFAULT 'free_trial',
  status text NOT NULL DEFAULT 'trial',
  price_ghs numeric NOT NULL DEFAULT 0,
  trial_start_date timestamptz,
  trial_end_date timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_renewal_date timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  discount_percent numeric NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS business_id uuid,
  ADD COLUMN IF NOT EXISTS plan text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS price_ghs numeric,
  ADD COLUMN IF NOT EXISTS trial_start_date timestamptz,
  ADD COLUMN IF NOT EXISTS trial_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS next_renewal_date timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean,
  ADD COLUMN IF NOT EXISTS discount_percent numeric,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

INSERT INTO public.subscriptions (
  business_id,
  plan,
  status,
  price_ghs,
  trial_start_date,
  trial_end_date,
  current_period_start,
  current_period_end,
  next_renewal_date
)
SELECT
  DISTINCT ON (b.id)
  b.id,
  CASE
    WHEN p.subscription_plan IN ('monthly', 'annual') THEN p.subscription_plan::text
    ELSE 'free_trial'
  END,
  CASE
    WHEN p.subscription_status IN ('active', 'expired', 'suspended') THEN p.subscription_status::text
    ELSE 'trial'
  END,
  CASE WHEN p.subscription_plan = 'annual' THEN 500 WHEN p.subscription_plan = 'monthly' THEN 50 ELSE 0 END,
  p.trial_start_date,
  p.trial_end_date,
  COALESCE(p.subscription_start_date, p.trial_start_date),
  COALESCE(p.subscription_end_date, p.trial_end_date),
  COALESCE(p.subscription_end_date, p.trial_end_date)
FROM public.businesses b
LEFT JOIN public.profiles p ON p.business_id = b.id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.subscriptions existing
  WHERE existing.business_id = b.id
)
ORDER BY b.id, p.created_at NULLS LAST;

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid,
  subscription_id uuid,
  plan text NOT NULL DEFAULT 'monthly',
  requested_plan text,
  resolved_plan text,
  billing_cycle text,
  amount_ghs numeric NOT NULL DEFAULT 0,
  discount_ghs numeric NOT NULL DEFAULT 0,
  amount_paid_ghs numeric,
  currency text NOT NULL DEFAULT 'GHS',
  method text NOT NULL DEFAULT 'manual_momo',
  status text NOT NULL DEFAULT 'pending',
  reference text DEFAULT '',
  paystack_reference text,
  payer_name text DEFAULT '',
  payer_phone text DEFAULT '',
  network text,
  gateway_status text,
  gateway_message text,
  provider_transaction_id text,
  provider_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_reason text,
  note text DEFAULT '',
  submitted_by uuid,
  confirmed_by uuid,
  confirmed_at timestamptz,
  payment_date timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  activated_at timestamptz,
  notification_sent_at timestamptz,
  duplicate_of_payment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS business_id uuid,
  ADD COLUMN IF NOT EXISTS subscription_id uuid,
  ADD COLUMN IF NOT EXISTS plan text,
  ADD COLUMN IF NOT EXISTS requested_plan text,
  ADD COLUMN IF NOT EXISTS resolved_plan text,
  ADD COLUMN IF NOT EXISTS billing_cycle text,
  ADD COLUMN IF NOT EXISTS amount_ghs numeric,
  ADD COLUMN IF NOT EXISTS discount_ghs numeric,
  ADD COLUMN IF NOT EXISTS amount_paid_ghs numeric,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS method text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS paystack_reference text,
  ADD COLUMN IF NOT EXISTS payer_name text,
  ADD COLUMN IF NOT EXISTS payer_phone text,
  ADD COLUMN IF NOT EXISTS network text,
  ADD COLUMN IF NOT EXISTS gateway_status text,
  ADD COLUMN IF NOT EXISTS gateway_message text,
  ADD COLUMN IF NOT EXISTS provider_transaction_id text,
  ADD COLUMN IF NOT EXISTS provider_response jsonb,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_date timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS duplicate_of_payment_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid,
  business_id uuid,
  event_source text NOT NULL DEFAULT 'system',
  event_type text NOT NULL,
  status text NOT NULL,
  message text DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS payment_id uuid,
  ADD COLUMN IF NOT EXISTS business_id uuid,
  ADD COLUMN IF NOT EXISTS event_source text,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  target_business_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  performed_by uuid,
  performed_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_audit_log
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS target_business_id uuid,
  ADD COLUMN IF NOT EXISTS details jsonb,
  ADD COLUMN IF NOT EXISTS performed_by uuid,
  ADD COLUMN IF NOT EXISTS performed_by_email text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'momo',
  label text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS details jsonb,
  ADD COLUMN IF NOT EXISTS active boolean,
  ADD COLUMN IF NOT EXISTS sort_order integer,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

DO $$
BEGIN
  IF to_regclass('public.platform_payment_methods') IS NULL THEN
    EXECUTE 'CREATE VIEW public.platform_payment_methods AS SELECT * FROM public.payment_methods';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS businesses_owner_idx ON public.businesses(owner_user_id);
CREATE INDEX IF NOT EXISTS products_business_idx ON public.products(business_id);
CREATE INDEX IF NOT EXISTS customers_business_idx ON public.customers(business_id);
CREATE INDEX IF NOT EXISTS orders_business_idx ON public.orders(business_id);
CREATE INDEX IF NOT EXISTS order_items_business_idx ON public.order_items(business_id);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS sales_business_idx ON public.sales(business_id);
CREATE INDEX IF NOT EXISTS sale_items_business_idx ON public.sale_items(business_id);
CREATE INDEX IF NOT EXISTS stock_movements_business_idx ON public.stock_movements(business_id);
CREATE INDEX IF NOT EXISTS expenses_business_idx ON public.expenses(business_id);
CREATE INDEX IF NOT EXISTS savings_business_idx ON public.savings(business_id);
CREATE INDEX IF NOT EXISTS bank_accounts_business_idx ON public.bank_accounts(business_id);
CREATE INDEX IF NOT EXISTS other_income_business_idx ON public.other_income(business_id);
CREATE INDEX IF NOT EXISTS subscriptions_business_idx ON public.subscriptions(business_id);
CREATE INDEX IF NOT EXISTS payments_business_idx ON public.payments(business_id);
CREATE INDEX IF NOT EXISTS payments_reference_idx ON public.payments(reference);
CREATE INDEX IF NOT EXISTS payments_paystack_reference_idx ON public.payments(paystack_reference);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_set_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS payments_set_updated_at ON public.payments;
CREATE TRIGGER payments_set_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS payment_methods_set_updated_at ON public.payment_methods;
CREATE TRIGGER payment_methods_set_updated_at
BEFORE UPDATE ON public.payment_methods
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS orders_set_updated_at ON public.orders;
CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'products','customers','orders','order_items','sales','sale_items','stock_movements',
    'expenses','savings','bank_accounts','other_income','subscriptions','payments','payment_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'products','customers','orders','order_items','sales','sale_items','stock_movements',
    'expenses','savings','bank_accounts','other_income'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Core own business select" ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY "Core own business select" ON public.%I FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR business_id = public.get_user_business_id(auth.uid()) OR user_id = auth.uid())',
      table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS "Core own business insert" ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY "Core own business insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()) OR business_id = public.get_user_business_id(auth.uid()) OR user_id = auth.uid())',
      table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS "Core own business update" ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY "Core own business update" ON public.%I FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid()) OR business_id = public.get_user_business_id(auth.uid()) OR user_id = auth.uid()) WITH CHECK (public.is_super_admin(auth.uid()) OR business_id = public.get_user_business_id(auth.uid()) OR user_id = auth.uid())',
      table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS "Core own business delete" ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY "Core own business delete" ON public.%I FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()) OR business_id = public.get_user_business_id(auth.uid()) OR user_id = auth.uid())',
      table_name
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Orders own business select" ON public.orders;
CREATE POLICY "Orders own business select"
ON public.orders FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR business_id = public.get_user_business_id(auth.uid()) OR created_by = auth.uid());

DROP POLICY IF EXISTS "Orders own business write" ON public.orders;
CREATE POLICY "Orders own business write"
ON public.orders FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()) OR business_id = public.get_user_business_id(auth.uid()) OR created_by = auth.uid())
WITH CHECK (public.is_super_admin(auth.uid()) OR business_id = public.get_user_business_id(auth.uid()) OR created_by = auth.uid());

DROP POLICY IF EXISTS "Order items own business write" ON public.order_items;
CREATE POLICY "Order items own business write"
ON public.order_items FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()) OR business_id = public.get_user_business_id(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()) OR business_id = public.get_user_business_id(auth.uid()));

DROP POLICY IF EXISTS "Subscriptions own business read" ON public.subscriptions;
CREATE POLICY "Subscriptions own business read"
ON public.subscriptions FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR business_id = public.get_user_business_id(auth.uid()));

DROP POLICY IF EXISTS "Super admin manage subscriptions" ON public.subscriptions;
CREATE POLICY "Super admin manage subscriptions"
ON public.subscriptions FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Payments own business read" ON public.payments;
CREATE POLICY "Payments own business read"
ON public.payments FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR business_id = public.get_user_business_id(auth.uid()) OR submitted_by = auth.uid());

DROP POLICY IF EXISTS "Payments own business insert" ON public.payments;
CREATE POLICY "Payments own business insert"
ON public.payments FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()) OR business_id = public.get_user_business_id(auth.uid()) OR submitted_by = auth.uid());

DROP POLICY IF EXISTS "Super admin manage payments" ON public.payments;
CREATE POLICY "Super admin manage payments"
ON public.payments FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Payment events own business read" ON public.payment_events;
CREATE POLICY "Payment events own business read"
ON public.payment_events FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR business_id = public.get_user_business_id(auth.uid()));

DROP POLICY IF EXISTS "Super admin manage payment events" ON public.payment_events;
CREATE POLICY "Super admin manage payment events"
ON public.payment_events FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Payment methods readable" ON public.payment_methods;
CREATE POLICY "Payment methods readable"
ON public.payment_methods FOR SELECT TO authenticated
USING (active = true OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admin manage payment methods" ON public.payment_methods;
CREATE POLICY "Super admin manage payment methods"
ON public.payment_methods FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admin view platform audit" ON public.platform_audit_log;
CREATE POLICY "Super admin view platform audit"
ON public.platform_audit_log FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admin insert platform audit" ON public.platform_audit_log;
CREATE POLICY "Super admin insert platform audit"
ON public.platform_audit_log FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Profiles own or platform read" ON public.profiles;
CREATE POLICY "Profiles own or platform read"
ON public.profiles FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR user_id = auth.uid()
  OR id = auth.uid()
  OR business_id = public.get_user_business_id(auth.uid())
);

DROP POLICY IF EXISTS "Profiles own update" ON public.profiles;
CREATE POLICY "Profiles own update"
ON public.profiles FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()) OR user_id = auth.uid() OR id = auth.uid())
WITH CHECK (public.is_super_admin(auth.uid()) OR user_id = auth.uid() OR id = auth.uid());

DROP POLICY IF EXISTS "User roles own business read" ON public.user_roles;
CREATE POLICY "User roles own business read"
ON public.user_roles FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR user_id = auth.uid()
  OR business_id = public.get_user_business_id(auth.uid())
);

DROP POLICY IF EXISTS "Super admin manage user roles" ON public.user_roles;
CREATE POLICY "Super admin manage user roles"
ON public.user_roles FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'businesses','profiles','user_roles','products','customers','orders','order_items',
    'sales','sale_items','stock_movements','expenses','savings','bank_accounts',
    'other_income','subscriptions','payments','payment_events','payment_methods'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;
