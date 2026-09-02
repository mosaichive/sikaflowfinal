-- Align live policies and PostgREST cache with the current business_id-scoped schema.
-- This migration only updates policies/indexes; it does not rewrite application data.

DROP INDEX IF EXISTS public.sale_documents_user_id_idx;

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_accounts team select" ON public.bank_accounts;
DROP POLICY IF EXISTS "bank_accounts team insert" ON public.bank_accounts;
DROP POLICY IF EXISTS "bank_accounts team update" ON public.bank_accounts;
DROP POLICY IF EXISTS "bank_accounts team delete" ON public.bank_accounts;

CREATE POLICY "bank_accounts team select"
ON public.bank_accounts
FOR SELECT TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND public.staff_member_has_module(
    COALESCE((SELECT b.owner_user_id FROM public.businesses b WHERE b.id = bank_accounts.business_id), bank_accounts.user_id),
    'savings'
  )
);

CREATE POLICY "bank_accounts team insert"
ON public.bank_accounts
FOR INSERT TO authenticated
WITH CHECK (
  business_id = public.get_user_business_id(auth.uid())
  AND public.staff_member_has_module(
    COALESCE((SELECT b.owner_user_id FROM public.businesses b WHERE b.id = bank_accounts.business_id), bank_accounts.user_id),
    'savings'
  )
);

CREATE POLICY "bank_accounts team update"
ON public.bank_accounts
FOR UPDATE TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND public.staff_member_has_module(
    COALESCE((SELECT b.owner_user_id FROM public.businesses b WHERE b.id = bank_accounts.business_id), bank_accounts.user_id),
    'savings'
  )
)
WITH CHECK (
  business_id = public.get_user_business_id(auth.uid())
  AND public.staff_member_has_module(
    COALESCE((SELECT b.owner_user_id FROM public.businesses b WHERE b.id = bank_accounts.business_id), bank_accounts.user_id),
    'savings'
  )
);

CREATE POLICY "bank_accounts team delete"
ON public.bank_accounts
FOR DELETE TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND public.staff_member_has_module(
    COALESCE((SELECT b.owner_user_id FROM public.businesses b WHERE b.id = bank_accounts.business_id), bank_accounts.user_id),
    'savings'
  )
);

DROP POLICY IF EXISTS "sale_documents team select" ON public.sale_documents;
DROP POLICY IF EXISTS "sale_documents team insert" ON public.sale_documents;
DROP POLICY IF EXISTS "sale_documents team update" ON public.sale_documents;
DROP POLICY IF EXISTS "sale_documents team delete" ON public.sale_documents;

CREATE POLICY "sale_documents team select"
ON public.sale_documents
FOR SELECT TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND public.staff_member_has_module(
    COALESCE((SELECT b.owner_user_id FROM public.businesses b WHERE b.id = sale_documents.business_id), business_id),
    'sales'
  )
);

CREATE POLICY "sale_documents team insert"
ON public.sale_documents
FOR INSERT TO authenticated
WITH CHECK (
  business_id = public.get_user_business_id(auth.uid())
  AND issued_by = auth.uid()
  AND public.staff_member_has_module(
    COALESCE((SELECT b.owner_user_id FROM public.businesses b WHERE b.id = sale_documents.business_id), business_id),
    'sales'
  )
);

CREATE POLICY "sale_documents team update"
ON public.sale_documents
FOR UPDATE TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND public.staff_member_has_module(
    COALESCE((SELECT b.owner_user_id FROM public.businesses b WHERE b.id = sale_documents.business_id), business_id),
    'sales'
  )
)
WITH CHECK (
  business_id = public.get_user_business_id(auth.uid())
  AND public.staff_member_has_module(
    COALESCE((SELECT b.owner_user_id FROM public.businesses b WHERE b.id = sale_documents.business_id), business_id),
    'sales'
  )
);

CREATE POLICY "sale_documents team delete"
ON public.sale_documents
FOR DELETE TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND public.staff_member_has_module(
    COALESCE((SELECT b.owner_user_id FROM public.businesses b WHERE b.id = sale_documents.business_id), business_id),
    'sales'
  )
);

NOTIFY pgrst, 'reload schema';
