-- Allow first-time onboarding users to restore a backup before the manual
-- business setup flow has created their workspace. Existing business restores
-- still require the caller to own/admin the target business.
DO $$
DECLARE
  v_sql text;
  v_old text := $old$
  SELECT p.id, p.business_id, p.user_id, COALESCE(NULLIF(p.display_name, ''), NULLIF(p.email, ''), NULLIF(p.business_name, ''), '')
  INTO v_profile_id, v_business_id, v_owner_user_id, v_display
  FROM public.profiles p
  WHERE p.user_id = uid OR p.id = uid
  ORDER BY CASE WHEN p.user_id = uid THEN 0 ELSE 1 END
  LIMIT 1;

  v_business_id := COALESCE(v_business_id, public.get_user_business_id(uid));
  v_owner_user_id := COALESCE(
    (SELECT b.owner_user_id FROM public.businesses b WHERE b.id = v_business_id),
    v_owner_user_id,
    uid
  );

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'No business profile found for this account. Finish setup before restoring a backup.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.businesses b
    WHERE b.id = v_business_id
      AND b.owner_user_id = uid
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = uid
      AND ur.business_id = v_business_id
      AND ur.role::text = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only a business owner or admin can restore a backup';
  END IF;
$old$;
  v_new text := $new$
  SELECT p.id, p.business_id, p.user_id, COALESCE(NULLIF(p.display_name, ''), NULLIF(p.email, ''), NULLIF(p.business_name, ''), '')
  INTO v_profile_id, v_business_id, v_owner_user_id, v_display
  FROM public.profiles p
  WHERE p.user_id = uid OR p.id = uid
  ORDER BY CASE WHEN p.user_id = uid THEN 0 ELSE 1 END
  LIMIT 1;

  v_business_id := COALESCE(v_business_id, public.get_user_business_id(uid));

  IF v_business_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = v_business_id) THEN
    v_business_id := NULL;
  END IF;

  IF v_business_id IS NULL THEN
    v_business_id := public.ensure_business_workspace_membership(
      NULL,
      COALESCE(NULLIF(v_biz->>'business_name', ''), NULLIF(v_display, ''), 'My Business'),
      COALESCE(NULLIF(v_biz->>'phone', ''), '')
    );

    SELECT p.id, p.business_id, p.user_id, COALESCE(NULLIF(p.display_name, ''), NULLIF(p.email, ''), NULLIF(p.business_name, ''), '')
    INTO v_profile_id, v_business_id, v_owner_user_id, v_display
    FROM public.profiles p
    WHERE p.user_id = uid OR p.id = uid
    ORDER BY CASE WHEN p.user_id = uid THEN 0 ELSE 1 END
    LIMIT 1;

    v_business_id := COALESCE(v_business_id, public.get_user_business_id(uid));
  END IF;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'No business profile found for this account. Finish setup before restoring a backup.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.businesses b
    WHERE b.id = v_business_id
      AND b.owner_user_id = uid
  )
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.businesses b ON b.id = v_business_id
    WHERE (p.user_id = uid OR p.id = uid)
      AND p.business_id = v_business_id
      AND b.owner_user_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.business_id = v_business_id
          AND ur.user_id <> uid
      )
  ) THEN
    UPDATE public.businesses b
       SET owner_user_id = uid,
           status = 'active',
           updated_at = now()
     WHERE b.id = v_business_id
       AND b.owner_user_id IS NULL;

    INSERT INTO public.user_roles (user_id, role, business_id)
    VALUES (uid, 'admin'::public.app_role, v_business_id)
    ON CONFLICT (user_id, role) DO UPDATE
      SET business_id = COALESCE(public.user_roles.business_id, EXCLUDED.business_id);
  END IF;

  v_owner_user_id := COALESCE(
    (SELECT b.owner_user_id FROM public.businesses b WHERE b.id = v_business_id),
    v_owner_user_id,
    uid
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.businesses b
    WHERE b.id = v_business_id
      AND b.owner_user_id = uid
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = uid
      AND ur.business_id = v_business_id
      AND ur.role::text = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only a business owner or admin can restore a backup';
  END IF;
$new$;
BEGIN
  SELECT pg_get_functiondef('public.restore_business_backup(jsonb,text)'::regprocedure)
  INTO v_sql;

  IF position(v_old IN v_sql) = 0 THEN
    RAISE EXCEPTION 'restore_business_backup workspace guard block not found';
  END IF;

  EXECUTE replace(v_sql, v_old, v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.restore_business_backup(jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.restore_business_backup(jsonb, text) TO authenticated;
