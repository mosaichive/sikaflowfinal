-- Keep the live `quantity` column as the canonical on-hand stock value.
-- `stock` remains a compatibility mirror for older code paths. Existing
-- quantities are intentionally not rewritten by this migration.

CREATE OR REPLACE FUNCTION public.sync_product_stock(
  _product_id uuid,
  _business_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_quantity numeric := 0;
BEGIN
  IF _product_id IS NULL OR _business_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.products p
     SET stock = p.quantity,
         updated_at = now()
   WHERE p.id = _product_id
     AND p.business_id = _business_id
  RETURNING p.quantity INTO v_quantity;

  RETURN COALESCE(v_quantity, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_product_stock(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- The old delete trigger changed `quantity` separately from the ledger
-- trigger, which could double-apply a deletion. The replacement ledger
-- trigger below owns all restock quantity changes atomically.
DROP TRIGGER IF EXISTS on_restock_delete ON public.restocks;

CREATE OR REPLACE FUNCTION public.handle_restock_stock_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_old_quantity integer := 0;
  v_new_quantity integer := 0;
  v_quantity_after integer := 0;
  v_movement_type text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF COALESCE(OLD.status, 'active') <> 'cancelled'
       AND OLD.product_id IS NOT NULL
       AND OLD.business_id IS NOT NULL THEN
      v_old_quantity := abs(COALESCE(OLD.quantity_added, 0));
    END IF;

    DELETE FROM public.stock_movements
     WHERE source_table = 'restocks'
       AND source_id = OLD.id
       AND movement_type IN ('restock', 'opening_stock');

    IF v_old_quantity > 0 THEN
      UPDATE public.products p
         SET quantity = GREATEST(0, p.quantity - v_old_quantity),
             stock = GREATEST(0, p.quantity - v_old_quantity),
             updated_at = now()
       WHERE p.id = OLD.product_id
         AND p.business_id = OLD.business_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF COALESCE(NEW.status, 'active') <> 'cancelled'
     AND NEW.product_id IS NOT NULL
     AND NEW.business_id IS NOT NULL THEN
    v_new_quantity := abs(COALESCE(NEW.quantity_added, 0));
    v_movement_type := CASE
      WHEN COALESCE(NEW.is_opening_stock, false) THEN 'opening_stock'
      ELSE 'restock'
    END;

    UPDATE public.products p
       SET quantity = p.quantity + v_new_quantity,
           stock = p.quantity + v_new_quantity,
           updated_at = now()
     WHERE p.id = NEW.product_id
       AND p.business_id = NEW.business_id
    RETURNING p.quantity INTO v_quantity_after;

    INSERT INTO public.stock_movements (
      business_id,
      product_id,
      movement_type,
      quantity_change,
      quantity_after,
      unit_cost,
      unit_price,
      source_table,
      source_id,
      note,
      created_by,
      created_by_name,
      movement_date
    ) VALUES (
      NEW.business_id,
      NEW.product_id,
      v_movement_type,
      v_new_quantity,
      COALESCE(v_quantity_after, 0),
      COALESCE(NEW.cost_price_per_unit, 0),
      COALESCE((SELECT p.selling_price FROM public.products p WHERE p.id = NEW.product_id), 0),
      'restocks',
      NEW.id,
      COALESCE(
        NULLIF(NEW.note, ''),
        NULLIF(NEW.reference, ''),
        CASE WHEN COALESCE(NEW.is_opening_stock, false) THEN 'Opening Stock' ELSE 'Restock' END
      ),
      NEW.recorded_by,
      COALESCE(NEW.recorded_by_name, ''),
      COALESCE(NEW.restock_date, now())
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_restock_stock_ledger() FROM PUBLIC, anon, authenticated;

-- Recalculate now means synchronising the compatibility mirror without
-- replacing visible quantities from incomplete historical ledgers.
CREATE OR REPLACE FUNCTION public.recompute_product_stock()
RETURNS TABLE(product_id uuid, new_stock numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  RETURN QUERY
  WITH updated AS (
    UPDATE public.products p
       SET stock = p.quantity,
           updated_at = now()
     WHERE p.business_id = public.get_user_business_id(auth.uid())
    RETURNING p.id, p.quantity
  )
  SELECT updated.id, updated.quantity::numeric FROM updated;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_product_stock() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_product_stock() TO authenticated;

-- Audited stock correction used by Current Stock. It reconciles the ledger
-- for the selected product only, then records the user's actual adjustment.
CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_product_id uuid,
  p_quantity integer,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(
  product_id uuid,
  previous_quantity integer,
  new_quantity integer,
  quantity_change integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_product public.products%ROWTYPE;
  v_ledger_quantity integer := 0;
  v_reconciliation integer := 0;
  v_change integer := 0;
  v_actor_name text := '';
  v_reason text := '';
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_product_id IS NULL OR p_quantity IS NULL OR p_quantity < 0 THEN
    RAISE EXCEPTION 'Quantity must be a whole number of zero or more' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_product
    FROM public.products p
   WHERE p.id = p_product_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_role_in_business(v_actor, 'admin'::public.app_role, v_product.business_id)
    OR public.has_role_in_business(v_actor, 'manager'::public.app_role, v_product.business_id)
  ) THEN
    RAISE EXCEPTION 'Only an owner, admin, or manager can adjust current stock'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(sm.quantity_change), 0)::integer
    INTO v_ledger_quantity
    FROM public.stock_movements sm
   WHERE sm.product_id = v_product.id
     AND sm.business_id = v_product.business_id;

  SELECT COALESCE(NULLIF(p.display_name, ''), NULLIF(p.email, ''), auth.jwt() ->> 'email', '')
    INTO v_actor_name
    FROM public.profiles p
   WHERE p.id = v_actor
   LIMIT 1;
  v_actor_name := COALESCE(v_actor_name, auth.jwt() ->> 'email', '');

  v_reconciliation := v_product.quantity - v_ledger_quantity;
  IF v_reconciliation <> 0 THEN
    INSERT INTO public.stock_movements (
      business_id, product_id, movement_type, quantity_change, quantity_after,
      unit_cost, unit_price, source_table, source_id, note, created_by,
      created_by_name, movement_date
    ) VALUES (
      v_product.business_id, v_product.id, 'manual_adjustment',
      v_reconciliation, v_product.quantity, v_product.cost_price,
      v_product.selling_price, 'stock_reconciliation', NULL,
      'Ledger reconciled to the previously displayed current stock',
      v_actor, v_actor_name, now()
    );
  END IF;

  v_change := p_quantity - v_product.quantity;
  v_reason := COALESCE(NULLIF(btrim(p_reason), ''), 'Manual current stock correction');

  IF v_change <> 0 THEN
    INSERT INTO public.stock_movements (
      business_id, product_id, movement_type, quantity_change, quantity_after,
      unit_cost, unit_price, source_table, source_id, note, created_by,
      created_by_name, movement_date
    ) VALUES (
      v_product.business_id, v_product.id, 'manual_adjustment',
      v_change, p_quantity, v_product.cost_price, v_product.selling_price,
      'products', v_product.id, v_reason, v_actor, v_actor_name, now()
    );
  END IF;

  UPDATE public.products p
     SET quantity = p_quantity,
         stock = p_quantity,
         updated_at = now()
   WHERE p.id = v_product.id;

  RETURN QUERY SELECT v_product.id, v_product.quantity, p_quantity, v_change;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_product_stock(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid, integer, text) TO authenticated;
