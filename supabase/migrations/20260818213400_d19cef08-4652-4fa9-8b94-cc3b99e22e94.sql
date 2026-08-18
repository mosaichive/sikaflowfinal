
CREATE TABLE IF NOT EXISTS public.restore_record_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity text NOT NULL,
  source_id uuid NOT NULL,
  new_id uuid NOT NULL,
  restore_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity, source_id)
);

GRANT SELECT ON public.restore_record_map TO authenticated;
GRANT ALL ON public.restore_record_map TO service_role;
ALTER TABLE public.restore_record_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own restore map read" ON public.restore_record_map FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.restore_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  business_id uuid,
  backup_version integer,
  backup_created_at timestamptz,
  backup_business_name text,
  restore_mode text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  restored_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  skipped_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.restore_logs TO authenticated;
GRANT ALL ON public.restore_logs TO service_role;
ALTER TABLE public.restore_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own restore logs read" ON public.restore_logs FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.restore_business_backup(_payload jsonb, _mode text DEFAULT 'fresh')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_mode text := coalesce(_mode, 'fresh');
  v_version int;
  v_created timestamptz;
  v_biz jsonb;
  v_restore_id uuid := gen_random_uuid();
  rec jsonb;
  new_id uuid;
  src uuid;
  counts jsonb := '{}'::jsonb;
  skipped jsonb := '{}'::jsonb;
  c int;
  s int;
  v_display text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.staff_user_id = uid AND sm.active) THEN
    RAISE EXCEPTION 'Only the business owner can restore a backup';
  END IF;
  IF v_mode NOT IN ('fresh','new_business','merge') THEN
    RAISE EXCEPTION 'Unsupported restore mode';
  END IF;
  IF coalesce(_payload->>'format','') <> 'kuditrack-backup' THEN
    RAISE EXCEPTION 'Invalid backup file';
  END IF;
  v_version := coalesce((_payload->>'version')::int, 0);
  IF v_version < 1 THEN RAISE EXCEPTION 'Invalid backup version'; END IF;
  IF v_version > 1 THEN RAISE EXCEPTION 'This backup was created with a newer version of KudiTrack and cannot currently be restored.'; END IF;

  v_created := nullif(_payload->>'created_at','')::timestamptz;
  v_biz := coalesce(_payload->'business', '{}'::jsonb);
  SELECT coalesce(display_name, business_name, '') INTO v_display FROM public.profiles WHERE id = uid;

  SELECT count(*) INTO c FROM public.restore_record_map m WHERE m.user_id = uid;

  -- business profile (non-privileged fields only), fresh mode only
  IF v_mode = 'fresh' THEN
    UPDATE public.profiles p SET
      business_name = coalesce(nullif(v_biz->>'business_name',''), p.business_name),
      business_type = coalesce(nullif(v_biz->>'business_type',''), p.business_type),
      phone = coalesce(nullif(v_biz->>'phone',''), p.phone),
      location = coalesce(nullif(v_biz->>'location',''), p.location),
      num_employees = coalesce(nullif(v_biz->>'num_employees',''), p.num_employees),
      logo_url = coalesce(nullif(v_biz->>'logo_url',''), p.logo_url),
      currency = coalesce(nullif(_payload->>'currency',''), p.currency),
      opening_cash_balance = coalesce((v_biz->>'opening_cash_balance')::numeric, p.opening_cash_balance),
      allow_sales_without_stock = coalesce((v_biz->>'allow_sales_without_stock')::boolean, p.allow_sales_without_stock),
      store_show_stock = coalesce((v_biz->>'store_show_stock')::boolean, p.store_show_stock),
      store_enable_notes = coalesce((v_biz->>'store_enable_notes')::boolean, p.store_enable_notes),
      store_enable_delivery_address = coalesce((v_biz->>'store_enable_delivery_address')::boolean, p.store_enable_delivery_address),
      store_enable_product_images = coalesce((v_biz->>'store_enable_product_images')::boolean, p.store_enable_product_images),
      store_default_delivery_fee = coalesce((v_biz->>'store_default_delivery_fee')::numeric, p.store_default_delivery_fee),
      store_payment_instructions = coalesce(nullif(v_biz->>'store_payment_instructions',''), p.store_payment_instructions)
    WHERE p.id = uid;
  END IF;

  -- CUSTOMERS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'customers','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='customers' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    IF v_mode = 'merge' AND EXISTS (
      SELECT 1 FROM public.customers x WHERE x.user_id = uid
        AND lower(x.name) = lower(coalesce(rec->>'name','')) AND coalesce(x.phone,'') = coalesce(rec->>'phone','')
    ) THEN
      SELECT x.id INTO new_id FROM public.customers x WHERE x.user_id=uid AND lower(x.name)=lower(coalesce(rec->>'name','')) AND coalesce(x.phone,'')=coalesce(rec->>'phone','') LIMIT 1;
      IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'customers',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
      s := s+1; CONTINUE;
    END IF;
    INSERT INTO public.customers (user_id, name, phone, email, note, created_at)
    VALUES (uid, coalesce(rec->>'name','Customer'), rec->>'phone', rec->>'email', rec->>'note', coalesce(nullif(rec->>'created_at','')::timestamptz, now()))
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'customers',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('customers', c); skipped := skipped || jsonb_build_object('customers', s);

  -- PRODUCTS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'products','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='products' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    IF v_mode = 'merge' AND EXISTS (
      SELECT 1 FROM public.products x WHERE x.user_id=uid AND lower(x.name)=lower(coalesce(rec->>'name','')) AND coalesce(x.sku,'')=coalesce(rec->>'sku','')
    ) THEN
      SELECT x.id INTO new_id FROM public.products x WHERE x.user_id=uid AND lower(x.name)=lower(coalesce(rec->>'name','')) AND coalesce(x.sku,'')=coalesce(rec->>'sku','') LIMIT 1;
      IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'products',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
      s := s+1; CONTINUE;
    END IF;
    INSERT INTO public.products (user_id, name, sku, price, cost, stock, low_stock_threshold, category, is_archived, image_url, available_online, online_description, created_at)
    VALUES (uid, coalesce(rec->>'name','Product'), rec->>'sku', coalesce((rec->>'price')::numeric,0), coalesce((rec->>'cost')::numeric,0),
            coalesce((rec->>'stock')::numeric,0), coalesce((rec->>'low_stock_threshold')::numeric,0), coalesce(nullif(rec->>'category',''),'General'),
            coalesce((rec->>'is_archived')::boolean,false), rec->>'image_url', coalesce((rec->>'available_online')::boolean,false), rec->>'online_description',
            coalesce(nullif(rec->>'created_at','')::timestamptz, now()))
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'products',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('products', c); skipped := skipped || jsonb_build_object('products', s);

  -- BANK ACCOUNTS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'bank_accounts','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='bank_accounts' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.bank_accounts (user_id, bank_name, account_name, account_number, branch, mobile_money_name, mobile_money_number, account_type, note)
    VALUES (uid, coalesce(rec->>'bank_name',''), coalesce(rec->>'account_name',''), coalesce(rec->>'account_number',''), rec->>'branch',
            rec->>'mobile_money_name', rec->>'mobile_money_number', coalesce(nullif(rec->>'account_type',''),'bank'), rec->>'note')
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'bank_accounts',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('bank_accounts', c); skipped := skipped || jsonb_build_object('bank_accounts', s);

  -- RESTOCKS (inventory ledger). Triggers regenerate stock movements + linked expenses.
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'inventory','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='restocks' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.restocks (user_id, product_id, product_name, category, quantity_added, cost_price_per_unit, total_cost, payment_method, note, reference, recorded_by_name, restock_date, status, is_opening_stock)
    VALUES (uid,
            (SELECT m.new_id FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='products' AND m.source_id = nullif(rec->>'product_id','')::uuid),
            coalesce(rec->>'product_name','Product'), coalesce(nullif(rec->>'category',''),'General'),
            coalesce((rec->>'quantity_added')::numeric,0), coalesce((rec->>'cost_price_per_unit')::numeric,0), coalesce((rec->>'total_cost')::numeric,0),
            coalesce(nullif(rec->>'payment_method',''),'cash'), rec->>'note', rec->>'reference', rec->>'recorded_by_name',
            coalesce(nullif(rec->>'restock_date','')::timestamptz, now()), coalesce(nullif(rec->>'status',''),'active'), coalesce((rec->>'is_opening_stock')::boolean,false))
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'restocks',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('inventory', c); skipped := skipped || jsonb_build_object('inventory', s);

  -- EXPENSES (skip restock-generated ones, they are recreated by the restock trigger)
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'expenses','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF coalesce(rec->>'description','') LIKE '%[RESTOCK:%' THEN s := s+1; CONTINUE; END IF;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='expenses' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.expenses (user_id, amount, category, note, expense_date, description, payment_method, recorded_by_name)
    VALUES (uid, coalesce((rec->>'amount')::numeric,0), coalesce(nullif(rec->>'category',''),'Other'), rec->>'note',
            coalesce(nullif(rec->>'expense_date','')::timestamptz, now()), rec->>'description', rec->>'payment_method', rec->>'recorded_by_name')
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'expenses',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('expenses', c); skipped := skipped || jsonb_build_object('expenses', s);

  -- OTHER INCOME
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'other_income','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='other_income' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.other_income (user_id, source, amount, note, income_date, category, payment_method, description, recorded_by_name)
    VALUES (uid, rec->>'source', coalesce((rec->>'amount')::numeric,0), rec->>'note',
            coalesce(nullif(rec->>'income_date','')::timestamptz, now()), rec->>'category', rec->>'payment_method', rec->>'description', rec->>'recorded_by_name')
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'other_income',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('other_income', c); skipped := skipped || jsonb_build_object('other_income', s);

  -- SAVINGS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'savings','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='savings' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.savings (user_id, amount, savings_date, type, institution, account_name, note, source, reference, bank_account_id)
    VALUES (uid, coalesce((rec->>'amount')::numeric,0), coalesce(nullif(rec->>'savings_date','')::timestamptz, now()),
            nullif(rec->>'type','')::savings_type, rec->>'institution', rec->>'account_name', rec->>'note', rec->>'source', rec->>'reference',
            (SELECT m.new_id FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='bank_accounts' AND m.source_id = nullif(rec->>'bank_account_id','')::uuid))
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'savings',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('savings', c); skipped := skipped || jsonb_build_object('savings', s);

  -- INVESTMENTS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'investments','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='investments' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.investments (user_id, name, amount, investment_date, status, note)
    VALUES (uid, coalesce(rec->>'name','Investment'), coalesce((rec->>'amount')::numeric,0),
            coalesce(nullif(rec->>'investment_date','')::timestamptz, now()), coalesce(nullif(rec->>'status',''),'active'), rec->>'note')
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'investments',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('investments', c); skipped := skipped || jsonb_build_object('investments', s);

  -- SALES (order-linked sales are recreated by the orders trigger, so they are skipped here)
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'sales','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF nullif(rec->>'order_id','') IS NOT NULL THEN s := s+1; CONTINUE; END IF;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='sales' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.sales (user_id, business_id, total, cost_total, subtotal, discount, amount_paid, balance, payment_method, payment_status,
                              customer_name, customer_phone, customer_id, staff_name, note, notes, status, sale_channel, sale_date, due_date)
    VALUES (uid, uid, coalesce((rec->>'total')::numeric,0), coalesce((rec->>'cost_total')::numeric,0), coalesce((rec->>'subtotal')::numeric,0),
            coalesce((rec->>'discount')::numeric,0), coalesce((rec->>'amount_paid')::numeric,0), coalesce((rec->>'balance')::numeric,0),
            coalesce(nullif(rec->>'payment_method',''),'cash'), coalesce(nullif(rec->>'payment_status',''),'paid'),
            rec->>'customer_name', rec->>'customer_phone',
            (SELECT m.new_id FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='customers' AND m.source_id = nullif(rec->>'customer_id','')::uuid),
            rec->>'staff_name', rec->>'note', rec->>'notes', coalesce(nullif(rec->>'status',''),'completed'),
            coalesce(nullif(rec->>'sale_channel',''),'in_store'),
            coalesce(nullif(rec->>'sale_date','')::timestamptz, now()), nullif(rec->>'due_date','')::timestamptz)
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'sales',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('sales', c); skipped := skipped || jsonb_build_object('sales', s);

  -- SALE ITEMS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'sale_items','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    SELECT m.new_id INTO new_id FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='sales' AND m.source_id = nullif(rec->>'sale_id','')::uuid;
    IF new_id IS NULL THEN s := s+1; CONTINUE; END IF;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='sale_items' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.sale_items (sale_id, user_id, business_id, product_id, product_name, sku, quantity, unit_price, unit_cost, cost_price, line_total)
    VALUES (new_id, uid, uid,
            (SELECT m.new_id FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='products' AND m.source_id = nullif(rec->>'product_id','')::uuid),
            coalesce(rec->>'product_name','Item'), rec->>'sku', coalesce((rec->>'quantity')::numeric,0), coalesce((rec->>'unit_price')::numeric,0),
            coalesce((rec->>'unit_cost')::numeric,0), coalesce((rec->>'cost_price')::numeric,0), coalesce((rec->>'line_total')::numeric,0))
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'sale_items',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('sale_items', c); skipped := skipped || jsonb_build_object('sale_items', s);

  -- ORDERS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'orders','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='orders' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.orders (business_id, customer_name, customer_phone, delivery_location, notes, subtotal, discount, total, amount_paid, balance,
                               payment_method, payment_status, status, created_by_name, assigned_to_name, due_date, delivered_at, order_date,
                               carrier_name, carrier_phone, tracking_notes, source, estimated_delivery_date, delivery_fee, fulfillment_type,
                               customer_payment_name, customer_payment_reference)
    VALUES (uid, rec->>'customer_name', rec->>'customer_phone', rec->>'delivery_location', rec->>'notes',
            coalesce((rec->>'subtotal')::numeric,0), coalesce((rec->>'discount')::numeric,0), coalesce((rec->>'total')::numeric,0),
            coalesce((rec->>'amount_paid')::numeric,0), coalesce((rec->>'balance')::numeric,0),
            coalesce(nullif(rec->>'payment_method',''),'cash'), coalesce(nullif(rec->>'payment_status',''),'unpaid'),
            coalesce(nullif(rec->>'status',''),'pending'), rec->>'created_by_name', rec->>'assigned_to_name',
            nullif(rec->>'due_date','')::timestamptz, nullif(rec->>'delivered_at','')::timestamptz,
            coalesce(nullif(rec->>'order_date','')::timestamptz, now()),
            rec->>'carrier_name', rec->>'carrier_phone', rec->>'tracking_notes', coalesce(nullif(rec->>'source',''),'manual'),
            nullif(rec->>'estimated_delivery_date','')::date, coalesce((rec->>'delivery_fee')::numeric,0),
            coalesce(nullif(rec->>'fulfillment_type',''),'delivery'), rec->>'customer_payment_name', rec->>'customer_payment_reference')
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'orders',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('orders', c); skipped := skipped || jsonb_build_object('orders', s);

  -- ORDER ITEMS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'order_items','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    SELECT m.new_id INTO new_id FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='orders' AND m.source_id = nullif(rec->>'order_id','')::uuid;
    IF new_id IS NULL THEN s := s+1; CONTINUE; END IF;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='order_items' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.order_items (business_id, order_id, product_id, product_name, sku, quantity, unit_price, cost_price, line_total)
    VALUES (uid, new_id,
            (SELECT m.new_id FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='products' AND m.source_id = nullif(rec->>'product_id','')::uuid),
            coalesce(rec->>'product_name','Item'), rec->>'sku', coalesce((rec->>'quantity')::numeric,0), coalesce((rec->>'unit_price')::numeric,0),
            coalesce((rec->>'cost_price')::numeric,0), coalesce((rec->>'line_total')::numeric,0))
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'order_items',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('order_items', c); skipped := skipped || jsonb_build_object('order_items', s);

  -- Reconcile stock levels to the values captured in the backup
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'products','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NULL THEN CONTINUE; END IF;
    UPDATE public.products p SET stock = coalesce((rec->>'stock')::numeric, p.stock)
    WHERE p.user_id = uid
      AND p.id = (SELECT m.new_id FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='products' AND m.source_id=src);
  END LOOP;

  INSERT INTO public.restore_logs (id, user_id, business_id, backup_version, backup_created_at, backup_business_name, restore_mode, status, restored_counts, skipped_counts)
  VALUES (v_restore_id, uid, uid, v_version, v_created, nullif(v_biz->>'business_name',''), v_mode, 'success', counts, skipped);

  INSERT INTO public.audit_log (user_id, action, details, performed_by, performed_by_name)
  VALUES (uid, 'backup_restored',
          'Restored backup (' || v_mode || ') v' || v_version || ' - ' || coalesce(v_biz->>'business_name','business'),
          uid, v_display);

  RETURN jsonb_build_object('ok', true, 'restore_id', v_restore_id, 'mode', v_mode, 'restored', counts, 'skipped', skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.restore_business_backup(jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.restore_business_backup(jsonb, text) TO authenticated;
