
CREATE OR REPLACE FUNCTION public.sync_restock_to_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag text;
  v_description text;
  v_should_have_expense boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.expenses
     WHERE user_id = OLD.user_id
       AND description LIKE '%[RESTOCK:' || OLD.id::text || ']%';
    RETURN OLD;
  END IF;

  -- Guard: only sync when the owning user still exists
  IF NEW.user_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.user_id) THEN
    RETURN NEW;
  END IF;

  v_tag := '[RESTOCK:' || NEW.id::text || ']';
  v_description := 'Inventory Purchase (Restock) - ' || COALESCE(NULLIF(NEW.product_name, ''), 'Product')
                   || ' x' || COALESCE(NEW.quantity_added, 0)::text
                   || ' ' || v_tag;

  v_should_have_expense := COALESCE(NEW.status, 'active') <> 'cancelled'
                           AND COALESCE(NEW.is_opening_stock, false) = false
                           AND COALESCE(NEW.total_cost, 0) > 0;

  DELETE FROM public.expenses
   WHERE user_id = NEW.user_id
     AND description LIKE '%[RESTOCK:' || NEW.id::text || ']%';

  IF v_should_have_expense THEN
    INSERT INTO public.expenses (
      user_id, amount, category, description, note,
      expense_date, payment_method, recorded_by, recorded_by_name
    ) VALUES (
      NEW.user_id, NEW.total_cost, 'Restock', v_description,
      COALESCE(NEW.note, NEW.reference),
      NEW.restock_date, COALESCE(NEW.payment_method, 'cash'),
      NEW.recorded_by, NEW.recorded_by_name
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_restock_to_expense ON public.restocks;
CREATE TRIGGER trg_sync_restock_to_expense
AFTER INSERT OR UPDATE OR DELETE ON public.restocks
FOR EACH ROW EXECUTE FUNCTION public.sync_restock_to_expense();

-- Backfill, skipping restocks whose owner no longer exists
DELETE FROM public.expenses e
 WHERE e.description ~ '\[RESTOCK:[a-f0-9-]+\]';

INSERT INTO public.expenses (
  user_id, amount, category, description, note, expense_date, payment_method, recorded_by, recorded_by_name
)
SELECT
  r.user_id, r.total_cost, 'Restock',
  'Inventory Purchase (Restock) - ' || COALESCE(NULLIF(r.product_name, ''), 'Product')
    || ' x' || COALESCE(r.quantity_added, 0)::text
    || ' [RESTOCK:' || r.id::text || ']',
  COALESCE(r.note, r.reference),
  r.restock_date, COALESCE(r.payment_method, 'cash'),
  r.recorded_by, r.recorded_by_name
FROM public.restocks r
WHERE COALESCE(r.status, 'active') <> 'cancelled'
  AND COALESCE(r.is_opening_stock, false) = false
  AND COALESCE(r.total_cost, 0) > 0
  AND r.user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.user_id);
