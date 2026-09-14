-- PostgREST can authenticate a secret/service key by switching the database
-- role without populating the legacy request.jwt.claim.role setting. EXECUTE
-- remains restricted to service_role, and this check supports both forms.
CREATE OR REPLACE FUNCTION public.remove_business_team_membership(
  p_business_id uuid,
  p_member_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_owner_id uuid;
  v_target_id uuid;
  v_display_name text;
  v_actor_name text;
BEGIN
  IF current_user <> 'service_role'
     AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_business_id IS NULL OR p_member_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'invalid_team_member' USING ERRCODE = '22023';
  END IF;

  SELECT b.owner_user_id INTO v_owner_id
  FROM public.businesses AS b
  WHERE b.id = p_business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'business_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_actor_id <> v_owner_id
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles AS ur
       WHERE ur.user_id = p_actor_id
         AND ur.business_id = p_business_id
         AND ur.role::text = 'admin'
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.staff_members AS sm
       WHERE sm.business_id = p_business_id
         AND sm.staff_user_id = p_actor_id
         AND sm.active
         AND sm.removed_at IS NULL
         AND (
           sm.permissions->>'role' = 'admin'
           OR COALESCE(sm.permissions->'modules', '[]'::jsonb) ? 'staff'
         )
     ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT sm.staff_user_id, sm.display_name
    INTO v_target_id, v_display_name
  FROM public.staff_members AS sm
  WHERE sm.id = p_member_id
    AND sm.business_id = p_business_id
    AND sm.removed_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_member_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_id = p_actor_id OR v_target_id = v_owner_id THEN
    RAISE EXCEPTION 'business_owner_cannot_be_removed' USING ERRCODE = '22023';
  END IF;

  IF v_target_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = v_target_id AND ur.role::text = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'super_admin_cannot_be_removed_here' USING ERRCODE = '42501';
  END IF;

  UPDATE public.staff_members
  SET active = false, removed_at = now()
  WHERE id = p_member_id AND business_id = p_business_id;

  IF v_target_id IS NOT NULL THEN
    DELETE FROM public.user_roles
    WHERE user_id = v_target_id
      AND business_id = p_business_id
      AND role::text <> 'super_admin';

    UPDATE public.profiles
    SET business_id = NULL, onboarding_completed = false
    WHERE user_id = v_target_id AND business_id = p_business_id;
  END IF;

  SELECT COALESCE(p.display_name, '') INTO v_actor_name
  FROM public.profiles AS p
  WHERE p.user_id = p_actor_id;

  INSERT INTO public.audit_log (
    user_id, business_id, action, details, performed_by, performed_by_name
  ) VALUES (
    v_target_id, p_business_id, 'team_user_removed',
    'Revoked workspace access for ' || COALESCE(NULLIF(v_display_name, ''), 'team member'),
    p_actor_id, COALESCE(v_actor_name, '')
  );

  RETURN jsonb_build_object(
    'ok', true,
    'removed_user_id', v_target_id,
    'auth_user_preserved', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_business_team_membership(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_business_team_membership(uuid, uuid, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
