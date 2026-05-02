-- Create sale_documents table for invoices and receipts
CREATE TABLE IF NOT EXISTS public.sale_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('invoice', 'receipt')),
  document_number text NOT NULL,
  sale_date timestamp with time zone NOT NULL DEFAULT now(),
  payment_status text NOT NULL DEFAULT 'paid',
  amount_ghs numeric NOT NULL DEFAULT 0,
  amount_paid_ghs numeric NOT NULL DEFAULT 0,
  balance_ghs numeric NOT NULL DEFAULT 0,
  customer_name text,
  customer_phone text,
  seller_name text,
  issued_by uuid,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  issued_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT sale_documents_sale_kind_unique UNIQUE (sale_id, kind)
);

CREATE INDEX IF NOT EXISTS sale_documents_user_id_idx ON public.sale_documents (user_id);
CREATE INDEX IF NOT EXISTS sale_documents_sale_id_idx ON public.sale_documents (sale_id);

-- Enable RLS
ALTER TABLE public.sale_documents ENABLE ROW LEVEL SECURITY;

-- Owner-only access (matches the rest of the schema's pattern)
CREATE POLICY "sale_documents select own"
  ON public.sale_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "sale_documents insert own"
  ON public.sale_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sale_documents update own"
  ON public.sale_documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "sale_documents delete own"
  ON public.sale_documents FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER sale_documents_set_updated_at
  BEFORE UPDATE ON public.sale_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Auto-generate document_number per user and kind (INV-00001 / RCT-00001)
CREATE OR REPLACE FUNCTION public.set_sale_document_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num int;
  prefix text;
BEGIN
  IF NEW.document_number IS NULL OR NEW.document_number = '' THEN
    prefix := CASE WHEN NEW.kind = 'invoice' THEN 'INV' ELSE 'RCT' END;
    SELECT COALESCE(MAX(NULLIF(regexp_replace(document_number, '\D', '', 'g'), '')::int), 0) + 1
      INTO next_num
      FROM public.sale_documents
      WHERE user_id = NEW.user_id AND kind = NEW.kind;
    NEW.document_number := prefix || '-' || LPAD(next_num::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sale_documents_set_number
  BEFORE INSERT ON public.sale_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_sale_document_number();