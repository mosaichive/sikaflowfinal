
-- 1. Tighten invite expiry to 7 days
ALTER TABLE public.staff_invites
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');

-- 2. Helper: is the signed-in user an active team member of a given owner?
CREATE OR REPLACE FUNCTION public.is_business_member(_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_members
    WHERE business_owner_id = _owner_id
      AND staff_user_id = auth.uid()
      AND active = true
  );
$$;

-- 3. Add team-member RLS policies to every tenant table
-- Pattern: SELECT/INSERT/UPDATE/DELETE where the row's user_id is the
-- business owner this caller belongs to.

-- products
CREATE POLICY "products team select"
  ON public.products FOR SELECT USING (public.is_business_member(user_id));
CREATE POLICY "products team insert"
  ON public.products FOR INSERT WITH CHECK (public.is_business_member(user_id));
CREATE POLICY "products team update"
  ON public.products FOR UPDATE USING (public.is_business_member(user_id));
CREATE POLICY "products team delete"
  ON public.products FOR DELETE USING (public.is_business_member(user_id));

-- sales
CREATE POLICY "sales team select"
  ON public.sales FOR SELECT USING (public.is_business_member(user_id));
CREATE POLICY "sales team insert"
  ON public.sales FOR INSERT WITH CHECK (public.is_business_member(user_id));
CREATE POLICY "sales team update"
  ON public.sales FOR UPDATE USING (public.is_business_member(user_id));
CREATE POLICY "sales team delete"
  ON public.sales FOR DELETE USING (public.is_business_member(user_id));

-- sale_items
CREATE POLICY "sale_items team select"
  ON public.sale_items FOR SELECT USING (public.is_business_member(user_id));
CREATE POLICY "sale_items team insert"
  ON public.sale_items FOR INSERT WITH CHECK (public.is_business_member(user_id));
CREATE POLICY "sale_items team update"
  ON public.sale_items FOR UPDATE USING (public.is_business_member(user_id));
CREATE POLICY "sale_items team delete"
  ON public.sale_items FOR DELETE USING (public.is_business_member(user_id));

-- sale_documents
CREATE POLICY "sale_documents team select"
  ON public.sale_documents FOR SELECT USING (public.is_business_member(user_id));
CREATE POLICY "sale_documents team insert"
  ON public.sale_documents FOR INSERT WITH CHECK (public.is_business_member(user_id));
CREATE POLICY "sale_documents team update"
  ON public.sale_documents FOR UPDATE USING (public.is_business_member(user_id));
CREATE POLICY "sale_documents team delete"
  ON public.sale_documents FOR DELETE USING (public.is_business_member(user_id));

-- customers
CREATE POLICY "customers team select"
  ON public.customers FOR SELECT USING (public.is_business_member(user_id));
CREATE POLICY "customers team insert"
  ON public.customers FOR INSERT WITH CHECK (public.is_business_member(user_id));
CREATE POLICY "customers team update"
  ON public.customers FOR UPDATE USING (public.is_business_member(user_id));
CREATE POLICY "customers team delete"
  ON public.customers FOR DELETE USING (public.is_business_member(user_id));

-- expenses
CREATE POLICY "expenses team select"
  ON public.expenses FOR SELECT USING (public.is_business_member(user_id));
CREATE POLICY "expenses team insert"
  ON public.expenses FOR INSERT WITH CHECK (public.is_business_member(user_id));
CREATE POLICY "expenses team update"
  ON public.expenses FOR UPDATE USING (public.is_business_member(user_id));
CREATE POLICY "expenses team delete"
  ON public.expenses FOR DELETE USING (public.is_business_member(user_id));

-- restocks
CREATE POLICY "restocks team select"
  ON public.restocks FOR SELECT TO authenticated USING (public.is_business_member(user_id));
CREATE POLICY "restocks team insert"
  ON public.restocks FOR INSERT TO authenticated WITH CHECK (public.is_business_member(user_id));
CREATE POLICY "restocks team update"
  ON public.restocks FOR UPDATE TO authenticated USING (public.is_business_member(user_id)) WITH CHECK (public.is_business_member(user_id));
CREATE POLICY "restocks team delete"
  ON public.restocks FOR DELETE TO authenticated USING (public.is_business_member(user_id));

-- stock_movements
CREATE POLICY "stock_movements team select"
  ON public.stock_movements FOR SELECT USING (public.is_business_member(user_id));
CREATE POLICY "stock_movements team insert"
  ON public.stock_movements FOR INSERT WITH CHECK (public.is_business_member(user_id));
CREATE POLICY "stock_movements team update"
  ON public.stock_movements FOR UPDATE USING (public.is_business_member(user_id));
CREATE POLICY "stock_movements team delete"
  ON public.stock_movements FOR DELETE USING (public.is_business_member(user_id));

-- orders (uses business_id column)
CREATE POLICY "orders team all"
  ON public.orders FOR ALL USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

-- order_items
CREATE POLICY "order_items team all"
  ON public.order_items FOR ALL USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

-- other_income
CREATE POLICY "other_income team select"
  ON public.other_income FOR SELECT USING (public.is_business_member(user_id));
CREATE POLICY "other_income team insert"
  ON public.other_income FOR INSERT WITH CHECK (public.is_business_member(user_id));
CREATE POLICY "other_income team update"
  ON public.other_income FOR UPDATE USING (public.is_business_member(user_id));
CREATE POLICY "other_income team delete"
  ON public.other_income FOR DELETE USING (public.is_business_member(user_id));

-- savings
CREATE POLICY "savings team select"
  ON public.savings FOR SELECT USING (public.is_business_member(user_id));
CREATE POLICY "savings team insert"
  ON public.savings FOR INSERT WITH CHECK (public.is_business_member(user_id));
CREATE POLICY "savings team update"
  ON public.savings FOR UPDATE USING (public.is_business_member(user_id));
CREATE POLICY "savings team delete"
  ON public.savings FOR DELETE USING (public.is_business_member(user_id));

-- bank_accounts
CREATE POLICY "bank_accounts team select"
  ON public.bank_accounts FOR SELECT USING (public.is_business_member(user_id));
CREATE POLICY "bank_accounts team insert"
  ON public.bank_accounts FOR INSERT WITH CHECK (public.is_business_member(user_id));
CREATE POLICY "bank_accounts team update"
  ON public.bank_accounts FOR UPDATE USING (public.is_business_member(user_id));
CREATE POLICY "bank_accounts team delete"
  ON public.bank_accounts FOR DELETE USING (public.is_business_member(user_id));

-- investments
CREATE POLICY "investments team select"
  ON public.investments FOR SELECT USING (public.is_business_member(user_id));
CREATE POLICY "investments team insert"
  ON public.investments FOR INSERT WITH CHECK (public.is_business_member(user_id));
CREATE POLICY "investments team update"
  ON public.investments FOR UPDATE USING (public.is_business_member(user_id));
CREATE POLICY "investments team delete"
  ON public.investments FOR DELETE USING (public.is_business_member(user_id));

-- 4. Rewrite accept_staff_invite to stamp profile name/title/onboarding
CREATE OR REPLACE FUNCTION public.accept_staff_invite(
  _token text,
  _full_name text DEFAULT NULL,
  _position text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.staff_invites%ROWTYPE;
  user_email text;
  v_owner_name text;
  v_role text;
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
    UPDATE public.staff_invites SET status = 'expired' WHERE id = inv.id;
    RAISE EXCEPTION 'invite expired';
  END IF;

  user_email := lower(coalesce((auth.jwt() ->> 'email'), ''));
  IF user_email = '' OR user_email <> lower(inv.email) THEN
    RAISE EXCEPTION 'invite is for a different email';
  END IF;

  v_role := COALESCE(inv.permissions ->> 'role', 'staff');

  -- Make sure the invitee has a profile row, and stamp the onboarding flag
  -- + display name + position so they skip business setup entirely.
  INSERT INTO public.profiles (id, email, display_name, title, onboarding_completed)
  VALUES (
    auth.uid(),
    inv.email,
    COALESCE(NULLIF(_full_name, ''), inv.display_name, split_part(inv.email, '@', 1)),
    NULLIF(_position, ''),
    true
  )
  ON CONFLICT (id) DO UPDATE
    SET display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.profiles.display_name),
        title = COALESCE(NULLIF(EXCLUDED.title, ''), public.profiles.title),
        onboarding_completed = true;

  INSERT INTO public.staff_members (business_owner_id, staff_user_id, display_name, email, permissions, active)
  VALUES (
    inv.business_owner_id,
    auth.uid(),
    COALESCE(NULLIF(_full_name, ''), inv.display_name, split_part(inv.email, '@', 1)),
    inv.email,
    inv.permissions,
    true
  )
  ON CONFLICT (business_owner_id, staff_user_id)
    DO UPDATE SET permissions = EXCLUDED.permissions,
                  active = true,
                  display_name = EXCLUDED.display_name;

  UPDATE public.staff_invites
    SET status = 'accepted', accepted_user_id = auth.uid(), accepted_at = now()
    WHERE id = inv.id;

  -- Ensure the invitee carries the team role (drop any default business_owner)
  DELETE FROM public.user_roles WHERE user_id = auth.uid() AND role = 'business_owner';
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), v_role::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  SELECT business_name INTO v_owner_name FROM public.profiles WHERE id = inv.business_owner_id;

  -- Audit log entry for the owner
  INSERT INTO public.audit_log (user_id, action, details, performed_by, performed_by_name)
  VALUES (
    inv.business_owner_id,
    'team_invite_accepted',
    'Invite accepted by ' || COALESCE(NULLIF(_full_name, ''), inv.email),
    auth.uid(),
    COALESCE(NULLIF(_full_name, ''), inv.email)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'business_owner_id', inv.business_owner_id,
    'business_name', v_owner_name,
    'role', v_role
  );
END;
$$;

-- 5. Public-ish preview RPC: a logged-in invitee can look up the invite
-- so the accept page can show "Join {Business} as {Role}". Validates by
-- token only; does NOT mutate.
CREATE OR REPLACE FUNCTION public.preview_staff_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.staff_invites%ROWTYPE;
  v_owner_name text;
BEGIN
  SELECT * INTO inv FROM public.staff_invites WHERE token = _token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT business_name INTO v_owner_name FROM public.profiles WHERE id = inv.business_owner_id;

  RETURN jsonb_build_object(
    'found', true,
    'email', inv.email,
    'display_name', inv.display_name,
    'role', COALESCE(inv.permissions ->> 'role', 'staff'),
    'modules', COALESCE(inv.permissions -> 'modules', '[]'::jsonb),
    'status', inv.status,
    'expires_at', inv.expires_at,
    'business_owner_id', inv.business_owner_id,
    'business_name', v_owner_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_staff_invite(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_staff_invite(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid) TO authenticated;
