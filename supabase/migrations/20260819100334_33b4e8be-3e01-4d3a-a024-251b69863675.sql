REVOKE EXECUTE ON FUNCTION public.ensure_referrals_columns() FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_referrals_columns() TO service_role;