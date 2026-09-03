-- Platform administrators are recognized only after a verified MFA challenge.
-- Existing tenant roles remain unchanged.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE role = 'super_admin'::public.app_role
      AND business_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot enable Super Admin MFA: tenant-scoped super_admin rows require manual review';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.user_roles'::regclass
      AND conname = 'user_roles_super_admin_platform_scope'
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_super_admin_platform_scope
      CHECK (role <> 'super_admin'::public.app_role OR business_id IS NULL)
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.user_roles
  VALIDATE CONSTRAINT user_roles_super_admin_platform_scope;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (
        _role <> 'super_admin'::public.app_role
        OR (
          ur.business_id IS NULL
          AND _user_id = (SELECT auth.uid())
          AND COALESCE((SELECT auth.jwt() ->> 'aal'), '') = 'aal2'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = _user_id
      AND ur.role = 'super_admin'::public.app_role
      AND ur.business_id IS NULL
      AND _user_id = (SELECT auth.uid())
      AND COALESCE((SELECT auth.jwt() ->> 'aal'), '') = 'aal2'
  );
$$;
