ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cashier';

CREATE OR REPLACE FUNCTION public.staff_member_has_module(_owner_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.business_owner_id = _owner_id
      AND sm.staff_user_id = auth.uid()
      AND sm.active = true
      AND (
        sm.permissions ->> 'role' = 'admin'
        OR (
          jsonb_typeof(sm.permissions -> 'modules') = 'array'
          AND (sm.permissions -> 'modules') ? _module
        )
        OR (
          jsonb_typeof(sm.permissions -> 'modules') IS DISTINCT FROM 'array'
          AND (
            (_module = 'dashboard')
            OR (sm.permissions ->> 'role' = 'manager' AND _module = ANY (ARRAY['sales','products','inventory','customers','orders','other_income','expenses','savings','reports','announcements']))
            OR (sm.permissions ->> 'role' = 'salesperson' AND _module = ANY (ARRAY['sales','customers','orders','announcements']))
            OR (sm.permissions ->> 'role' = 'cashier' AND _module = ANY (ARRAY['sales','customers','announcements']))
            OR (sm.permissions ->> 'role' = 'distributor' AND _module = ANY (ARRAY['inventory','orders','announcements']))
            OR (sm.permissions ->> 'role' = 'staff' AND _module = 'announcements')
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.staff_member_has_any_module(_owner_id uuid, _modules text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(_modules) AS module_name
    WHERE public.staff_member_has_module(_owner_id, module_name)
  );
$$;

GRANT EXECUTE ON FUNCTION public.staff_member_has_module(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_member_has_any_module(uuid, text[]) TO authenticated;

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff members owner manage" ON public.staff_members;
CREATE POLICY "staff members owner manage"
ON public.staff_members
FOR ALL
TO authenticated
USING (business_owner_id = auth.uid())
WITH CHECK (business_owner_id = auth.uid());

DROP POLICY IF EXISTS "staff members read own membership" ON public.staff_members;
CREATE POLICY "staff members read own membership"
ON public.staff_members
FOR SELECT
TO authenticated
USING (staff_user_id = auth.uid());

ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff invites owner manage" ON public.staff_invites;
CREATE POLICY "staff invites owner manage"
ON public.staff_invites
FOR ALL
TO authenticated
USING (business_owner_id = auth.uid())
WITH CHECK (business_owner_id = auth.uid());

DROP POLICY IF EXISTS "products team select" ON public.products;
CREATE POLICY "products team select"
ON public.products FOR SELECT
USING (public.staff_member_has_any_module(user_id, ARRAY['dashboard','products','inventory','sales','reports']));
DROP POLICY IF EXISTS "products team insert" ON public.products;
CREATE POLICY "products team insert"
ON public.products FOR INSERT
WITH CHECK (public.staff_member_has_any_module(user_id, ARRAY['products','inventory']));
DROP POLICY IF EXISTS "products team update" ON public.products;
CREATE POLICY "products team update"
ON public.products FOR UPDATE
USING (public.staff_member_has_any_module(user_id, ARRAY['products','inventory']))
WITH CHECK (public.staff_member_has_any_module(user_id, ARRAY['products','inventory']));
DROP POLICY IF EXISTS "products team delete" ON public.products;
CREATE POLICY "products team delete"
ON public.products FOR DELETE
USING (public.staff_member_has_any_module(user_id, ARRAY['products','inventory']));

DROP POLICY IF EXISTS "sales team select" ON public.sales;
CREATE POLICY "sales team select"
ON public.sales FOR SELECT
USING (public.staff_member_has_any_module(user_id, ARRAY['dashboard','sales','reports']));
DROP POLICY IF EXISTS "sales team insert" ON public.sales;
CREATE POLICY "sales team insert"
ON public.sales FOR INSERT
WITH CHECK (public.staff_member_has_module(user_id, 'sales'));
DROP POLICY IF EXISTS "sales team update" ON public.sales;
CREATE POLICY "sales team update"
ON public.sales FOR UPDATE
USING (public.staff_member_has_module(user_id, 'sales'))
WITH CHECK (public.staff_member_has_module(user_id, 'sales'));
DROP POLICY IF EXISTS "sales team delete" ON public.sales;
CREATE POLICY "sales team delete"
ON public.sales FOR DELETE
USING (public.staff_member_has_module(user_id, 'sales'));

DROP POLICY IF EXISTS "sale_items team select" ON public.sale_items;
CREATE POLICY "sale_items team select"
ON public.sale_items FOR SELECT
USING (public.staff_member_has_any_module(user_id, ARRAY['dashboard','sales','reports']));
DROP POLICY IF EXISTS "sale_items team insert" ON public.sale_items;
CREATE POLICY "sale_items team insert"
ON public.sale_items FOR INSERT
WITH CHECK (public.staff_member_has_module(user_id, 'sales'));
DROP POLICY IF EXISTS "sale_items team update" ON public.sale_items;
CREATE POLICY "sale_items team update"
ON public.sale_items FOR UPDATE
USING (public.staff_member_has_module(user_id, 'sales'))
WITH CHECK (public.staff_member_has_module(user_id, 'sales'));
DROP POLICY IF EXISTS "sale_items team delete" ON public.sale_items;
CREATE POLICY "sale_items team delete"
ON public.sale_items FOR DELETE
USING (public.staff_member_has_module(user_id, 'sales'));

DROP POLICY IF EXISTS "sale_documents team select" ON public.sale_documents;
CREATE POLICY "sale_documents team select"
ON public.sale_documents FOR SELECT
USING (public.staff_member_has_any_module(user_id, ARRAY['dashboard','sales','reports']));
DROP POLICY IF EXISTS "sale_documents team insert" ON public.sale_documents;
CREATE POLICY "sale_documents team insert"
ON public.sale_documents FOR INSERT
WITH CHECK (public.staff_member_has_module(user_id, 'sales'));
DROP POLICY IF EXISTS "sale_documents team update" ON public.sale_documents;
CREATE POLICY "sale_documents team update"
ON public.sale_documents FOR UPDATE
USING (public.staff_member_has_module(user_id, 'sales'))
WITH CHECK (public.staff_member_has_module(user_id, 'sales'));
DROP POLICY IF EXISTS "sale_documents team delete" ON public.sale_documents;
CREATE POLICY "sale_documents team delete"
ON public.sale_documents FOR DELETE
USING (public.staff_member_has_module(user_id, 'sales'));

DROP POLICY IF EXISTS "customers team select" ON public.customers;
CREATE POLICY "customers team select"
ON public.customers FOR SELECT
USING (public.staff_member_has_any_module(user_id, ARRAY['sales','customers','orders','reports']));
DROP POLICY IF EXISTS "customers team insert" ON public.customers;
CREATE POLICY "customers team insert"
ON public.customers FOR INSERT
WITH CHECK (public.staff_member_has_any_module(user_id, ARRAY['sales','customers','orders']));
DROP POLICY IF EXISTS "customers team update" ON public.customers;
CREATE POLICY "customers team update"
ON public.customers FOR UPDATE
USING (public.staff_member_has_any_module(user_id, ARRAY['sales','customers','orders']))
WITH CHECK (public.staff_member_has_any_module(user_id, ARRAY['sales','customers','orders']));
DROP POLICY IF EXISTS "customers team delete" ON public.customers;
CREATE POLICY "customers team delete"
ON public.customers FOR DELETE
USING (public.staff_member_has_module(user_id, 'customers'));

DROP POLICY IF EXISTS "expenses team select" ON public.expenses;
CREATE POLICY "expenses team select"
ON public.expenses FOR SELECT
USING (public.staff_member_has_any_module(user_id, ARRAY['dashboard','expenses','reports']));
DROP POLICY IF EXISTS "expenses team insert" ON public.expenses;
CREATE POLICY "expenses team insert"
ON public.expenses FOR INSERT
WITH CHECK (public.staff_member_has_module(user_id, 'expenses'));
DROP POLICY IF EXISTS "expenses team update" ON public.expenses;
CREATE POLICY "expenses team update"
ON public.expenses FOR UPDATE
USING (public.staff_member_has_module(user_id, 'expenses'))
WITH CHECK (public.staff_member_has_module(user_id, 'expenses'));
DROP POLICY IF EXISTS "expenses team delete" ON public.expenses;
CREATE POLICY "expenses team delete"
ON public.expenses FOR DELETE
USING (public.staff_member_has_module(user_id, 'expenses'));

DROP POLICY IF EXISTS "other_income team select" ON public.other_income;
CREATE POLICY "other_income team select"
ON public.other_income FOR SELECT
USING (public.staff_member_has_any_module(user_id, ARRAY['dashboard','other_income','reports']));
DROP POLICY IF EXISTS "other_income team insert" ON public.other_income;
CREATE POLICY "other_income team insert"
ON public.other_income FOR INSERT
WITH CHECK (public.staff_member_has_module(user_id, 'other_income'));
DROP POLICY IF EXISTS "other_income team update" ON public.other_income;
CREATE POLICY "other_income team update"
ON public.other_income FOR UPDATE
USING (public.staff_member_has_module(user_id, 'other_income'))
WITH CHECK (public.staff_member_has_module(user_id, 'other_income'));
DROP POLICY IF EXISTS "other_income team delete" ON public.other_income;
CREATE POLICY "other_income team delete"
ON public.other_income FOR DELETE
USING (public.staff_member_has_module(user_id, 'other_income'));

DROP POLICY IF EXISTS "savings team select" ON public.savings;
CREATE POLICY "savings team select"
ON public.savings FOR SELECT
USING (public.staff_member_has_any_module(user_id, ARRAY['dashboard','savings','reports']));
DROP POLICY IF EXISTS "savings team insert" ON public.savings;
CREATE POLICY "savings team insert"
ON public.savings FOR INSERT
WITH CHECK (public.staff_member_has_module(user_id, 'savings'));
DROP POLICY IF EXISTS "savings team update" ON public.savings;
CREATE POLICY "savings team update"
ON public.savings FOR UPDATE
USING (public.staff_member_has_module(user_id, 'savings'))
WITH CHECK (public.staff_member_has_module(user_id, 'savings'));
DROP POLICY IF EXISTS "savings team delete" ON public.savings;
CREATE POLICY "savings team delete"
ON public.savings FOR DELETE
USING (public.staff_member_has_module(user_id, 'savings'));

DROP POLICY IF EXISTS "restocks team select" ON public.restocks;
CREATE POLICY "restocks team select"
ON public.restocks FOR SELECT TO authenticated
USING (public.staff_member_has_any_module(user_id, ARRAY['dashboard','inventory','products','reports']));
DROP POLICY IF EXISTS "restocks team insert" ON public.restocks;
CREATE POLICY "restocks team insert"
ON public.restocks FOR INSERT TO authenticated
WITH CHECK (public.staff_member_has_module(user_id, 'inventory'));
DROP POLICY IF EXISTS "restocks team update" ON public.restocks;
CREATE POLICY "restocks team update"
ON public.restocks FOR UPDATE TO authenticated
USING (public.staff_member_has_module(user_id, 'inventory'))
WITH CHECK (public.staff_member_has_module(user_id, 'inventory'));
DROP POLICY IF EXISTS "restocks team delete" ON public.restocks;
CREATE POLICY "restocks team delete"
ON public.restocks FOR DELETE TO authenticated
USING (public.staff_member_has_module(user_id, 'inventory'));

DROP POLICY IF EXISTS "stock_movements team select" ON public.stock_movements;
CREATE POLICY "stock_movements team select"
ON public.stock_movements FOR SELECT
USING (public.staff_member_has_any_module(user_id, ARRAY['dashboard','inventory','products','reports']));
DROP POLICY IF EXISTS "stock_movements team insert" ON public.stock_movements;
CREATE POLICY "stock_movements team insert"
ON public.stock_movements FOR INSERT
WITH CHECK (public.staff_member_has_module(user_id, 'inventory'));
DROP POLICY IF EXISTS "stock_movements team update" ON public.stock_movements;
CREATE POLICY "stock_movements team update"
ON public.stock_movements FOR UPDATE
USING (public.staff_member_has_module(user_id, 'inventory'))
WITH CHECK (public.staff_member_has_module(user_id, 'inventory'));
DROP POLICY IF EXISTS "stock_movements team delete" ON public.stock_movements;
CREATE POLICY "stock_movements team delete"
ON public.stock_movements FOR DELETE
USING (public.staff_member_has_module(user_id, 'inventory'));

DROP POLICY IF EXISTS "orders team all" ON public.orders;
CREATE POLICY "orders team all"
ON public.orders FOR ALL
USING (public.staff_member_has_module(business_id, 'orders'))
WITH CHECK (public.staff_member_has_module(business_id, 'orders'));

DROP POLICY IF EXISTS "order_items team all" ON public.order_items;
CREATE POLICY "order_items team all"
ON public.order_items FOR ALL
USING (public.staff_member_has_module(business_id, 'orders'))
WITH CHECK (public.staff_member_has_module(business_id, 'orders'));

DROP POLICY IF EXISTS "bank_accounts team select" ON public.bank_accounts;
CREATE POLICY "bank_accounts team select"
ON public.bank_accounts FOR SELECT
USING (public.staff_member_has_module(user_id, 'savings'));
DROP POLICY IF EXISTS "bank_accounts team insert" ON public.bank_accounts;
CREATE POLICY "bank_accounts team insert"
ON public.bank_accounts FOR INSERT
WITH CHECK (public.staff_member_has_module(user_id, 'savings'));
DROP POLICY IF EXISTS "bank_accounts team update" ON public.bank_accounts;
CREATE POLICY "bank_accounts team update"
ON public.bank_accounts FOR UPDATE
USING (public.staff_member_has_module(user_id, 'savings'))
WITH CHECK (public.staff_member_has_module(user_id, 'savings'));
DROP POLICY IF EXISTS "bank_accounts team delete" ON public.bank_accounts;
CREATE POLICY "bank_accounts team delete"
ON public.bank_accounts FOR DELETE
USING (public.staff_member_has_module(user_id, 'savings'));

DROP POLICY IF EXISTS "investments team select" ON public.investments;
CREATE POLICY "investments team select"
ON public.investments FOR SELECT
USING (public.staff_member_has_any_module(user_id, ARRAY['dashboard','savings','reports']));
DROP POLICY IF EXISTS "investments team insert" ON public.investments;
CREATE POLICY "investments team insert"
ON public.investments FOR INSERT
WITH CHECK (public.staff_member_has_module(user_id, 'savings'));
DROP POLICY IF EXISTS "investments team update" ON public.investments;
CREATE POLICY "investments team update"
ON public.investments FOR UPDATE
USING (public.staff_member_has_module(user_id, 'savings'))
WITH CHECK (public.staff_member_has_module(user_id, 'savings'));
DROP POLICY IF EXISTS "investments team delete" ON public.investments;
CREATE POLICY "investments team delete"
ON public.investments FOR DELETE
USING (public.staff_member_has_module(user_id, 'savings'));
