-- Make team invitations and module assignments authoritative end to end.
-- This migration changes functions, grants, triggers, and policies only. It
-- does not rewrite any existing team, user, or business row.

ALTER TABLE public.staff_invites
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_staff_invites_business
  ON public.staff_invites (business_id)
  WHERE business_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_staff_member_linkage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role')
     AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND (
       NEW.business_owner_id IS DISTINCT FROM OLD.business_owner_id
       OR NEW.business_id IS DISTINCT FROM OLD.business_id
       OR NEW.staff_user_id IS DISTINCT FROM OLD.staff_user_id
       OR NEW.email IS DISTINCT FROM OLD.email
     ) THEN
    RAISE EXCEPTION 'Team membership linkage can only be changed by a trusted server workflow.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_business_member(_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.business_owner_id = _owner_id
      AND sm.staff_user_id = auth.uid()
      AND sm.active = true
      AND sm.removed_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.staff_member_has_module(_owner_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.business_owner_id = _owner_id
      AND sm.staff_user_id = auth.uid()
      AND sm.active = true
      AND sm.removed_at IS NULL
      AND CASE
        -- An explicit module list is always authoritative, including for a
        -- delegated admin. This mirrors the route/sidebar permission checks.
        WHEN jsonb_typeof(sm.permissions -> 'modules') = 'array'
          THEN (sm.permissions -> 'modules') ? _module
        ELSE
          COALESCE(sm.permissions ->> 'role', 'staff') = 'admin'
          OR _module = 'dashboard'
          OR (COALESCE(sm.permissions ->> 'role', 'staff') = 'manager'
              AND _module = ANY (ARRAY['sales','products','inventory','damaged_goods','customers','orders','other_income','expenses','savings','reports','announcements']))
          OR (COALESCE(sm.permissions ->> 'role', 'staff') = 'salesperson'
              AND _module = ANY (ARRAY['sales','customers','orders','announcements']))
          OR (COALESCE(sm.permissions ->> 'role', 'staff') = 'cashier'
              AND _module = ANY (ARRAY['sales','customers','announcements']))
          OR (COALESCE(sm.permissions ->> 'role', 'staff') = 'distributor'
              AND _module = ANY (ARRAY['inventory','orders','announcements']))
          OR (COALESCE(sm.permissions ->> 'role', 'staff') = 'staff'
              AND _module = 'announcements')
      END
  );
$$;

CREATE OR REPLACE FUNCTION public.staff_member_has_any_module(_owner_id uuid, _modules text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(_modules) AS module_name
    WHERE public.staff_member_has_module(_owner_id, module_name)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_business_member_module(_owner_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.staff_member_has_module(_owner_id, _module);
$$;

CREATE OR REPLACE FUNCTION public.accept_staff_invite(
  _token text,
  _full_name text DEFAULT NULL,
  _position text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  inv public.staff_invites%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_user_email text := lower(COALESCE(auth.jwt() ->> 'email', ''));
  v_business_id uuid;
  v_business_name text;
  v_member_id uuid;
  v_role text;
  v_modules jsonb;
  v_permissions jsonb;
  v_valid_modules constant text[] := ARRAY[
    'dashboard','sales','products','inventory','damaged_goods','customers',
    'orders','other_income','expenses','savings','reports','staff',
    'announcements','settings'
  ];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _token IS NULL OR length(_token) NOT BETWEEN 20 AND 128 THEN
    RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO inv
  FROM public.staff_invites
  WHERE token = _token
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P0002';
  END IF;
  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'invite no longer valid' USING ERRCODE = '22023';
  END IF;
  IF inv.expires_at <= now() THEN
    RAISE EXCEPTION 'invite expired' USING ERRCODE = '22023';
  END IF;
  IF v_user_email = '' OR v_user_email <> lower(inv.email) THEN
    RAISE EXCEPTION 'invite is for a different email' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = v_user_id
      AND lower(u.email) = v_user_email
      AND u.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'email confirmation required' USING ERRCODE = '42501';
  END IF;
  IF v_user_id = inv.business_owner_id THEN
    RAISE EXCEPTION 'business owner cannot accept a staff invite' USING ERRCODE = '22023';
  END IF;

  IF inv.business_id IS NOT NULL THEN
    SELECT b.id, b.name
    INTO v_business_id, v_business_name
    FROM public.businesses b
    WHERE b.id = inv.business_id
      AND b.owner_user_id = inv.business_owner_id;
  ELSE
    SELECT b.id, b.name
    INTO v_business_id, v_business_name
    FROM public.businesses b
    LEFT JOIN public.profiles p ON p.user_id = inv.business_owner_id
    WHERE b.owner_user_id = inv.business_owner_id
    ORDER BY (b.id = p.business_id) DESC NULLS LAST, b.created_at
    LIMIT 1;
  END IF;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'inviting business is unavailable' USING ERRCODE = 'P0002';
  END IF;

  -- One authenticated account belongs to one tenant. Never reassign an
  -- existing owner, platform admin, or member of another business.
  IF EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_user_id = v_user_id)
     OR EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = v_user_id
         AND (ur.role::text IN ('super_admin', 'business_owner')
              OR (ur.business_id IS NOT NULL AND ur.business_id <> v_business_id))
     )
     OR EXISTS (
       SELECT 1 FROM public.staff_members sm
       WHERE sm.staff_user_id = v_user_id
         AND sm.active = true
         AND sm.removed_at IS NULL
         AND sm.business_id IS DISTINCT FROM v_business_id
     )
     OR EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.user_id = v_user_id
         AND p.business_id IS NOT NULL
         AND p.business_id <> v_business_id
     ) THEN
    RAISE EXCEPTION 'account already belongs to another business' USING ERRCODE = '23505';
  END IF;

  v_role := COALESCE(NULLIF(inv.permissions ->> 'role', ''), 'staff');
  IF v_role NOT IN ('admin', 'manager', 'salesperson', 'cashier', 'distributor', 'staff') THEN
    v_role := 'staff';
  END IF;

  IF jsonb_typeof(inv.permissions -> 'modules') = 'array' THEN
    SELECT COALESCE(jsonb_agg(module_name ORDER BY module_name), '[]'::jsonb)
    INTO v_modules
    FROM jsonb_array_elements_text(inv.permissions -> 'modules') AS modules(module_name)
    WHERE module_name = ANY (v_valid_modules);
  ELSE
    v_modules := CASE v_role
      WHEN 'admin' THEN to_jsonb(v_valid_modules)
      WHEN 'manager' THEN to_jsonb(ARRAY['dashboard','sales','products','inventory','damaged_goods','customers','orders','other_income','expenses','savings','reports','announcements']::text[])
      WHEN 'salesperson' THEN to_jsonb(ARRAY['dashboard','sales','customers','orders','announcements']::text[])
      WHEN 'cashier' THEN to_jsonb(ARRAY['dashboard','sales','customers','announcements']::text[])
      WHEN 'distributor' THEN to_jsonb(ARRAY['dashboard','inventory','orders','announcements']::text[])
      ELSE to_jsonb(ARRAY['dashboard','announcements']::text[])
    END;
  END IF;
  v_permissions := jsonb_build_object('role', v_role, 'modules', v_modules);

  INSERT INTO public.profiles (
    id, user_id, business_id, email, display_name, title, role, onboarding_completed
  )
  VALUES (
    v_user_id,
    v_user_id,
    v_business_id,
    inv.email,
    COALESCE(NULLIF(btrim(_full_name), ''), inv.display_name, split_part(inv.email, '@', 1)),
    NULLIF(btrim(_position), ''),
    v_role,
    true
  )
  ON CONFLICT (user_id) DO UPDATE
    SET business_id = EXCLUDED.business_id,
        email = COALESCE(public.profiles.email, EXCLUDED.email),
        display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.profiles.display_name),
        title = COALESCE(NULLIF(EXCLUDED.title, ''), public.profiles.title),
        role = EXCLUDED.role,
        onboarding_completed = true,
        updated_at = now();

  SELECT sm.id INTO v_member_id
  FROM public.staff_members sm
  WHERE sm.business_owner_id = inv.business_owner_id
    AND sm.staff_user_id = v_user_id
  ORDER BY (sm.removed_at IS NULL) DESC, sm.created_at
  LIMIT 1
  FOR UPDATE;

  IF v_member_id IS NULL THEN
    SELECT sm.id INTO v_member_id
    FROM public.staff_members sm
    WHERE sm.business_owner_id = inv.business_owner_id
      AND sm.staff_user_id IS NULL
      AND sm.removed_at IS NULL
      AND lower(COALESCE(sm.email, '')) = v_user_email
    ORDER BY sm.created_at
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_member_id IS NULL THEN
    INSERT INTO public.staff_members (
      business_owner_id, staff_user_id, business_id, display_name, email,
      permissions, active, removed_at
    ) VALUES (
      inv.business_owner_id,
      v_user_id,
      v_business_id,
      COALESCE(NULLIF(btrim(_full_name), ''), inv.display_name, split_part(inv.email, '@', 1)),
      inv.email,
      v_permissions,
      true,
      NULL
    )
    RETURNING id INTO v_member_id;
  ELSE
    UPDATE public.staff_members
    SET staff_user_id = v_user_id,
        business_id = v_business_id,
        display_name = COALESCE(NULLIF(btrim(_full_name), ''), inv.display_name, public.staff_members.display_name),
        email = inv.email,
        permissions = v_permissions,
        active = true,
        removed_at = NULL,
        updated_at = now()
    WHERE id = v_member_id;
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = v_user_id
    AND role::text <> 'super_admin'
    AND (business_id IS NULL OR business_id = v_business_id);

  INSERT INTO public.user_roles (user_id, role, business_id)
  VALUES (v_user_id, v_role::public.app_role, v_business_id);

  UPDATE public.staff_invites
  SET status = 'accepted',
      accepted_user_id = v_user_id,
      accepted_at = now(),
      updated_at = now()
  WHERE id = inv.id;

  INSERT INTO public.audit_log (
    user_id, business_id, action, details, performed_by, performed_by_name
  ) VALUES (
    v_user_id,
    v_business_id,
    'team_invite_accepted',
    'Team invitation accepted',
    v_user_id,
    COALESCE(NULLIF(btrim(_full_name), ''), inv.display_name, inv.email)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'business_owner_id', inv.business_owner_id,
    'business_id', v_business_id,
    'business_name', v_business_name,
    'member_id', v_member_id,
    'role', v_role,
    'modules', v_modules
  );
END;
$$;

-- Invite rows are mutated only by the trusted team-management function.
DROP POLICY IF EXISTS "staff invites owner manage" ON public.staff_invites;
DROP POLICY IF EXISTS "invites invitee accept" ON public.staff_invites;
DROP POLICY IF EXISTS "staff invites owner read" ON public.staff_invites;
DROP POLICY IF EXISTS "staff invites team manager read" ON public.staff_invites;

CREATE POLICY "staff invites owner read"
ON public.staff_invites
FOR SELECT
TO authenticated
USING (business_owner_id = auth.uid());

CREATE POLICY "staff invites team manager read"
ON public.staff_invites
FOR SELECT
TO authenticated
USING (public.staff_member_has_module(business_owner_id, 'staff'));

REVOKE INSERT, UPDATE, DELETE ON public.staff_invites FROM authenticated;
GRANT SELECT ON public.staff_invites TO authenticated;

-- Role assignment is a server workflow. Direct tenant-admin writes make it
-- possible to bypass the role/module checks enforced above.
DROP POLICY IF EXISTS "Admins insert business roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins update business roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins delete business roles" ON public.user_roles;
-- Keep the table grants: its remaining write policy allows only a platform
-- super admin, while the tenant team workflow uses the service role.

REVOKE ALL ON FUNCTION public.accept_staff_invite(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_staff_invite(text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.preview_staff_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_staff_invite(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.is_business_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.staff_member_has_module(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_member_has_module(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.staff_member_has_any_module(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_member_has_any_module(uuid, text[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_business_member_module(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_business_member_module(uuid, text) TO authenticated, service_role;

-- A user's own profile is editable for personal details, not tenant identity,
-- billing entitlement, account suspension, or verification state. Trusted
-- SECURITY DEFINER onboarding/invite functions and service-role workflows run
-- as postgres/service_role and may still make those changes.
CREATE OR REPLACE FUNCTION public.protect_profile_authority_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role')
     OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.business_id IS NOT NULL
       OR NEW.role IS NOT NULL
       OR COALESCE(NEW.suspended, false)
       OR NEW.subscription_plan::text <> 'trial'
       OR NEW.subscription_status::text <> 'trial'
       OR NEW.subscription_start_date IS NOT NULL
       OR NEW.subscription_end_date IS NOT NULL
       OR NEW.trial_start_date NOT BETWEEN now() - interval '5 minutes' AND now() + interval '5 minutes'
       OR NEW.trial_end_date > now() + interval '31 days'
       OR COALESCE(NEW.email_verified, false)
       OR COALESCE(NEW.phone_verified, false) THEN
      RAISE EXCEPTION 'Profile authority fields require a trusted server workflow'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.business_id IS DISTINCT FROM OLD.business_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_start_date IS DISTINCT FROM OLD.subscription_start_date
     OR NEW.subscription_end_date IS DISTINCT FROM OLD.subscription_end_date
     OR NEW.trial_start_date IS DISTINCT FROM OLD.trial_start_date
     OR NEW.trial_end_date IS DISTINCT FROM OLD.trial_end_date
     OR NEW.suspended IS DISTINCT FROM OLD.suspended
     OR NEW.email_verified IS DISTINCT FROM OLD.email_verified
     OR NEW.phone_verified IS DISTINCT FROM OLD.phone_verified
     OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at
     OR NEW.last_verified_phone IS DISTINCT FROM OLD.last_verified_phone THEN
    RAISE EXCEPTION 'Profile authority fields require a trusted server workflow'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_authority_fields ON public.profiles;
CREATE TRIGGER protect_profile_authority_fields
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_authority_fields();

REVOKE ALL ON FUNCTION public.protect_profile_authority_fields() FROM PUBLIC, anon, authenticated;

-- Existing permissive tenant policies grant every active business member
-- access to most rows. A restrictive policy is ANDed with every permissive
-- policy, so explicit module assignments cannot be bypassed through REST.
CREATE INDEX IF NOT EXISTS idx_staff_members_active_user_business
  ON public.staff_members (staff_user_id, business_id)
  WHERE active = true AND removed_at IS NULL;

CREATE OR REPLACE FUNCTION public.tenant_has_any_module(_business_id uuid, _modules text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.businesses b
    WHERE b.id = _business_id
      AND (
        b.owner_user_id = auth.uid()
        OR public.is_super_admin(auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.staff_members sm
          WHERE sm.business_id = b.id
            AND sm.business_owner_id = b.owner_user_id
            AND sm.staff_user_id = auth.uid()
            AND sm.active = true
            AND sm.removed_at IS NULL
            AND CASE
              WHEN jsonb_typeof(sm.permissions -> 'modules') = 'array'
                THEN (sm.permissions -> 'modules') ?| _modules
              ELSE
                COALESCE(sm.permissions ->> 'role', 'staff') = 'admin'
                OR 'dashboard' = ANY (_modules)
                OR (sm.permissions ->> 'role' = 'manager'
                    AND _modules && ARRAY['sales','products','inventory','damaged_goods','customers','orders','other_income','expenses','savings','reports','announcements'])
                OR (sm.permissions ->> 'role' = 'salesperson'
                    AND _modules && ARRAY['sales','customers','orders','announcements'])
                OR (sm.permissions ->> 'role' = 'cashier'
                    AND _modules && ARRAY['sales','customers','announcements'])
                OR (sm.permissions ->> 'role' = 'distributor'
                    AND _modules && ARRAY['inventory','orders','announcements'])
                OR (sm.permissions ->> 'role' = 'staff'
                    AND 'announcements' = ANY (_modules))
            END
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.tenant_has_any_module(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_has_any_module(uuid, text[]) TO authenticated, service_role;

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('products', ARRAY['dashboard','sales','products','inventory','damaged_goods','orders','reports'], ARRAY['products','inventory','damaged_goods']),
      ('sales', ARRAY['dashboard','sales','savings','reports'], ARRAY['sales']),
      ('sale_items', ARRAY['dashboard','sales','savings','reports'], ARRAY['sales']),
      ('sale_documents', ARRAY['sales','reports'], ARRAY['sales']),
      ('customers', ARRAY['dashboard','sales','customers','orders','reports'], ARRAY['sales','customers','orders']),
      ('expenses', ARRAY['dashboard','expenses','savings','reports'], ARRAY['expenses']),
      ('other_income', ARRAY['dashboard','other_income','savings','reports'], ARRAY['other_income']),
      ('savings', ARRAY['dashboard','savings','reports'], ARRAY['savings']),
      ('bank_accounts', ARRAY['savings','reports','settings'], ARRAY['savings','settings']),
      ('investments', ARRAY['savings','reports'], ARRAY['savings']),
      ('investor_funding', ARRAY['savings','reports'], ARRAY['savings']),
      ('restocks', ARRAY['dashboard','products','inventory','damaged_goods','reports'], ARRAY['products','inventory','damaged_goods']),
      ('stock_movements', ARRAY['dashboard','products','inventory','damaged_goods','reports'], ARRAY['sales','products','inventory','damaged_goods']),
      ('damaged_goods', ARRAY['dashboard','inventory','damaged_goods','reports'], ARRAY['inventory','damaged_goods']),
      ('orders', ARRAY['dashboard','sales','orders','reports'], ARRAY['orders']),
      ('order_items', ARRAY['dashboard','sales','orders','reports'], ARRAY['orders'])
    ) AS modules(table_name, read_modules, write_modules)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'team_module_read_guard', target.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'team_module_insert_guard', target.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'team_module_update_guard', target.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'team_module_delete_guard', target.table_name);

    EXECUTE format(
      'CREATE POLICY team_module_read_guard ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.tenant_has_any_module(business_id, %L::text[]))',
      target.table_name, target.read_modules
    );
    EXECUTE format(
      'CREATE POLICY team_module_insert_guard ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.tenant_has_any_module(business_id, %L::text[]))',
      target.table_name, target.write_modules
    );
    EXECUTE format(
      'CREATE POLICY team_module_update_guard ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.tenant_has_any_module(business_id, %L::text[])) WITH CHECK (public.tenant_has_any_module(business_id, %L::text[]))',
      target.table_name, target.write_modules, target.write_modules
    );
    EXECUTE format(
      'CREATE POLICY team_module_delete_guard ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.tenant_has_any_module(business_id, %L::text[]))',
      target.table_name, target.write_modules
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "staff members team manager read" ON public.staff_members;
CREATE POLICY "staff members team manager read"
ON public.staff_members FOR SELECT TO authenticated
USING (public.staff_member_has_module(business_owner_id, 'staff'));

-- All team mutations go through manage-business-user, including role edits.
DROP POLICY IF EXISTS "staff members owner update" ON public.staff_members;
REVOKE INSERT, UPDATE, DELETE ON public.staff_members FROM authenticated;

NOTIFY pgrst, 'reload schema';
