-- Remove email-specific role assignment from the Auth user trigger.
-- Administrative roles are assigned only through the protected server workflow.
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
