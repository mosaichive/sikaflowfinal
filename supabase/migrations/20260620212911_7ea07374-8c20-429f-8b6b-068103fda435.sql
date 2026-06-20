REVOKE INSERT, UPDATE, DELETE ON public.signup_otps FROM authenticated;
REVOKE SELECT ON public.signup_otps FROM anon;