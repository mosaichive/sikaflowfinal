
-- Recreate triggers that were dropped. The functions still exist.

-- Sale item -> stock movement (deduct stock)
DROP TRIGGER IF EXISTS trg_handle_sale_item_stock_ledger ON public.sale_items;
CREATE TRIGGER trg_handle_sale_item_stock_ledger
AFTER INSERT OR UPDATE OR DELETE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.handle_sale_item_stock_ledger();

-- Restock -> stock movement (add stock; opening_stock reason if flagged)
DROP TRIGGER IF EXISTS trg_handle_restock_stock_ledger ON public.restocks;
CREATE TRIGGER trg_handle_restock_stock_ledger
AFTER INSERT OR UPDATE OR DELETE ON public.restocks
FOR EACH ROW EXECUTE FUNCTION public.handle_restock_stock_ledger();

-- Auto-set sale invoice number
DROP TRIGGER IF EXISTS trg_set_invoice_number ON public.sales;
CREATE TRIGGER trg_set_invoice_number
BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.set_invoice_number();

-- updated_at maintenance
DROP TRIGGER IF EXISTS trg_sales_updated_at ON public.sales;
CREATE TRIGGER trg_sales_updated_at BEFORE UPDATE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON public.expenses;
CREATE TRIGGER trg_expenses_updated_at BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_restocks_updated_at ON public.restocks;
CREATE TRIGGER trg_restocks_updated_at BEFORE UPDATE ON public.restocks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_savings_updated_at ON public.savings;
CREATE TRIGGER trg_savings_updated_at BEFORE UPDATE ON public.savings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
