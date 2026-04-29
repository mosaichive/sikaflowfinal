
-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock NUMERIC(12,2) NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC(12,2) NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products select own" ON public.products FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "products insert own" ON public.products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "products update own" ON public.products FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "products delete own" ON public.products FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_products_user ON public.products(user_id);

-- Sales
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  customer_name TEXT,
  note TEXT,
  sale_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales select own" ON public.sales FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sales insert own" ON public.sales FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sales update own" ON public.sales FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "sales delete own" ON public.sales FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_sales_user_date ON public.sales(user_id, sale_date DESC);

-- Sale items
CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sale_items select own" ON public.sale_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sale_items insert own" ON public.sale_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sale_items update own" ON public.sale_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "sale_items delete own" ON public.sale_items FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX idx_sale_items_user ON public.sale_items(user_id);

-- Expenses
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'Other',
  note TEXT,
  expense_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses select own" ON public.expenses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "expenses insert own" ON public.expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "expenses update own" ON public.expenses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "expenses delete own" ON public.expenses FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_expenses_user_date ON public.expenses(user_id, expense_date DESC);

-- updated_at triggers
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_sales_updated BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_expenses_updated BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Stock adjustment trigger
CREATE OR REPLACE FUNCTION public.adjust_stock_on_sale_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.product_id IS NOT NULL THEN
    UPDATE public.products SET stock = stock - NEW.quantity WHERE id = NEW.product_id;
  ELSIF TG_OP = 'DELETE' AND OLD.product_id IS NOT NULL THEN
    UPDATE public.products SET stock = stock + OLD.quantity WHERE id = OLD.product_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sale_items_stock
AFTER INSERT OR DELETE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.adjust_stock_on_sale_item();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
