-- Save a restock and its canonical product prices as one transaction.
-- A caller-supplied restock UUID makes create retries idempotent.
CREATE OR REPLACE FUNCTION public.save_inventory_restock(
  p_restock_id uuid,
  p_is_update boolean,
  p_product_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_selling_price numeric,
  p_movement_date timestamptz,
  p_payment_method text,
  p_note text,
  p_is_opening_stock boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_product public.products%ROWTYPE;
  v_existing public.restocks%ROWTYPE;
  v_owner_user_id uuid;
  v_actor_name text := '';
  v_note text := COALESCE(btrim(p_note), '');
  v_payment_method text := lower(COALESCE(NULLIF(btrim(p_payment_method), ''), 'cash'));
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_restock_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'Restock and product are required' USING ERRCODE = '22023';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a whole number of at least 1' USING ERRCODE = '22023';
  END IF;

  IF p_unit_cost IS NULL OR p_unit_cost < 0
     OR p_unit_cost::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Cost per unit must be zero or more' USING ERRCODE = '22023';
  END IF;

  IF p_selling_price IS NULL OR p_selling_price < 0
     OR p_selling_price::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Selling price must be zero or more' USING ERRCODE = '22023';
  END IF;

  IF p_movement_date IS NULL THEN
    RAISE EXCEPTION 'Restock date is required' USING ERRCODE = '22023';
  END IF;

  IF v_payment_method NOT IN ('cash', 'momo', 'card', 'bank_transfer') THEN
    RAISE EXCEPTION 'Unsupported payment method' USING ERRCODE = '22023';
  END IF;

  SELECT p.*
    INTO v_product
    FROM public.products p
   WHERE p.id = p_product_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT b.owner_user_id
    INTO v_owner_user_id
    FROM public.businesses b
   WHERE b.id = v_product.business_id;

  IF v_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Business owner not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_owner_user_id <> v_actor
     AND NOT public.has_role_in_business(
       v_actor,
       'admin'::public.app_role,
       v_product.business_id
     )
     AND NOT public.has_role_in_business(
       v_actor,
       'manager'::public.app_role,
       v_product.business_id
     ) THEN
    RAISE EXCEPTION 'Only an owner, admin, or manager can save a restock'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(NULLIF(p.display_name, ''), NULLIF(p.email, ''))
    INTO v_actor_name
    FROM public.profiles p
   WHERE p.user_id = v_actor OR p.id = v_actor
   ORDER BY (p.user_id = v_actor) DESC
   LIMIT 1;
  v_actor_name := COALESCE(v_actor_name, auth.jwt() ->> 'email', '');

  SELECT r.*
    INTO v_existing
    FROM public.restocks r
   WHERE r.id = p_restock_id
   FOR UPDATE;

  IF COALESCE(p_is_update, false) THEN
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Restock not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_existing.business_id <> v_product.business_id THEN
      RAISE EXCEPTION 'Restock does not belong to this business' USING ERRCODE = '42501';
    END IF;
    IF v_existing.product_id IS DISTINCT FROM v_product.id THEN
      RAISE EXCEPTION 'The product on an existing restock cannot be changed' USING ERRCODE = '22023';
    END IF;
  ELSIF FOUND THEN
    IF v_existing.business_id = v_product.business_id
       AND v_existing.product_id = v_product.id THEN
      RETURN v_existing.id;
    END IF;
    RAISE EXCEPTION 'Restock request ID is already in use' USING ERRCODE = '23505';
  END IF;

  UPDATE public.products p
     SET cost_price = p_unit_cost,
         selling_price = p_selling_price,
         updated_at = now()
   WHERE p.id = v_product.id
     AND p.business_id = v_product.business_id;

  IF COALESCE(p_is_update, false) THEN
    UPDATE public.restocks r
       SET user_id = v_owner_user_id,
           product_name = v_product.name,
           sku = COALESCE(v_product.sku, ''),
           category = COALESCE(v_product.category, ''),
           supplier = COALESCE(v_product.supplier, ''),
           quantity_added = p_quantity,
           cost_price_per_unit = p_unit_cost,
           total_cost = p_unit_cost * p_quantity,
           restock_date = p_movement_date,
           recorded_by = v_actor,
           recorded_by_name = v_actor_name,
           payment_method = v_payment_method,
           reference = NULLIF(v_note, ''),
           note = NULLIF(v_note, ''),
           status = 'active',
           is_opening_stock = COALESCE(p_is_opening_stock, false),
           updated_at = now()
     WHERE r.id = p_restock_id;
  ELSE
    INSERT INTO public.restocks (
      id,
      user_id,
      business_id,
      product_id,
      product_name,
      sku,
      category,
      supplier,
      quantity_added,
      cost_price_per_unit,
      total_cost,
      restock_date,
      recorded_by,
      recorded_by_name,
      payment_method,
      reference,
      note,
      status,
      is_opening_stock
    ) VALUES (
      p_restock_id,
      v_owner_user_id,
      v_product.business_id,
      v_product.id,
      v_product.name,
      COALESCE(v_product.sku, ''),
      COALESCE(v_product.category, ''),
      COALESCE(v_product.supplier, ''),
      p_quantity,
      p_unit_cost,
      p_unit_cost * p_quantity,
      p_movement_date,
      v_actor,
      v_actor_name,
      v_payment_method,
      NULLIF(v_note, ''),
      NULLIF(v_note, ''),
      'active',
      COALESCE(p_is_opening_stock, false)
    );
  END IF;

  RETURN p_restock_id;
END;
$$;

COMMENT ON FUNCTION public.save_inventory_restock(
  uuid, boolean, uuid, integer, numeric, numeric, timestamptz, text, text, boolean
) IS 'Atomically saves an inventory restock and product prices with idempotent create retries.';

REVOKE ALL ON FUNCTION public.save_inventory_restock(
  uuid, boolean, uuid, integer, numeric, numeric, timestamptz, text, text, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_inventory_restock(
  uuid, boolean, uuid, integer, numeric, numeric, timestamptz, text, text, boolean
) TO authenticated;
