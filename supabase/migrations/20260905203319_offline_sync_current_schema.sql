-- Durable, tenant-safe replay for records created while a browser is offline.
-- This migration is additive: existing tenant rows are neither rewritten nor removed.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS client_txn_id text,
  ADD COLUMN IF NOT EXISTS client_device_id text,
  ADD COLUMN IF NOT EXISTS created_offline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS client_txn_id text,
  ADD COLUMN IF NOT EXISTS client_device_id text,
  ADD COLUMN IF NOT EXISTS created_offline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS client_txn_id text,
  ADD COLUMN IF NOT EXISTS client_device_id text,
  ADD COLUMN IF NOT EXISTS created_offline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

ALTER TABLE public.other_income
  ADD COLUMN IF NOT EXISTS client_txn_id text,
  ADD COLUMN IF NOT EXISTS client_device_id text,
  ADD COLUMN IF NOT EXISTS created_offline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS sales_business_client_txn_key
  ON public.sales (business_id, client_txn_id)
  WHERE client_txn_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_business_client_txn_key
  ON public.customers (business_id, client_txn_id)
  WHERE client_txn_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_business_client_txn_key
  ON public.expenses (business_id, client_txn_id)
  WHERE client_txn_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS other_income_business_client_txn_key
  ON public.other_income (business_id, client_txn_id)
  WHERE client_txn_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.offline_user_can_write(
  _business_id uuid,
  _module text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  owner_id uuid;
BEGIN
  IF actor IS NULL OR _business_id IS NULL OR _module IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.user_can_access_business(_business_id) THEN
    RETURN false;
  END IF;

  SELECT b.owner_user_id
    INTO owner_id
  FROM public.businesses b
  WHERE b.id = _business_id;

  IF owner_id IS NULL THEN
    RETURN false;
  END IF;

  IF owner_id = actor THEN
    RETURN true;
  END IF;

  IF public.staff_member_has_module(owner_id, _module) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = actor
      AND ur.business_id = _business_id
      AND ur.role::text = 'admin'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.offline_user_can_write(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offline_user_can_write(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.sync_offline_customer(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  business_id uuid;
  txn_id text;
  device_id text;
  customer_name text;
  customer_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  business_id := NULLIF(_payload->>'business_id', '')::uuid;
  txn_id := NULLIF(btrim(_payload->>'client_txn_id'), '');
  device_id := left(NULLIF(btrim(_payload->>'client_device_id'), ''), 120);
  customer_name := left(NULLIF(btrim(_payload->>'name'), ''), 160);

  IF business_id IS NULL OR txn_id IS NULL OR length(txn_id) > 120 OR customer_name IS NULL THEN
    RAISE EXCEPTION 'Invalid offline customer payload' USING ERRCODE = '22023';
  END IF;
  IF NOT public.offline_user_can_write(business_id, 'customers') THEN
    RAISE EXCEPTION 'Not allowed to add customers for this business' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(business_id::text || ':customer:' || txn_id, 0)
  );

  SELECT c.id INTO customer_id
  FROM public.customers c
  WHERE c.business_id = business_id AND c.client_txn_id = txn_id;
  IF customer_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'duplicate', 'customer_id', customer_id);
  END IF;

  INSERT INTO public.customers (
    business_id, name, phone, email, location, notes,
    client_txn_id, client_device_id, created_offline, synced_at
  ) VALUES (
    business_id,
    customer_name,
    left(NULLIF(btrim(_payload->>'phone'), ''), 40),
    left(NULLIF(btrim(_payload->>'email'), ''), 320),
    left(NULLIF(btrim(_payload->>'location'), ''), 500),
    left(COALESCE(NULLIF(btrim(_payload->>'notes'), ''), NULLIF(btrim(_payload->>'note'), '')), 2000),
    txn_id, device_id, true, now()
  )
  ON CONFLICT (business_id, client_txn_id) WHERE client_txn_id IS NOT NULL
  DO UPDATE SET client_txn_id = EXCLUDED.client_txn_id
  RETURNING id INTO customer_id;

  RETURN jsonb_build_object('status', 'synced', 'customer_id', customer_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_offline_expense(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  business_id uuid;
  txn_id text;
  amount_value numeric;
  expense_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  business_id := NULLIF(_payload->>'business_id', '')::uuid;
  txn_id := NULLIF(btrim(_payload->>'client_txn_id'), '');
  amount_value := NULLIF(_payload->>'amount', '')::numeric;

  IF business_id IS NULL OR txn_id IS NULL OR length(txn_id) > 120
     OR amount_value IS NULL OR amount_value::text = 'NaN'
     OR amount_value <= 0 OR amount_value > 1000000000000 THEN
    RAISE EXCEPTION 'Invalid offline expense payload' USING ERRCODE = '22023';
  END IF;
  IF NOT public.offline_user_can_write(business_id, 'expenses') THEN
    RAISE EXCEPTION 'Not allowed to add expenses for this business' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(business_id::text || ':expense:' || txn_id, 0)
  );

  SELECT e.id INTO expense_id
  FROM public.expenses e
  WHERE e.business_id = business_id AND e.client_txn_id = txn_id;
  IF expense_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'duplicate', 'expense_id', expense_id);
  END IF;

  INSERT INTO public.expenses (
    business_id, amount, category, description, expense_date, payment_method,
    recorded_by, recorded_by_name, client_txn_id, client_device_id,
    created_offline, synced_at
  ) VALUES (
    business_id,
    round(amount_value, 2),
    left(COALESCE(NULLIF(btrim(_payload->>'category'), ''), 'Other'), 100),
    left(COALESCE(NULLIF(btrim(_payload->>'description'), ''), NULLIF(btrim(_payload->>'note'), '')), 2000),
    COALESCE(NULLIF(_payload->>'expense_date', '')::timestamptz, now()),
    left(COALESCE(NULLIF(btrim(_payload->>'payment_method'), ''), 'cash'), 50),
    auth.uid(),
    left(COALESCE(NULLIF(btrim(_payload->>'recorded_by_name'), ''), 'Team member'), 160),
    txn_id,
    left(NULLIF(btrim(_payload->>'client_device_id'), ''), 120),
    true,
    now()
  )
  ON CONFLICT (business_id, client_txn_id) WHERE client_txn_id IS NOT NULL
  DO UPDATE SET client_txn_id = EXCLUDED.client_txn_id
  RETURNING id INTO expense_id;

  RETURN jsonb_build_object('status', 'synced', 'expense_id', expense_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_offline_income(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  business_id uuid;
  txn_id text;
  amount_value numeric;
  income_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  business_id := NULLIF(_payload->>'business_id', '')::uuid;
  txn_id := NULLIF(btrim(_payload->>'client_txn_id'), '');
  amount_value := NULLIF(_payload->>'amount', '')::numeric;

  IF business_id IS NULL OR txn_id IS NULL OR length(txn_id) > 120
     OR amount_value IS NULL OR amount_value::text = 'NaN'
     OR amount_value <= 0 OR amount_value > 1000000000000 THEN
    RAISE EXCEPTION 'Invalid offline income payload' USING ERRCODE = '22023';
  END IF;
  IF NOT public.offline_user_can_write(business_id, 'other_income') THEN
    RAISE EXCEPTION 'Not allowed to add income for this business' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(business_id::text || ':income:' || txn_id, 0)
  );

  SELECT i.id INTO income_id
  FROM public.other_income i
  WHERE i.business_id = business_id AND i.client_txn_id = txn_id;
  IF income_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'duplicate', 'income_id', income_id);
  END IF;

  INSERT INTO public.other_income (
    business_id, amount, category, description, income_date, payment_method,
    recorded_by, recorded_by_name, client_txn_id, client_device_id,
    created_offline, synced_at
  ) VALUES (
    business_id,
    round(amount_value, 2),
    left(COALESCE(NULLIF(btrim(_payload->>'category'), ''), NULLIF(btrim(_payload->>'source'), ''), 'Other'), 100),
    left(COALESCE(NULLIF(btrim(_payload->>'description'), ''), NULLIF(btrim(_payload->>'note'), '')), 2000),
    COALESCE(NULLIF(_payload->>'income_date', '')::timestamptz, now()),
    left(COALESCE(NULLIF(btrim(_payload->>'payment_method'), ''), 'cash'), 50),
    auth.uid(),
    left(COALESCE(NULLIF(btrim(_payload->>'recorded_by_name'), ''), 'Team member'), 160),
    txn_id,
    left(NULLIF(btrim(_payload->>'client_device_id'), ''), 120),
    true,
    now()
  )
  ON CONFLICT (business_id, client_txn_id) WHERE client_txn_id IS NOT NULL
  DO UPDATE SET client_txn_id = EXCLUDED.client_txn_id
  RETURNING id INTO income_id;

  RETURN jsonb_build_object('status', 'synced', 'income_id', income_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_offline_sale(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  business_id uuid;
  txn_id text;
  items jsonb;
  item jsonb;
  normalized_items jsonb := '[]'::jsonb;
  sale_id uuid;
  customer_id uuid;
  product_id uuid;
  product_row public.products%ROWTYPE;
  quantity_value integer;
  unit_price_value numeric;
  cost_price_value numeric;
  subtotal_value numeric := 0;
  discount_value numeric := 0;
  total_value numeric := 0;
  amount_paid_value numeric := 0;
  balance_value numeric := 0;
  shortfall_value numeric := 0;
  allow_negative boolean := false;
  payment_status_value text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  business_id := NULLIF(_payload->>'business_id', '')::uuid;
  txn_id := NULLIF(btrim(_payload->>'client_txn_id'), '');
  items := _payload->'items';

  IF business_id IS NULL OR txn_id IS NULL OR length(txn_id) > 120
     OR jsonb_typeof(items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid offline sale payload' USING ERRCODE = '22023';
  END IF;
  IF NOT public.offline_user_can_write(business_id, 'sales') THEN
    RAISE EXCEPTION 'Not allowed to add sales for this business' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(business_id::text || ':sale:' || txn_id, 0)
  );

  SELECT s.id INTO sale_id
  FROM public.sales s
  WHERE s.business_id = business_id AND s.client_txn_id = txn_id;
  IF sale_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'duplicate', 'sale_id', sale_id);
  END IF;

  -- Lock every referenced product in a stable order before checking stock.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(items) entry
    WHERE COALESCE(entry->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'Invalid product in offline sale' USING ERRCODE = '22023';
  END IF;

  PERFORM p.id
  FROM public.products p
  JOIN (
    SELECT DISTINCT (entry->>'product_id')::uuid AS id
    FROM jsonb_array_elements(items) entry
  ) requested ON requested.id = p.id
  WHERE p.business_id = business_id
  ORDER BY p.id
  FOR UPDATE OF p;

  SELECT COALESCE(b.allow_sales_without_stock, false)
    INTO allow_negative
  FROM public.businesses b
  WHERE b.id = business_id;

  FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
    product_id := (item->>'product_id')::uuid;
    quantity_value := floor(COALESCE(NULLIF(item->>'quantity', '')::numeric, 0))::integer;
    unit_price_value := COALESCE(NULLIF(item->>'unit_price', '')::numeric, 0);

    SELECT * INTO product_row
    FROM public.products p
    WHERE p.id = product_id AND p.business_id = business_id;

    IF NOT FOUND OR COALESCE(product_row.is_archived, false) THEN
      RETURN jsonb_build_object(
        'status', 'conflict',
        'message', 'A product in this sale no longer exists or is archived.'
      );
    END IF;
    IF quantity_value <= 0 OR quantity_value > 100000
       OR unit_price_value::text = 'NaN' OR unit_price_value <= 0 OR unit_price_value > 1000000000000 THEN
      RAISE EXCEPTION 'Invalid offline sale item' USING ERRCODE = '22023';
    END IF;

    cost_price_value := COALESCE(product_row.cost_price, 0);
    subtotal_value := subtotal_value + (quantity_value * unit_price_value);
    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'product_id', product_row.id,
      'product_name', product_row.name,
      'sku', product_row.sku,
      'quantity', quantity_value,
      'unit_price', round(unit_price_value, 2),
      'cost_price', cost_price_value,
      'line_total', round(quantity_value * unit_price_value, 2)
    ));
  END LOOP;

  SELECT COALESCE(sum(GREATEST(0, requested.quantity - COALESCE(p.quantity, 0))), 0)
    INTO shortfall_value
  FROM (
    SELECT (entry->>'product_id')::uuid AS id,
           sum(floor((entry->>'quantity')::numeric)) AS quantity
    FROM jsonb_array_elements(items) entry
    GROUP BY (entry->>'product_id')::uuid
  ) requested
  JOIN public.products p ON p.id = requested.id AND p.business_id = business_id;

  IF shortfall_value > 0 AND NOT allow_negative THEN
    RETURN jsonb_build_object(
      'status', 'conflict',
      'message', 'Stock changed while this device was offline. Review the sale before retrying.'
    );
  END IF;

  discount_value := GREATEST(0, COALESCE(NULLIF(_payload->>'discount', '')::numeric, 0));
  IF discount_value::text = 'NaN' OR discount_value > subtotal_value THEN
    RAISE EXCEPTION 'Invalid offline sale discount' USING ERRCODE = '22023';
  END IF;
  subtotal_value := round(subtotal_value, 2);
  total_value := round(subtotal_value - discount_value, 2);
  amount_paid_value := GREATEST(0, LEAST(total_value, COALESCE(NULLIF(_payload->>'amount_paid', '')::numeric, total_value)));
  IF amount_paid_value::text = 'NaN' THEN
    RAISE EXCEPTION 'Invalid offline sale payment' USING ERRCODE = '22023';
  END IF;
  balance_value := round(total_value - amount_paid_value, 2);
  payment_status_value := CASE
    WHEN amount_paid_value >= total_value THEN 'paid'
    WHEN amount_paid_value > 0 THEN 'partial'
    ELSE 'unpaid'
  END;

  IF NULLIF(_payload->>'customer_client_txn_id', '') IS NOT NULL THEN
    SELECT c.id INTO customer_id
    FROM public.customers c
    WHERE c.business_id = business_id
      AND c.client_txn_id = _payload->>'customer_client_txn_id';
  END IF;

  INSERT INTO public.sales (
    business_id, sale_date, customer_id, customer_name, customer_phone,
    staff_id, staff_name, subtotal, discount, total, amount_paid, balance,
    payment_method, payment_status, due_date, status, sale_channel,
    stock_status, stock_shortfall, notes, client_txn_id, client_device_id,
    created_offline, synced_at
  ) VALUES (
    business_id,
    COALESCE(NULLIF(_payload->>'sale_date', '')::timestamptz, now()),
    customer_id,
    left(COALESCE(NULLIF(btrim(_payload->>'customer_name'), ''), 'Walk-in'), 160),
    left(NULLIF(btrim(_payload->>'customer_phone'), ''), 40),
    auth.uid(),
    left(COALESCE(NULLIF(btrim(_payload->>'staff_name'), ''), 'Team member'), 160),
    subtotal_value,
    round(discount_value, 2),
    total_value,
    round(amount_paid_value, 2),
    balance_value,
    left(COALESCE(NULLIF(btrim(_payload->>'payment_method'), ''), 'cash'), 50),
    payment_status_value,
    NULLIF(_payload->>'due_date', '')::timestamptz,
    'completed',
    left(COALESCE(NULLIF(btrim(_payload->>'sale_channel'), ''), 'pos'), 50),
    CASE WHEN shortfall_value > 0 THEN 'negative_stock_sale' ELSE 'in_stock' END,
    shortfall_value,
    left(NULLIF(btrim(_payload->>'notes'), ''), 2000),
    txn_id,
    left(NULLIF(btrim(_payload->>'client_device_id'), ''), 120),
    true,
    now()
  )
  ON CONFLICT (business_id, client_txn_id) WHERE client_txn_id IS NOT NULL
  DO UPDATE SET client_txn_id = EXCLUDED.client_txn_id
  RETURNING id INTO sale_id;

  FOR item IN SELECT value FROM jsonb_array_elements(normalized_items) LOOP
    INSERT INTO public.sale_items (
      business_id, sale_id, product_id, product_name, sku, quantity,
      unit_price, cost_price, line_total, default_price
    ) VALUES (
      business_id,
      sale_id,
      (item->>'product_id')::uuid,
      item->>'product_name',
      item->>'sku',
      (item->>'quantity')::integer,
      (item->>'unit_price')::numeric,
      (item->>'cost_price')::numeric,
      (item->>'line_total')::numeric,
      (item->>'unit_price')::numeric
    );
  END LOOP;

  -- The existing sale-item trigger adjusts quantity; keep the compatibility
  -- stock mirror aligned for views that still read products.stock.
  UPDATE public.products p
     SET stock = p.quantity,
         updated_at = now()
   WHERE p.business_id = business_id
     AND p.id IN (
       SELECT DISTINCT (entry->>'product_id')::uuid
       FROM jsonb_array_elements(items) entry
     );

  RETURN jsonb_build_object('status', 'synced', 'sale_id', sale_id);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_offline_customer(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_offline_expense(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_offline_income(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_offline_sale(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_offline_customer(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_offline_expense(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_offline_income(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_offline_sale(jsonb) TO authenticated;

-- Realtime is the cross-device delivery path after a device reconnects. Add
-- only missing tables so repeated deploys remain safe.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'sales', 'sale_items', 'products', 'customers', 'expenses', 'other_income'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
