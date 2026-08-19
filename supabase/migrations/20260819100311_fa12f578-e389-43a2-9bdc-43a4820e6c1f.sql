-- Additive, idempotent referrals schema repair + startup check function

CREATE OR REPLACE FUNCTION public.ensure_referrals_columns()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _missing text[] := ARRAY[]::text[];
  _added text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.referrals') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'referrals table not found');
  END IF;

  SELECT array_agg(c)
    INTO _missing
  FROM unnest(ARRAY['referred_email','reward_months','referrer_business_id']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = c
  );

  _missing := COALESCE(_missing, ARRAY[]::text[]);

  IF 'referred_email' = ANY(_missing) THEN
    ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS referred_email text;
    _added := _added || 'referred_email'::text;
  END IF;

  IF 'reward_months' = ANY(_missing) THEN
    ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS reward_months integer NOT NULL DEFAULT 0;
    _added := _added || 'reward_months'::text;
  END IF;

  IF 'referrer_business_id' = ANY(_missing) THEN
    ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS referrer_business_id uuid;
    UPDATE public.referrals SET referrer_business_id = referrer_user_id WHERE referrer_business_id IS NULL;
    CREATE INDEX IF NOT EXISTS referrals_referrer_business_idx
      ON public.referrals (referrer_business_id, created_at DESC);
    _added := _added || 'referrer_business_id'::text;
  END IF;

  RETURN jsonb_build_object('ok', true, 'missing', to_jsonb(_missing), 'added', to_jsonb(_added));
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_referrals_columns() TO authenticated, service_role;

-- Run it now so the schema is correct immediately.
SELECT public.ensure_referrals_columns();