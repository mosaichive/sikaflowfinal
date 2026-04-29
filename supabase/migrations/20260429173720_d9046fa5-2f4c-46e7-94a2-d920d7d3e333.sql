REVOKE EXECUTE ON FUNCTION public.admin_platform_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_platform_stats() TO authenticated;