-- Offline-first sync support: client idempotency keys + audit metadata.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS client_txn_id text,
  ADD COLUMN IF NOT EXISTS created_offline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_device_id text,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS client_txn_id text,
  ADD COLUMN IF NOT EXISTS created_offline boolean NOT NULL DEFAULT false;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS client_txn_id text,
  ADD COLUMN IF NOT EXISTS created_offline boolean NOT NULL DEFAULT false;

ALTER TABLE public.other_income
  ADD COLUMN IF NOT EXISTS client_txn_id text,
  ADD COLUMN IF NOT EXISTS created_offline boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS sales_user_client_txn_uidx
  ON public.sales (user_id, client_txn_id) WHERE client_txn_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_user_client_txn_uidx
  ON public.customers (user_id, client_txn_id) WHERE client_txn_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_user_client_txn_uidx
  ON public.expenses (user_id, client_txn_id) WHERE client_txn_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS other_income_user_client_txn_uidx
  ON public.other_income (user_id, client_txn_id) WHERE client_txn_id IS NOT NULL;

-- Shared guard: the caller must be the business owner or a staff member with
-- access to the requested module. Never trust an owner id from the client alone.
CREATE OR REPLACE FUNCTION public.offline_can_write(_owner uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND _owner IS NOT NULL
     AND (auth.uid() = _owner OR public.is_business_member_module(_owner, _module));
$$;

-- Idempotent customer sync. Returns the permanent server id for a locally
-- created customer, or the existing match when it was already synced.
CREATE OR REPLACE FUNCTION public.sync_offline_customer(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid := NULLIF(_payload->>'owner_id','')::uuid;
  _txn text := NULLIF(_payload->>'client_txn_id','');
  _name text := NULLIF(trim(_payload->>'name'),'');
  _id uuid;
BEGIN
  IF NOT public.offline_can_write(_owner, 'customers') THEN
    RAISE EXCEPTION 'Not allowed to write customers for this business';
  END IF;
  IF _txn IS NULL THEN RAISE EXCEPTION 'client_txn_id is required'; END IF;
  IF _name IS NULL THEN RAISE EXCEPTION 'Customer name is required'; END IF;

  SELECT id INTO _id FROM public.customers WHERE user_id = _owner AND client_txn_id = _txn;
  IF _id IS NOT NULL THEN
    RETURN jsonb_build_object('status','duplicate','customer_id',_id);
  END IF;

  SELECT id INTO _id FROM public.customers
   WHERE user_id = _owner AND lower(name) = lower(_name)
   ORDER BY created_at LIMIT 1;
  IF _id IS NOT NULL THEN
    UPDATE public.customers SET client_txn_id = _txn WHERE id = _id AND client_txn_id IS NULL;
    RETURN jsonb_build_object('status','matched','customer_id',_id);
  END IF;

  INSERT INTO public.customers (user_id, name, phone, email, note, client_txn_id, created_offline)
  VALUES (_owner, _name, NULLIF(_payload->>'phone',''), NULLIF(_payload->>'email',''),
          NULLIF(_payload->>'note',''), _txn, COALESCE((_payload->>'created_offline')::boolean, true))
  RETURNING id INTO _id;

  RETURN jsonb_build_object('status','created','customer_id',_id);
END;
$$;

-- Idempotent sale sync. Validates permissions and stock rules server-side,
-- then writes the sale + items so the existing stock triggers reconcile
-- inventory against whatever the cloud stock is at sync time.
CREATE OR REPLACE FUNCTION public.sync_offline_sale(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid := NULLIF(_payload->>'owner_id','')::uuid;
  _txn text := NULLIF(_payload->>'client_txn_id','');
  _items jsonb := COALESCE(_payload->'items','[]'::jsonb);
  _item jsonb;
  _sale_id uuid;
  _customer_id uuid;
  _customer_name text := NULLIF(trim(_payload->>'customer_name'),'');
  _allow_no_stock boolean := false;
  _shortfall numeric := 0;
  _requested numeric;
  _available numeric;
  _pid uuid;
  _total numeric := COALESCE((_payload->>'total')::numeric, 0);
  _paid numeric := COALESCE((_payload->>'amount_paid')::numeric, 0);
BEGIN
  IF NOT public.offline_can_write(_owner, 'sales') THEN
    RAISE EXCEPTION 'Not allowed to record sales for this business';
  END IF;
  IF _txn IS NULL THEN RAISE EXCEPTION 'client_txn_id is required'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Sale has no items'; END IF;

  SELECT id INTO _sale_id FROM public.sales WHERE user_id = _owner AND client_txn_id = _txn;
  IF _sale_id IS NOT NULL THEN
    RETURN jsonb_build_object('status','duplicate','sale_id',_sale_id);
  END IF;

  SELECT COALESCE(allow_sales_without_stock,false) INTO _allow_no_stock
    FROM public.profiles WHERE id = _owner;

  -- Conflict check against CURRENT cloud stock (other devices may have sold
  -- the same items while this device was offline).
  FOR _pid, _requested IN
    SELECT (value->>'product_id')::uuid, SUM(COALESCE((value->>'quantity')::numeric,0))
      FROM jsonb_array_elements(_items)
     WHERE NULLIF(value->>'product_id','') IS NOT NULL
     GROUP BY 1
  LOOP
    SELECT COALESCE(stock,0) INTO _available FROM public.products WHERE id = _pid AND user_id = _owner;
    IF _available IS NULL THEN
      RETURN jsonb_build_object('status','conflict','reason','product_missing',
        'message','A product on this sale no longer exists in your catalogue.');
    END IF;
    _shortfall := _shortfall + GREATEST(0, _requested - GREATEST(0, _available));
  END LOOP;

  IF _shortfall > 0 AND NOT _allow_no_stock THEN
    RETURN jsonb_build_object('status','conflict','reason','insufficient_stock',
      'message','Stock changed while you were offline, so this sale would push inventory negative.');
  END IF;

  -- Customer resolution: prefer an already-synced offline customer.
  IF NULLIF(_payload->>'customer_client_txn_id','') IS NOT NULL THEN
    SELECT id INTO _customer_id FROM public.customers
     WHERE user_id = _owner AND client_txn_id = _payload->>'customer_client_txn_id';
  END IF;
  IF _customer_id IS NULL AND NULLIF(_payload->>'customer_id','') IS NOT NULL THEN
    SELECT id INTO _customer_id FROM public.customers
     WHERE user_id = _owner AND id = (_payload->>'customer_id')::uuid;
  END IF;
  IF _customer_id IS NULL AND _customer_name IS NOT NULL AND lower(_customer_name) <> 'walk-in' THEN
    SELECT id INTO _customer_id FROM public.customers
     WHERE user_id = _owner AND lower(name) = lower(_customer_name) ORDER BY created_at LIMIT 1;
    IF _customer_id IS NULL THEN
      INSERT INTO public.customers (user_id, name, phone, created_offline)
      VALUES (_owner, _customer_name, NULLIF(_payload->>'customer_phone',''),
              COALESCE((_payload->>'created_offline')::boolean, true))
      RETURNING id INTO _customer_id;
    END IF;
  END IF;

  INSERT INTO public.sales (
    user_id, business_id, customer_id, customer_name, customer_phone,
    staff_id, staff_name, sale_date, due_date, subtotal, discount, total,
    cost_total, amount_paid, balance, payment_method, payment_status,
    status, sale_channel, notes, client_txn_id, created_offline,
    client_device_id, synced_at
  ) VALUES (
    _owner, _owner, _customer_id, COALESCE(_customer_name,'Walk-in'),
    NULLIF(_payload->>'customer_phone',''),
    auth.uid(), NULLIF(_payload->>'staff_name',''),
    COALESCE((_payload->>'sale_date')::timestamptz, now()),
    NULLIF(_payload->>'due_date','')::timestamptz,
    COALESCE((_payload->>'subtotal')::numeric,0),
    COALESCE((_payload->>'discount')::numeric,0),
    _total,
    COALESCE((_payload->>'cost_total')::numeric,0),
    _paid,
    COALESCE((_payload->>'balance')::numeric, GREATEST(0, _total - _paid)),
    COALESCE(NULLIF(_payload->>'payment_method',''),'cash'),
    COALESCE(NULLIF(_payload->>'payment_status',''),'paid'),
    'completed', COALESCE(NULLIF(_payload->>'sale_channel',''),'pos'),
    NULLIF(_payload->>'notes',''), _txn,
    COALESCE((_payload->>'created_offline')::boolean, true),
    NULLIF(_payload->>'client_device_id',''), now()
  ) RETURNING id INTO _sale_id;

  FOR _item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    INSERT INTO public.sale_items (
      sale_id, user_id, business_id, product_id, product_name, sku,
      quantity, unit_price, unit_cost, cost_price, line_total
    ) VALUES (
      _sale_id, _owner, _owner, NULLIF(_item->>'product_id','')::uuid,
      COALESCE(NULLIF(_item->>'product_name',''),'Line item'),
      NULLIF(_item->>'sku',''),
      COALESCE((_item->>'quantity')::numeric,0),
      COALESCE((_item->>'unit_price')::numeric,0),
      COALESCE((_item->>'unit_cost')::numeric,0),
      COALESCE((_item->>'unit_cost')::numeric,0),
      COALESCE((_item->>'line_total')::numeric,0)
    );
  END LOOP;

  INSERT INTO public.audit_log (user_id, action, details, performed_by, performed_by_name)
  VALUES (_owner, 'offline_sale_synced',
          format('Offline sale %s synced (device %s)', _txn, COALESCE(_payload->>'client_device_id','unknown')),
          auth.uid(), NULLIF(_payload->>'staff_name',''));

  RETURN jsonb_build_object('status','created','sale_id',_sale_id,'shortfall',_shortfall);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_offline_expense(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid := NULLIF(_payload->>'owner_id','')::uuid;
  _txn text := NULLIF(_payload->>'client_txn_id','');
  _id uuid;
BEGIN
  IF NOT public.offline_can_write(_owner, 'expenses') THEN
    RAISE EXCEPTION 'Not allowed to record expenses for this business';
  END IF;
  IF _txn IS NULL THEN RAISE EXCEPTION 'client_txn_id is required'; END IF;

  SELECT id INTO _id FROM public.expenses WHERE user_id = _owner AND client_txn_id = _txn;
  IF _id IS NOT NULL THEN RETURN jsonb_build_object('status','duplicate','expense_id',_id); END IF;

  INSERT INTO public.expenses (user_id, amount, category, description, note, payment_method,
                               expense_date, recorded_by, recorded_by_name, client_txn_id, created_offline)
  VALUES (_owner, COALESCE((_payload->>'amount')::numeric,0),
          COALESCE(NULLIF(_payload->>'category',''),'Other'),
          NULLIF(_payload->>'description',''), NULLIF(_payload->>'note',''),
          NULLIF(_payload->>'payment_method',''),
          COALESCE((_payload->>'expense_date')::timestamptz, now()),
          auth.uid(), NULLIF(_payload->>'recorded_by_name',''), _txn, true)
  RETURNING id INTO _id;

  RETURN jsonb_build_object('status','created','expense_id',_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_offline_income(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid := NULLIF(_payload->>'owner_id','')::uuid;
  _txn text := NULLIF(_payload->>'client_txn_id','');
  _id uuid;
BEGIN
  IF NOT public.offline_can_write(_owner, 'other_income') THEN
    RAISE EXCEPTION 'Not allowed to record income for this business';
  END IF;
  IF _txn IS NULL THEN RAISE EXCEPTION 'client_txn_id is required'; END IF;

  SELECT id INTO _id FROM public.other_income WHERE user_id = _owner AND client_txn_id = _txn;
  IF _id IS NOT NULL THEN RETURN jsonb_build_object('status','duplicate','income_id',_id); END IF;

  INSERT INTO public.other_income (user_id, amount, source, category, description, note,
                                   payment_method, income_date, recorded_by, recorded_by_name,
                                   client_txn_id, created_offline)
  VALUES (_owner, COALESCE((_payload->>'amount')::numeric,0),
          NULLIF(_payload->>'source',''), NULLIF(_payload->>'category',''),
          NULLIF(_payload->>'description',''), NULLIF(_payload->>'note',''),
          NULLIF(_payload->>'payment_method',''),
          COALESCE((_payload->>'income_date')::timestamptz, now()),
          auth.uid(), NULLIF(_payload->>'recorded_by_name',''), _txn, true)
  RETURNING id INTO _id;

  RETURN jsonb_build_object('status','created','income_id',_id);
END;
$$;

REVOKE ALL ON FUNCTION public.offline_can_write(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_offline_sale(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_offline_customer(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_offline_expense(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_offline_income(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.offline_can_write(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_offline_sale(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_offline_customer(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_offline_expense(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_offline_income(jsonb) TO authenticated;