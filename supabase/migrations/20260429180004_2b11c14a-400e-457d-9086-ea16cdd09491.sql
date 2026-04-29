
CREATE OR REPLACE FUNCTION public.accept_staff_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.staff_invites%ROWTYPE;
  user_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO inv FROM public.staff_invites WHERE token = _token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found';
  END IF;
  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'invite no longer valid';
  END IF;
  IF inv.expires_at < now() THEN
    RAISE EXCEPTION 'invite expired';
  END IF;

  user_email := lower(coalesce((auth.jwt() ->> 'email'), ''));
  IF user_email = '' OR user_email <> lower(inv.email) THEN
    RAISE EXCEPTION 'invite is for a different email';
  END IF;

  INSERT INTO public.staff_members (business_owner_id, staff_user_id, display_name, email, permissions, active)
  VALUES (inv.business_owner_id, auth.uid(), inv.display_name, inv.email, inv.permissions, true)
  ON CONFLICT (business_owner_id, staff_user_id)
    DO UPDATE SET permissions = EXCLUDED.permissions, active = true, display_name = EXCLUDED.display_name;

  UPDATE public.staff_invites
    SET status = 'accepted', accepted_user_id = auth.uid(), accepted_at = now()
    WHERE id = inv.id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'staff')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'business_owner_id', inv.business_owner_id);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_staff_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_staff_invite(text) TO authenticated;
