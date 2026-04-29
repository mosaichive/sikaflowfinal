-- Currency on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GHS';

-- Sales additions
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_number text;

-- Stock movement log
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  change numeric NOT NULL,
  reason text NOT NULL DEFAULT 'adjustment', -- received | sold | adjustment | damage | return
  note text,
  reference_id uuid, -- e.g. sale_id
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_movements select own"
ON public.stock_movements FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "stock_movements insert own"
ON public.stock_movements FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_user_product
  ON public.stock_movements (user_id, product_id, created_at DESC);

-- Auto-log sale items as 'sold' movements
CREATE OR REPLACE FUNCTION public.log_stock_movement_on_sale_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.product_id IS NOT NULL THEN
    INSERT INTO public.stock_movements (user_id, product_id, change, reason, reference_id, note)
    VALUES (NEW.user_id, NEW.product_id, -NEW.quantity, 'sold', NEW.sale_id, NEW.product_name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_stock_movement_on_sale_item ON public.sale_items;
CREATE TRIGGER trg_log_stock_movement_on_sale_item
AFTER INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.log_stock_movement_on_sale_item();

-- Auto-generate sequential invoice number per user
CREATE OR REPLACE FUNCTION public.set_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num int;
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\D', '', 'g'), '')::int), 0) + 1
      INTO next_num
      FROM public.sales WHERE user_id = NEW.user_id;
    NEW.invoice_number := 'INV-' || LPAD(next_num::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_invoice_number ON public.sales;
CREATE TRIGGER trg_set_invoice_number
BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.set_invoice_number();

-- Backfill existing sales without invoice numbers
WITH numbered AS (
  SELECT id, user_id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) AS rn
  FROM public.sales WHERE invoice_number IS NULL
)
UPDATE public.sales s
SET invoice_number = 'INV-' || LPAD(numbered.rn::text, 5, '0')
FROM numbered WHERE s.id = numbered.id;

REVOKE EXECUTE ON FUNCTION public.log_stock_movement_on_sale_item() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_invoice_number() FROM PUBLIC, anon;