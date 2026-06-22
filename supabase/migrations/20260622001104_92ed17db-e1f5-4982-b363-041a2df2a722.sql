-- 1. Invalidate seeded password on admin@sikaflow.com.
-- The random secret is generated inside the statement and never surfaced.
UPDATE auth.users
   SET encrypted_password = crypt(encode(gen_random_bytes(48), 'base64'), gen_salt('bf')),
       updated_at = now()
 WHERE email = 'admin@sikaflow.com';

-- 2. Force log-out of any existing sessions for this account so the old
--    seeded password (if still cached anywhere) cannot keep an active session.
DELETE FROM auth.sessions
 WHERE user_id = (SELECT id FROM auth.users WHERE email = 'admin@sikaflow.com');

DELETE FROM auth.refresh_tokens
 WHERE user_id::text = (SELECT id::text FROM auth.users WHERE email = 'admin@sikaflow.com');

-- 3. Remove the hardcoded admin@sikaflow.com special-case from handle_new_user().
--    The super_admin role row for this account is preserved (we don't touch user_roles).
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, trial_start_date, trial_end_date)
  VALUES (NEW.id, NEW.email, now(), now() + INTERVAL '30 days')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'business_owner')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;