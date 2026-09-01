-- Fix first-time setup for production profiles whose primary key differs from auth.users.id.
-- This migration only updates function definitions; it does not rewrite existing rows.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, user_id, email, display_name)
  VALUES (
    NEW.id,
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), NEW.email)
  )
  ON CONFLICT (user_id) DO UPDATE
    SET email = COALESCE(EXCLUDED.email, public.profiles.email),
        display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.profiles.display_name),
        updated_at = now();

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_business_workspace_membership(
  _business_id uuid,
  _display_name text DEFAULT '',
  _phone text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _resolved_business_id uuid := _business_id;
  _safe_display_name text := NULLIF(trim(COALESCE(_display_name, '')), '');
  _safe_phone text := NULLIF(trim(COALESCE(_phone, '')), '');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _resolved_business_id IS NULL THEN
    SELECT p.business_id INTO _resolved_business_id
    FROM public.profiles p
    WHERE p.user_id = _uid OR p.id = _uid
    LIMIT 1;
  END IF;

  IF _resolved_business_id IS NULL THEN
    _resolved_business_id := _uid;
  END IF;

  INSERT INTO public.businesses (id, name, owner_user_id, status)
  VALUES (
    _resolved_business_id,
    COALESCE(_safe_display_name, 'My Business'),
    _uid,
    'active'
  )
  ON CONFLICT (id) DO UPDATE
    SET owner_user_id = COALESCE(public.businesses.owner_user_id, EXCLUDED.owner_user_id),
        name = COALESCE(NULLIF(EXCLUDED.name, ''), public.businesses.name),
        updated_at = now();

  UPDATE public.profiles
     SET user_id = COALESCE(public.profiles.user_id, _uid),
         business_id = COALESCE(public.profiles.business_id, _resolved_business_id),
         display_name = COALESCE(_safe_display_name, public.profiles.display_name),
         phone = COALESCE(_safe_phone, public.profiles.phone),
         updated_at = now()
   WHERE public.profiles.user_id = _uid
      OR public.profiles.id = _uid;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, user_id, business_id, display_name, phone)
    VALUES (_uid, _uid, _resolved_business_id, _safe_display_name, _safe_phone)
    ON CONFLICT (user_id) DO UPDATE
      SET business_id = COALESCE(public.profiles.business_id, EXCLUDED.business_id),
          display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
          phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
          updated_at = now();
  END IF;

  INSERT INTO public.user_roles (user_id, role, business_id)
  VALUES (_uid, 'admin'::public.app_role, _resolved_business_id)
  ON CONFLICT (user_id, role) DO UPDATE
    SET business_id = COALESCE(public.user_roles.business_id, EXCLUDED.business_id);

  RETURN _resolved_business_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_business_for_owner(
  _name text,
  _email text,
  _phone text,
  _location text,
  _employees integer,
  _logo_light_url text,
  _logo_dark_url text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _biz_id uuid;
  _existing uuid;
  _safe_name text := COALESCE(NULLIF(trim(COALESCE(_name, '')), ''), 'My Business');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.business_id INTO _existing
  FROM public.profiles p
  WHERE p.user_id = _uid OR p.id = _uid
  LIMIT 1;

  IF _existing IS NOT NULL THEN
    PERFORM public.ensure_business_workspace_membership(_existing, _safe_name, _phone);
    RETURN _existing;
  END IF;

  _biz_id := _uid;

  INSERT INTO public.businesses
    (id, name, email, phone, location, number_of_employees, owner_user_id,
     status, email_verified, phone_verified, logo_light_url, logo_dark_url)
  VALUES
    (_biz_id, _safe_name, NULLIF(trim(COALESCE(_email, '')), ''), NULLIF(trim(COALESCE(_phone, '')), ''),
     NULLIF(trim(COALESCE(_location, '')), ''), COALESCE(_employees, 1), _uid,
     'pending', false, false,
     NULLIF(trim(COALESCE(_logo_light_url, '')), ''), NULLIF(trim(COALESCE(_logo_dark_url, '')), ''))
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        email = COALESCE(EXCLUDED.email, public.businesses.email),
        phone = COALESCE(EXCLUDED.phone, public.businesses.phone),
        location = COALESCE(EXCLUDED.location, public.businesses.location),
        number_of_employees = COALESCE(EXCLUDED.number_of_employees, public.businesses.number_of_employees),
        owner_user_id = COALESCE(public.businesses.owner_user_id, EXCLUDED.owner_user_id),
        logo_light_url = COALESCE(EXCLUDED.logo_light_url, public.businesses.logo_light_url),
        logo_dark_url = COALESCE(EXCLUDED.logo_dark_url, public.businesses.logo_dark_url),
        updated_at = now()
  RETURNING id INTO _biz_id;

  PERFORM public.ensure_business_workspace_membership(_biz_id, _safe_name, _phone);

  RETURN _biz_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_business_workspace_membership(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_for_owner(text, text, text, text, integer, text, text) TO authenticated;
