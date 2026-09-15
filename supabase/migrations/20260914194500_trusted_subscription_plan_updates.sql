-- Keep tenant subscription state canonical and profile mirrors synchronized.
-- This function is callable only with the service role; Super Admin requests
-- reach it through the MFA-protected manage-subscription Edge Function.

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_chk;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_chk
  CHECK (plan IN (
    'free_trial',
    'monthly',
    'annual',
    'lifetime',
    'starter',
    'business',
    'business_plus'
  ));

CREATE OR REPLACE FUNCTION public.admin_set_business_subscription(
  p_business_id uuid,
  p_plan text,
  p_price_ghs numeric,
  p_period_start timestamptz,
  p_period_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile_plan public.subscription_plan;
  v_status text;
  v_profile_status public.subscription_status;
  v_profile_count integer;
  v_subscription_id uuid;
BEGIN
  IF p_business_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.businesses WHERE id = p_business_id
  ) THEN
    RAISE EXCEPTION 'business_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_plan NOT IN (
    'free_trial',
    'monthly',
    'annual',
    'lifetime',
    'starter',
    'business',
    'business_plus'
  ) THEN
    RAISE EXCEPTION 'invalid_plan' USING ERRCODE = '22023';
  END IF;

  IF p_price_ghs IS NULL OR p_price_ghs < 0 THEN
    RAISE EXCEPTION 'invalid_price' USING ERRCODE = '22023';
  END IF;

  IF p_plan <> 'lifetime' AND p_period_end IS NULL THEN
    RAISE EXCEPTION 'period_end_required' USING ERRCODE = '22023';
  END IF;

  v_profile_plan := CASE
    WHEN p_plan = 'free_trial' THEN 'trial'::public.subscription_plan
    ELSE p_plan::public.subscription_plan
  END;
  v_status := CASE
    WHEN p_plan = 'free_trial' THEN 'trial'
    WHEN p_plan = 'lifetime' THEN 'lifetime'
    ELSE 'active'
  END;
  v_profile_status := v_status::public.subscription_status;

  INSERT INTO public.subscriptions (
    business_id,
    plan,
    status,
    price_ghs,
    trial_start_date,
    trial_end_date,
    current_period_start,
    current_period_end,
    next_renewal_date,
    cancel_at_period_end
  ) VALUES (
    p_business_id,
    p_plan,
    v_status,
    p_price_ghs,
    CASE WHEN p_plan = 'free_trial' THEN p_period_start ELSE NULL END,
    CASE WHEN p_plan = 'free_trial' THEN p_period_end ELSE NULL END,
    p_period_start,
    p_period_end,
    p_period_end,
    false
  )
  ON CONFLICT (business_id) DO UPDATE SET
    plan = EXCLUDED.plan,
    status = EXCLUDED.status,
    price_ghs = EXCLUDED.price_ghs,
    trial_start_date = EXCLUDED.trial_start_date,
    trial_end_date = EXCLUDED.trial_end_date,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    next_renewal_date = EXCLUDED.next_renewal_date,
    cancel_at_period_end = false,
    updated_at = now()
  RETURNING id INTO v_subscription_id;

  UPDATE public.profiles
  SET subscription_plan = v_profile_plan,
      subscription_status = v_profile_status,
      subscription_start_date = CASE
        WHEN p_plan = 'free_trial' THEN NULL
        ELSE p_period_start
      END,
      subscription_end_date = CASE
        WHEN p_plan IN ('free_trial', 'lifetime') THEN NULL
        ELSE p_period_end
      END,
      trial_start_date = CASE
        WHEN p_plan = 'free_trial' THEN p_period_start
        ELSE trial_start_date
      END,
      trial_end_date = CASE
        WHEN p_plan = 'free_trial' THEN p_period_end
        ELSE trial_end_date
      END,
      updated_at = now()
  WHERE business_id = p_business_id;

  GET DIAGNOSTICS v_profile_count = ROW_COUNT;
  IF v_profile_count = 0 THEN
    RAISE EXCEPTION 'business_profile_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'subscription_id', v_subscription_id,
    'business_id', p_business_id,
    'plan', v_profile_plan::text,
    'status', v_status,
    'profiles_updated', v_profile_count,
    'period_end', p_period_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_business_subscription(
  uuid, text, numeric, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_set_business_subscription(
  uuid, text, numeric, timestamptz, timestamptz
) TO service_role;
