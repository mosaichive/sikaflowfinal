REVOKE EXECUTE ON FUNCTION public.touch_user_activity() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_user_login() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_user_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_user_activity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_user_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_activity() TO authenticated;