-- Authorize offline replay from authoritative owner, staff membership, and
-- tenant-role records. Existing rows are not changed.
CREATE OR REPLACE FUNCTION public.offline_user_can_write(
  _business_id uuid,
  _module text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  actor uuid := auth.uid();
  owner_id uuid;
BEGIN
  IF actor IS NULL OR _business_id IS NULL OR _module IS NULL THEN
    RETURN false;
  END IF;

  SELECT b.owner_user_id
    INTO owner_id
  FROM public.businesses b
  WHERE b.id = _business_id;

  IF owner_id IS NULL THEN
    RETURN false;
  END IF;

  IF owner_id = actor THEN
    RETURN true;
  END IF;

  IF public.staff_member_has_module(owner_id, _module) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = actor
      AND ur.business_id = _business_id
      AND ur.role::text = 'admin'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.offline_user_can_write(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offline_user_can_write(uuid, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
