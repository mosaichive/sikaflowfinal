
-- 1. Profile additions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referred_by_user_id uuid;

-- 2. signup_otps table
CREATE TABLE IF NOT EXISTS public.signup_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'signup',
  user_id uuid,
  attempts int NOT NULL DEFAULT 0,
  consumed boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_signup_otps_phone ON public.signup_otps(phone);

GRANT SELECT, INSERT, UPDATE ON public.signup_otps TO authenticated;
GRANT ALL ON public.signup_otps TO service_role;

ALTER TABLE public.signup_otps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "otp owner read"
  ON public.signup_otps FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 3. referral_codes
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.referral_codes TO anon;
GRANT SELECT, INSERT ON public.referral_codes TO authenticated;
GRANT ALL ON public.referral_codes TO service_role;

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ref codes anyone read"
  ON public.referral_codes FOR SELECT
  USING (true);

CREATE POLICY "ref codes self insert"
  ON public.referral_codes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 4. referrals
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL,
  referred_user_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  rewarded_at timestamptz,
  reward_payment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_user_id);

GRANT SELECT, INSERT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referrals read participants"
  ON public.referrals FOR SELECT TO authenticated
  USING (referrer_user_id = auth.uid() OR referred_user_id = auth.uid());

CREATE TRIGGER referrals_set_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Generate referral code for a user
CREATE OR REPLACE FUNCTION public.ensure_referral_code(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  SELECT code INTO v_code FROM public.referral_codes WHERE user_id = _user_id;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  LOOP
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    BEGIN
      INSERT INTO public.referral_codes (user_id, code) VALUES (_user_id, v_code);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;
END;
$$;

-- 6. Reward trigger: when an annual subscription_payment is approved for a referred user, extend referrer's subscription_end_date by 30 days
CREATE OR REPLACE FUNCTION public.process_referral_reward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref public.referrals%ROWTYPE;
  v_current_end timestamptz;
BEGIN
  IF NEW.status <> 'approved' OR NEW.plan <> 'annual' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_ref FROM public.referrals
   WHERE referred_user_id = NEW.user_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT subscription_end_date INTO v_current_end FROM public.profiles WHERE id = v_ref.referrer_user_id;

  UPDATE public.profiles
     SET subscription_end_date = GREATEST(COALESCE(v_current_end, now()), now()) + interval '30 days',
         updated_at = now()
   WHERE id = v_ref.referrer_user_id;

  UPDATE public.referrals
     SET status = 'successful',
         rewarded_at = now(),
         reward_payment_id = NEW.id,
         updated_at = now()
   WHERE id = v_ref.id;

  RETURN NEW;
END;
$$;

-- Allow the referral reward trigger to bypass the privileged-fields guard on profiles
CREATE OR REPLACE FUNCTION public.prevent_profile_privileged_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'super_admin') THEN
    RETURN NEW;
  END IF;

  -- Allow security-definer trigger contexts (no auth.uid) to update these fields,
  -- e.g. the referral reward trigger extending subscription_end_date.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_start_date IS DISTINCT FROM OLD.subscription_start_date
     OR NEW.subscription_end_date IS DISTINCT FROM OLD.subscription_end_date
     OR NEW.suspended IS DISTINCT FROM OLD.suspended
     OR NEW.trial_start_date IS DISTINCT FROM OLD.trial_start_date
     OR NEW.trial_end_date IS DISTINCT FROM OLD.trial_end_date THEN
    RAISE EXCEPTION 'Not authorized to modify subscription or suspension fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_payments_referral_reward ON public.subscription_payments;
CREATE TRIGGER subscription_payments_referral_reward
  AFTER UPDATE ON public.subscription_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.process_referral_reward();
