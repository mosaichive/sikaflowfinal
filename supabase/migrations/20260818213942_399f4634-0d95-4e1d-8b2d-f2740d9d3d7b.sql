ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monthly_statement_enabled boolean NOT NULL DEFAULT true;

GRANT SELECT ON public.statement_deliveries TO authenticated;

DROP POLICY IF EXISTS "Owners view own statement deliveries" ON public.statement_deliveries;
CREATE POLICY "Owners view own statement deliveries"
ON public.statement_deliveries
FOR SELECT
TO authenticated
USING (business_id = auth.uid());