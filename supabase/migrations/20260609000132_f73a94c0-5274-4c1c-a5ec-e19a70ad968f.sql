
-- Business setting lives on profiles (no separate businesses table exists)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allow_sales_without_stock boolean NOT NULL DEFAULT false;

-- Storage policies for expense-receipts bucket. Files keyed by <user_id>/...
DROP POLICY IF EXISTS "expense_receipts_select_own" ON storage.objects;
DROP POLICY IF EXISTS "expense_receipts_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "expense_receipts_update_own" ON storage.objects;
DROP POLICY IF EXISTS "expense_receipts_delete_own" ON storage.objects;

CREATE POLICY "expense_receipts_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "expense_receipts_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "expense_receipts_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'expense-receipts' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'expense-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "expense_receipts_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'expense-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
