-- The first quick-setup restore patch creates a workspace only when
-- v_business_id is NULL. get_user_business_id(uid) falls back to uid even
-- before the business row exists, so treat a non-existent business id as
-- the onboarding/no-workspace case.
DO $$
DECLARE
  v_sql text;
  v_old text := $old$
  v_business_id := COALESCE(v_business_id, public.get_user_business_id(uid));

  IF v_business_id IS NULL THEN
$old$;
  v_new text := $new$
  v_business_id := COALESCE(v_business_id, public.get_user_business_id(uid));

  IF v_business_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = v_business_id) THEN
    v_business_id := NULL;
  END IF;

  IF v_business_id IS NULL THEN
$new$;
BEGIN
  SELECT pg_get_functiondef('public.restore_business_backup(jsonb,text)'::regprocedure)
  INTO v_sql;

  IF position(v_new IN v_sql) > 0 THEN
    RETURN;
  END IF;

  IF position(v_old IN v_sql) = 0 THEN
    RAISE EXCEPTION 'restore_business_backup business existence block not found';
  END IF;

  EXECUTE replace(v_sql, v_old, v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.restore_business_backup(jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.restore_business_backup(jsonb, text) TO authenticated;
