-- Recompute available stock from stock_movements as the single source of truth.
-- Sets products.stock = SUM(stock_movements.change) per product, scoped to
-- the calling user. Returns the list of (product_id, new_stock) so the
-- caller can reconcile the UI.
CREATE OR REPLACE FUNCTION public.recompute_product_stock()
RETURNS TABLE (product_id uuid, new_stock numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  RETURN QUERY
  WITH movement_totals AS (
    SELECT sm.product_id AS pid, COALESCE(SUM(sm.change), 0)::numeric AS total
    FROM public.stock_movements sm
    WHERE sm.user_id = auth.uid()
    GROUP BY sm.product_id
  ),
  updated AS (
    UPDATE public.products p
    SET stock = COALESCE(mt.total, 0),
        updated_at = now()
    FROM movement_totals mt
    WHERE p.id = mt.pid
      AND p.user_id = auth.uid()
    RETURNING p.id, p.stock
  )
  SELECT u.id, u.stock FROM updated u;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_product_stock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_product_stock() TO authenticated;

-- Lightweight helper so the client startup check can introspect a table's
-- column names without needing direct information_schema access. Returns
-- the column names that exist for the calling user's session.
CREATE OR REPLACE FUNCTION public.get_table_columns(_table_name text)
RETURNS TABLE (column_name text, data_type text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.column_name::text, c.data_type::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = _table_name
$$;

REVOKE ALL ON FUNCTION public.get_table_columns(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_table_columns(text) TO authenticated;