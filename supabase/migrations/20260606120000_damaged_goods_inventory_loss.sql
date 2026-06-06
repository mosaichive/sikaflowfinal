-- Damaged goods are inventory losses: they reduce sellable stock without
-- creating sales, income, profit, or cash movement.

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS change numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reference_id uuid,
  ADD COLUMN IF NOT EXISTS added_by_name text,
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS movement_type text,
  ADD COLUMN IF NOT EXISTS quantity_change integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity_after integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_cost numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_price numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_table text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS movement_date timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_type_chk;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_type_chk
  CHECK (
    movement_type IS NULL
    OR movement_type IN ('opening_stock', 'restock', 'sale', 'return', 'damaged_stock', 'manual_adjustment')
  );

CREATE TABLE IF NOT EXISTS public.damaged_goods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  quantity integer NOT NULL CHECK (quantity > 0),
  quantity_after integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  damage_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  unit_cost numeric(10,2) NOT NULL DEFAULT 0,
  total_value numeric(10,2) NOT NULL DEFAULT 0,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT damaged_goods_reason_chk CHECK (
    reason IN ('Broken', 'Expired', 'Spoiled', 'Torn', 'Missing parts', 'Defective', 'Customer return damaged', 'Other')
  )
);

CREATE INDEX IF NOT EXISTS damaged_goods_business_date_idx
  ON public.damaged_goods (business_id, damage_date DESC);

CREATE INDEX IF NOT EXISTS damaged_goods_user_date_idx
  ON public.damaged_goods (user_id, damage_date DESC);

CREATE INDEX IF NOT EXISTS damaged_goods_product_date_idx
  ON public.damaged_goods (product_id, damage_date DESC);

ALTER TABLE public.damaged_goods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "damaged goods owner select" ON public.damaged_goods;
CREATE POLICY "damaged goods owner select"
ON public.damaged_goods
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "damaged goods team select" ON public.damaged_goods;
CREATE POLICY "damaged goods team select"
ON public.damaged_goods
FOR SELECT TO authenticated
USING (public.staff_member_has_any_module(user_id, ARRAY['dashboard','inventory','damaged_goods','reports']));

DROP POLICY IF EXISTS "damaged goods owner insert" ON public.damaged_goods;
CREATE POLICY "damaged goods owner insert"
ON public.damaged_goods
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "damaged goods team insert" ON public.damaged_goods;
CREATE POLICY "damaged goods team insert"
ON public.damaged_goods
FOR INSERT TO authenticated
WITH CHECK (public.staff_member_has_module(user_id, 'damaged_goods'));

DROP POLICY IF EXISTS "damaged goods owner update" ON public.damaged_goods;
CREATE POLICY "damaged goods owner update"
ON public.damaged_goods
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "damaged goods owner delete" ON public.damaged_goods;
CREATE POLICY "damaged goods owner delete"
ON public.damaged_goods
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS damaged_goods_set_updated_at ON public.damaged_goods;
CREATE TRIGGER damaged_goods_set_updated_at
BEFORE UPDATE ON public.damaged_goods
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.staff_member_has_module(_owner_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.business_owner_id = _owner_id
      AND sm.staff_user_id = auth.uid()
      AND sm.active = true
      AND (
        sm.permissions ->> 'role' = 'admin'
        OR (
          jsonb_typeof(sm.permissions -> 'modules') = 'array'
          AND (sm.permissions -> 'modules') ? _module
        )
        OR (
          jsonb_typeof(sm.permissions -> 'modules') IS DISTINCT FROM 'array'
          AND (
            (_module = 'dashboard')
            OR (sm.permissions ->> 'role' = 'manager' AND _module = ANY (ARRAY['sales','products','inventory','damaged_goods','customers','orders','other_income','expenses','savings','reports','announcements']))
            OR (sm.permissions ->> 'role' = 'salesperson' AND _module = ANY (ARRAY['sales','customers','orders','announcements']))
            OR (sm.permissions ->> 'role' = 'cashier' AND _module = ANY (ARRAY['sales','customers','announcements']))
            OR (sm.permissions ->> 'role' = 'distributor' AND _module = ANY (ARRAY['inventory','orders','announcements']))
            OR (sm.permissions ->> 'role' = 'staff' AND _module = 'announcements')
          )
        )
      )
  );
$$;

DROP POLICY IF EXISTS "products team select" ON public.products;
CREATE POLICY "products team select"
ON public.products FOR SELECT
USING (public.staff_member_has_any_module(user_id, ARRAY['dashboard','products','inventory','damaged_goods','sales','reports']));

DROP POLICY IF EXISTS "stock_movements team select" ON public.stock_movements;
CREATE POLICY "stock_movements team select"
ON public.stock_movements FOR SELECT
USING (public.staff_member_has_any_module(user_id, ARRAY['dashboard','inventory','damaged_goods','products','reports']));

CREATE OR REPLACE FUNCTION public.record_damaged_goods(
  _product_id uuid,
  _quantity integer,
  _reason text,
  _damage_date timestamptz DEFAULT now(),
  _notes text DEFAULT NULL,
  _business_id uuid DEFAULT NULL,
  _recorded_by_name text DEFAULT ''
)
RETURNS TABLE(damaged_good_id uuid, quantity_after integer, total_value numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_product_name text;
  v_category text := '';
  v_current_stock numeric := 0;
  v_unit_cost numeric := 0;
  v_owner_user_id uuid;
  v_product_business_id uuid;
  v_business_id uuid;
  v_after integer;
  v_total_value numeric;
  v_damaged_id uuid;
  has_stock boolean;
  has_quantity boolean;
  has_cost boolean;
  has_cost_price boolean;
  has_user_id boolean;
  has_business_id boolean;
  has_category boolean;
  set_clauses text[] := ARRAY[]::text[];
  product_select_sql text;
  product_update_sql text;
  movement_note text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _product_id IS NULL THEN
    RAISE EXCEPTION 'Product is required';
  END IF;

  IF COALESCE(_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Damaged quantity must be greater than 0';
  END IF;

  IF NULLIF(BTRIM(COALESCE(_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Reason for damage is required';
  END IF;

  IF _reason NOT IN ('Broken', 'Expired', 'Spoiled', 'Torn', 'Missing parts', 'Defective', 'Customer return damaged', 'Other') THEN
    RAISE EXCEPTION 'Choose a valid damaged goods reason';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stock'
  ) INTO has_stock;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'quantity'
  ) INTO has_quantity;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'cost'
  ) INTO has_cost;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'cost_price'
  ) INTO has_cost_price;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'user_id'
  ) INTO has_user_id;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'business_id'
  ) INTO has_business_id;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'category'
  ) INTO has_category;

  IF NOT has_stock AND NOT has_quantity THEN
    RAISE EXCEPTION 'Products table has no stock quantity column';
  END IF;

  product_select_sql := format(
    'SELECT name, %s AS current_stock, %s AS unit_cost, %s AS owner_user_id, %s AS business_id, %s AS category FROM public.products WHERE id = $1 FOR UPDATE',
    CASE WHEN has_stock THEN 'COALESCE(stock, 0)::numeric' ELSE 'COALESCE(quantity, 0)::numeric' END,
    CASE
      WHEN has_cost THEN 'COALESCE(cost, 0)::numeric'
      WHEN has_cost_price THEN 'COALESCE(cost_price, 0)::numeric'
      ELSE '0::numeric'
    END,
    CASE WHEN has_user_id THEN 'user_id' ELSE 'NULL::uuid' END,
    CASE WHEN has_business_id THEN 'business_id' ELSE 'NULL::uuid' END,
    CASE WHEN has_category THEN 'COALESCE(category, '''')' ELSE '''''' END
  );

  EXECUTE product_select_sql
    INTO v_product_name, v_current_stock, v_unit_cost, v_owner_user_id, v_product_business_id, v_category
    USING _product_id;

  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  v_business_id := COALESCE(_business_id, v_product_business_id, public.get_user_business_id(v_actor));

  IF v_owner_user_id IS NULL AND v_business_id IS NOT NULL THEN
    SELECT owner_user_id INTO v_owner_user_id
    FROM public.businesses
    WHERE id = v_business_id
    LIMIT 1;
  END IF;

  v_owner_user_id := COALESCE(v_owner_user_id, v_actor);

  IF v_business_id IS NULL THEN
    SELECT business_id INTO v_business_id
    FROM public.profiles
    WHERE user_id = v_owner_user_id
    LIMIT 1;
  END IF;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Business workspace not found';
  END IF;

  IF v_actor <> v_owner_user_id
    AND NOT public.staff_member_has_module(v_owner_user_id, 'damaged_goods') THEN
    RAISE EXCEPTION 'You do not have permission to record damaged goods';
  END IF;

  IF v_current_stock < _quantity THEN
    RAISE EXCEPTION 'Insufficient stock. Only % item(s) available.', v_current_stock;
  END IF;

  v_after := (v_current_stock - _quantity)::integer;
  v_total_value := ROUND((_quantity::numeric * COALESCE(v_unit_cost, 0)), 2);

  INSERT INTO public.damaged_goods (
    business_id,
    user_id,
    product_id,
    product_name,
    category,
    quantity,
    quantity_after,
    reason,
    damage_date,
    notes,
    unit_cost,
    total_value,
    recorded_by,
    recorded_by_name
  )
  VALUES (
    v_business_id,
    v_owner_user_id,
    _product_id,
    v_product_name,
    COALESCE(v_category, ''),
    _quantity,
    v_after,
    _reason,
    COALESCE(_damage_date, now()),
    NULLIF(BTRIM(COALESCE(_notes, '')), ''),
    COALESCE(v_unit_cost, 0),
    v_total_value,
    v_actor,
    COALESCE(NULLIF(BTRIM(_recorded_by_name), ''), '')
  )
  RETURNING id INTO v_damaged_id;

  IF has_stock THEN
    set_clauses := array_append(set_clauses, 'stock = $1');
  END IF;
  IF has_quantity THEN
    set_clauses := array_append(set_clauses, 'quantity = $1');
  END IF;

  product_update_sql := format(
    'UPDATE public.products SET %s, updated_at = now() WHERE id = $2',
    array_to_string(set_clauses, ', ')
  );
  EXECUTE product_update_sql USING v_after, _product_id;

  movement_note := CONCAT('Damaged goods: ', _reason, COALESCE(' - ' || NULLIF(BTRIM(_notes), ''), ''));

  INSERT INTO public.stock_movements (
    user_id,
    business_id,
    product_id,
    change,
    reason,
    note,
    reference_id,
    added_by_name,
    movement_type,
    quantity_change,
    quantity_after,
    unit_cost,
    unit_price,
    source_table,
    source_id,
    created_by,
    created_by_name,
    movement_date
  )
  VALUES (
    v_owner_user_id,
    v_business_id,
    _product_id,
    -ABS(_quantity),
    'damaged_stock',
    movement_note,
    v_damaged_id,
    COALESCE(NULLIF(BTRIM(_recorded_by_name), ''), ''),
    'damaged_stock',
    -ABS(_quantity),
    v_after,
    COALESCE(v_unit_cost, 0),
    0,
    'damaged_goods',
    v_damaged_id,
    v_actor,
    COALESCE(NULLIF(BTRIM(_recorded_by_name), ''), ''),
    COALESCE(_damage_date, now())
  );

  INSERT INTO public.audit_log (
    user_id,
    business_id,
    action,
    details,
    performed_by,
    performed_by_name
  )
  VALUES (
    v_owner_user_id,
    v_business_id,
    'damaged_goods_recorded',
    CONCAT('Recorded ', _quantity, ' damaged ', v_product_name, ' item(s). Reason: ', _reason, '. Stock after: ', v_after, '. Estimated loss: ', v_total_value),
    v_actor,
    COALESCE(NULLIF(BTRIM(_recorded_by_name), ''), '')
  );

  RETURN QUERY SELECT v_damaged_id, v_after, v_total_value;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_damaged_goods(uuid, integer, text, timestamptz, text, uuid, text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_stock_movements_damaged_reference
  ON public.stock_movements (reference_id, reason, product_id)
  WHERE reason = 'damaged_stock';
