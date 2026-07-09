
-- 1) Module-aware team membership check
CREATE OR REPLACE FUNCTION public.is_business_member_module(_owner_id uuid, _module text)
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
        -- Owner-role staff or missing modules field => full access (back-compat)
        COALESCE(sm.permissions ->> 'role', 'staff') IN ('business_owner','owner','admin')
        OR sm.permissions -> 'modules' IS NULL
        OR jsonb_typeof(sm.permissions -> 'modules') <> 'array'
        OR sm.permissions -> 'modules' ? _module
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_business_member_module(uuid, text) TO authenticated, service_role;

-- 2) Replace team RLS policies to require the matching module

-- bank_accounts (savings module)
DROP POLICY IF EXISTS "bank_accounts team select" ON public.bank_accounts;
DROP POLICY IF EXISTS "bank_accounts team insert" ON public.bank_accounts;
DROP POLICY IF EXISTS "bank_accounts team update" ON public.bank_accounts;
DROP POLICY IF EXISTS "bank_accounts team delete" ON public.bank_accounts;
CREATE POLICY "bank_accounts team select" ON public.bank_accounts FOR SELECT USING (public.is_business_member_module(user_id, 'savings'));
CREATE POLICY "bank_accounts team insert" ON public.bank_accounts FOR INSERT WITH CHECK (public.is_business_member_module(user_id, 'savings'));
CREATE POLICY "bank_accounts team update" ON public.bank_accounts FOR UPDATE USING (public.is_business_member_module(user_id, 'savings')) WITH CHECK (public.is_business_member_module(user_id, 'savings'));
CREATE POLICY "bank_accounts team delete" ON public.bank_accounts FOR DELETE USING (public.is_business_member_module(user_id, 'savings'));

-- customers
DROP POLICY IF EXISTS "customers team select" ON public.customers;
DROP POLICY IF EXISTS "customers team insert" ON public.customers;
DROP POLICY IF EXISTS "customers team update" ON public.customers;
DROP POLICY IF EXISTS "customers team delete" ON public.customers;
CREATE POLICY "customers team select" ON public.customers FOR SELECT USING (public.is_business_member_module(user_id, 'customers'));
CREATE POLICY "customers team insert" ON public.customers FOR INSERT WITH CHECK (public.is_business_member_module(user_id, 'customers'));
CREATE POLICY "customers team update" ON public.customers FOR UPDATE USING (public.is_business_member_module(user_id, 'customers')) WITH CHECK (public.is_business_member_module(user_id, 'customers'));
CREATE POLICY "customers team delete" ON public.customers FOR DELETE USING (public.is_business_member_module(user_id, 'customers'));

-- expenses
DROP POLICY IF EXISTS "expenses team select" ON public.expenses;
DROP POLICY IF EXISTS "expenses team insert" ON public.expenses;
DROP POLICY IF EXISTS "expenses team update" ON public.expenses;
DROP POLICY IF EXISTS "expenses team delete" ON public.expenses;
CREATE POLICY "expenses team select" ON public.expenses FOR SELECT USING (public.is_business_member_module(user_id, 'expenses'));
CREATE POLICY "expenses team insert" ON public.expenses FOR INSERT WITH CHECK (public.is_business_member_module(user_id, 'expenses'));
CREATE POLICY "expenses team update" ON public.expenses FOR UPDATE USING (public.is_business_member_module(user_id, 'expenses')) WITH CHECK (public.is_business_member_module(user_id, 'expenses'));
CREATE POLICY "expenses team delete" ON public.expenses FOR DELETE USING (public.is_business_member_module(user_id, 'expenses'));

-- investments (savings module)
DROP POLICY IF EXISTS "investments team select" ON public.investments;
DROP POLICY IF EXISTS "investments team insert" ON public.investments;
DROP POLICY IF EXISTS "investments team update" ON public.investments;
DROP POLICY IF EXISTS "investments team delete" ON public.investments;
CREATE POLICY "investments team select" ON public.investments FOR SELECT USING (public.is_business_member_module(user_id, 'savings'));
CREATE POLICY "investments team insert" ON public.investments FOR INSERT WITH CHECK (public.is_business_member_module(user_id, 'savings'));
CREATE POLICY "investments team update" ON public.investments FOR UPDATE USING (public.is_business_member_module(user_id, 'savings')) WITH CHECK (public.is_business_member_module(user_id, 'savings'));
CREATE POLICY "investments team delete" ON public.investments FOR DELETE USING (public.is_business_member_module(user_id, 'savings'));

-- other_income
DROP POLICY IF EXISTS "other_income team select" ON public.other_income;
DROP POLICY IF EXISTS "other_income team insert" ON public.other_income;
DROP POLICY IF EXISTS "other_income team update" ON public.other_income;
DROP POLICY IF EXISTS "other_income team delete" ON public.other_income;
CREATE POLICY "other_income team select" ON public.other_income FOR SELECT USING (public.is_business_member_module(user_id, 'other_income'));
CREATE POLICY "other_income team insert" ON public.other_income FOR INSERT WITH CHECK (public.is_business_member_module(user_id, 'other_income'));
CREATE POLICY "other_income team update" ON public.other_income FOR UPDATE USING (public.is_business_member_module(user_id, 'other_income')) WITH CHECK (public.is_business_member_module(user_id, 'other_income'));
CREATE POLICY "other_income team delete" ON public.other_income FOR DELETE USING (public.is_business_member_module(user_id, 'other_income'));

-- products
DROP POLICY IF EXISTS "products team select" ON public.products;
DROP POLICY IF EXISTS "products team insert" ON public.products;
DROP POLICY IF EXISTS "products team update" ON public.products;
DROP POLICY IF EXISTS "products team delete" ON public.products;
CREATE POLICY "products team select" ON public.products FOR SELECT USING (public.is_business_member_module(user_id, 'products'));
CREATE POLICY "products team insert" ON public.products FOR INSERT WITH CHECK (public.is_business_member_module(user_id, 'products'));
CREATE POLICY "products team update" ON public.products FOR UPDATE USING (public.is_business_member_module(user_id, 'products')) WITH CHECK (public.is_business_member_module(user_id, 'products'));
CREATE POLICY "products team delete" ON public.products FOR DELETE USING (public.is_business_member_module(user_id, 'products'));

-- restocks (inventory)
DROP POLICY IF EXISTS "restocks team select" ON public.restocks;
DROP POLICY IF EXISTS "restocks team insert" ON public.restocks;
DROP POLICY IF EXISTS "restocks team update" ON public.restocks;
DROP POLICY IF EXISTS "restocks team delete" ON public.restocks;
CREATE POLICY "restocks team select" ON public.restocks FOR SELECT USING (public.is_business_member_module(user_id, 'inventory'));
CREATE POLICY "restocks team insert" ON public.restocks FOR INSERT WITH CHECK (public.is_business_member_module(user_id, 'inventory'));
CREATE POLICY "restocks team update" ON public.restocks FOR UPDATE USING (public.is_business_member_module(user_id, 'inventory')) WITH CHECK (public.is_business_member_module(user_id, 'inventory'));
CREATE POLICY "restocks team delete" ON public.restocks FOR DELETE USING (public.is_business_member_module(user_id, 'inventory'));

-- sale_documents (sales)
DROP POLICY IF EXISTS "sale_documents team select" ON public.sale_documents;
DROP POLICY IF EXISTS "sale_documents team insert" ON public.sale_documents;
DROP POLICY IF EXISTS "sale_documents team update" ON public.sale_documents;
DROP POLICY IF EXISTS "sale_documents team delete" ON public.sale_documents;
CREATE POLICY "sale_documents team select" ON public.sale_documents FOR SELECT USING (public.is_business_member_module(user_id, 'sales'));
CREATE POLICY "sale_documents team insert" ON public.sale_documents FOR INSERT WITH CHECK (public.is_business_member_module(user_id, 'sales'));
CREATE POLICY "sale_documents team update" ON public.sale_documents FOR UPDATE USING (public.is_business_member_module(user_id, 'sales')) WITH CHECK (public.is_business_member_module(user_id, 'sales'));
CREATE POLICY "sale_documents team delete" ON public.sale_documents FOR DELETE USING (public.is_business_member_module(user_id, 'sales'));

-- sale_items (sales)
DROP POLICY IF EXISTS "sale_items team select" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items team insert" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items team update" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items team delete" ON public.sale_items;
CREATE POLICY "sale_items team select" ON public.sale_items FOR SELECT USING (public.is_business_member_module(user_id, 'sales'));
CREATE POLICY "sale_items team insert" ON public.sale_items FOR INSERT WITH CHECK (public.is_business_member_module(user_id, 'sales'));
CREATE POLICY "sale_items team update" ON public.sale_items FOR UPDATE USING (public.is_business_member_module(user_id, 'sales')) WITH CHECK (public.is_business_member_module(user_id, 'sales'));
CREATE POLICY "sale_items team delete" ON public.sale_items FOR DELETE USING (public.is_business_member_module(user_id, 'sales'));

-- sales
DROP POLICY IF EXISTS "sales team select" ON public.sales;
DROP POLICY IF EXISTS "sales team insert" ON public.sales;
DROP POLICY IF EXISTS "sales team update" ON public.sales;
DROP POLICY IF EXISTS "sales team delete" ON public.sales;
CREATE POLICY "sales team select" ON public.sales FOR SELECT USING (public.is_business_member_module(user_id, 'sales'));
CREATE POLICY "sales team insert" ON public.sales FOR INSERT WITH CHECK (public.is_business_member_module(user_id, 'sales'));
CREATE POLICY "sales team update" ON public.sales FOR UPDATE USING (public.is_business_member_module(user_id, 'sales')) WITH CHECK (public.is_business_member_module(user_id, 'sales'));
CREATE POLICY "sales team delete" ON public.sales FOR DELETE USING (public.is_business_member_module(user_id, 'sales'));

-- savings
DROP POLICY IF EXISTS "savings team select" ON public.savings;
DROP POLICY IF EXISTS "savings team insert" ON public.savings;
DROP POLICY IF EXISTS "savings team update" ON public.savings;
DROP POLICY IF EXISTS "savings team delete" ON public.savings;
CREATE POLICY "savings team select" ON public.savings FOR SELECT USING (public.is_business_member_module(user_id, 'savings'));
CREATE POLICY "savings team insert" ON public.savings FOR INSERT WITH CHECK (public.is_business_member_module(user_id, 'savings'));
CREATE POLICY "savings team update" ON public.savings FOR UPDATE USING (public.is_business_member_module(user_id, 'savings')) WITH CHECK (public.is_business_member_module(user_id, 'savings'));
CREATE POLICY "savings team delete" ON public.savings FOR DELETE USING (public.is_business_member_module(user_id, 'savings'));

-- stock_movements (inventory)
DROP POLICY IF EXISTS "stock_movements team select" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements team insert" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements team update" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements team delete" ON public.stock_movements;
CREATE POLICY "stock_movements team select" ON public.stock_movements FOR SELECT USING (public.is_business_member_module(user_id, 'inventory'));
CREATE POLICY "stock_movements team insert" ON public.stock_movements FOR INSERT WITH CHECK (public.is_business_member_module(user_id, 'inventory'));
CREATE POLICY "stock_movements team update" ON public.stock_movements FOR UPDATE USING (public.is_business_member_module(user_id, 'inventory')) WITH CHECK (public.is_business_member_module(user_id, 'inventory'));
CREATE POLICY "stock_movements team delete" ON public.stock_movements FOR DELETE USING (public.is_business_member_module(user_id, 'inventory'));

-- orders + order_items (orders)
DROP POLICY IF EXISTS "orders team select" ON public.orders;
DROP POLICY IF EXISTS "orders team insert" ON public.orders;
DROP POLICY IF EXISTS "orders team update" ON public.orders;
CREATE POLICY "orders team select" ON public.orders FOR SELECT USING (public.is_business_member_module(business_id, 'orders'));
CREATE POLICY "orders team insert" ON public.orders FOR INSERT WITH CHECK (public.is_business_member_module(business_id, 'orders'));
CREATE POLICY "orders team update" ON public.orders FOR UPDATE USING (public.is_business_member_module(business_id, 'orders')) WITH CHECK (public.is_business_member_module(business_id, 'orders'));

DROP POLICY IF EXISTS "order_items team all" ON public.order_items;
CREATE POLICY "order_items team all" ON public.order_items FOR ALL USING (public.is_business_member_module(business_id, 'orders')) WITH CHECK (public.is_business_member_module(business_id, 'orders'));

-- 3) staff_invites: prevent invitee from modifying permissions/role fields during accept
DROP POLICY IF EXISTS "invites invitee accept" ON public.staff_invites;
CREATE POLICY "invites invitee accept" ON public.staff_invites
FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND lower(email) = lower(COALESCE((auth.jwt() ->> 'email'), ''))
  AND status = 'pending'
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND lower(email) = lower(COALESCE((auth.jwt() ->> 'email'), ''))
  AND status = ANY (ARRAY['accepted','declined'])
  AND accepted_user_id = auth.uid()
  AND permissions = (SELECT si.permissions FROM public.staff_invites si WHERE si.id = staff_invites.id)
  AND email = (SELECT si.email FROM public.staff_invites si WHERE si.id = staff_invites.id)
  AND business_owner_id = (SELECT si.business_owner_id FROM public.staff_invites si WHERE si.id = staff_invites.id)
  AND token = (SELECT si.token FROM public.staff_invites si WHERE si.id = staff_invites.id)
  AND expires_at = (SELECT si.expires_at FROM public.staff_invites si WHERE si.id = staff_invites.id)
);

-- 4) Pin search_path on remaining helper functions
ALTER FUNCTION public.gen_tracking_code() SET search_path = public;
ALTER FUNCTION public.slugify(text) SET search_path = public;
ALTER FUNCTION public.ensure_unique_store_slug(text, uuid) SET search_path = public;
