-- Restore .kuditrack backups against the production multi-tenant schema.
-- This migration creates/replaces functions and support tables only. It does
-- not restore backup data or mutate existing business records by itself.

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

DROP POLICY IF EXISTS "own restore map read" ON public.restore_record_map;
CREATE POLICY "own restore map read"
ON public.restore_record_map
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

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

DROP POLICY IF EXISTS "own restore logs read" ON public.restore_logs;
CREATE POLICY "own restore logs read"
ON public.restore_logs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.kuditrack_restore_uuid(_value text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
BEGIN
  IF NULLIF(trim(COALESCE(_value, '')), '') IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN trim(_value)::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.kuditrack_restore_numeric(_value text, _fallback numeric DEFAULT 0)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
BEGIN
  IF NULLIF(trim(COALESCE(_value, '')), '') IS NULL THEN
    RETURN _fallback;
  END IF;

  RETURN trim(_value)::numeric;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN _fallback;
END;
$function$;

CREATE OR REPLACE FUNCTION public.kuditrack_restore_int(_value text, _fallback integer DEFAULT 0)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
BEGIN
  IF NULLIF(trim(COALESCE(_value, '')), '') IS NULL THEN
    RETURN _fallback;
  END IF;

  RETURN floor(trim(_value)::numeric)::integer;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN _fallback;
  WHEN numeric_value_out_of_range THEN
    RETURN _fallback;
END;
$function$;

CREATE OR REPLACE FUNCTION public.kuditrack_restore_bool(_value text, _fallback boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v text := lower(trim(COALESCE(_value, '')));
BEGIN
  IF v IN ('true', 't', '1', 'yes', 'y', 'on') THEN
    RETURN true;
  END IF;

  IF v IN ('false', 'f', '0', 'no', 'n', 'off') THEN
    RETURN false;
  END IF;

  RETURN _fallback;
END;
$function$;

CREATE OR REPLACE FUNCTION public.kuditrack_restore_timestamptz(_value text, _fallback timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
BEGIN
  IF NULLIF(trim(COALESCE(_value, '')), '') IS NULL THEN
    RETURN _fallback;
  END IF;

  RETURN trim(_value)::timestamptz;
EXCEPTION
  WHEN datetime_field_overflow THEN
    RETURN _fallback;
  WHEN invalid_datetime_format THEN
    RETURN _fallback;
END;
$function$;

CREATE OR REPLACE FUNCTION public.kuditrack_restore_date(_value text)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
BEGIN
  IF NULLIF(trim(COALESCE(_value, '')), '') IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN trim(_value)::date;
EXCEPTION
  WHEN datetime_field_overflow THEN
    RETURN NULL;
  WHEN invalid_datetime_format THEN
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.kuditrack_restore_text_array(_value jsonb)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  out_values text[];
BEGIN
  IF _value IS NULL OR jsonb_typeof(_value) <> 'array' THEN
    RETURN '{}'::text[];
  END IF;

  SELECT COALESCE(array_agg(value), '{}'::text[])
  INTO out_values
  FROM jsonb_array_elements_text(_value) AS value;

  RETURN out_values;
END;
$function$;

-- Production currently has a stale restock trigger function that writes to
-- legacy stock_movements columns. Restore inserts restocks, so keep this
-- trigger aligned with the current movement ledger schema.
CREATE OR REPLACE FUNCTION public.handle_restock_stock_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_business_id uuid;
  v_product_id uuid;
  v_reason text;
  v_stock numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_business_id := OLD.business_id;
    v_product_id := OLD.product_id;

    IF v_product_id IS NOT NULL AND v_business_id IS NOT NULL THEN
      DELETE FROM public.stock_movements
      WHERE source_table = 'restocks'
        AND source_id = OLD.id
        AND movement_type IN ('restock', 'opening_stock')
        AND product_id = v_product_id
        AND business_id = v_business_id;

      PERFORM public.sync_product_stock(v_product_id, v_business_id);
    END IF;

    RETURN OLD;
  END IF;

  v_business_id := NEW.business_id;
  v_product_id := NEW.product_id;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.product_id IS NOT NULL AND OLD.business_id IS NOT NULL THEN
      DELETE FROM public.stock_movements
      WHERE source_table = 'restocks'
        AND source_id = OLD.id
        AND movement_type IN ('restock', 'opening_stock')
        AND product_id = OLD.product_id
        AND business_id = OLD.business_id;

      PERFORM public.sync_product_stock(OLD.product_id, OLD.business_id);
    END IF;
  END IF;

  IF COALESCE(NEW.status, 'active') <> 'cancelled'
     AND NEW.product_id IS NOT NULL
     AND NEW.business_id IS NOT NULL THEN
    v_reason := CASE
      WHEN COALESCE(NEW.is_opening_stock, false) THEN 'opening_stock'
      ELSE 'restock'
    END;

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
    )
    VALUES (
      NEW.business_id,
      NEW.product_id,
      v_reason,
      abs(COALESCE(NEW.quantity_added, 0)),
      0,
      COALESCE(NEW.cost_price_per_unit, 0),
      COALESCE((SELECT p.selling_price FROM public.products p WHERE p.id = NEW.product_id), 0),
      'restocks',
      NEW.id,
      COALESCE(NULLIF(NEW.note, ''), NULLIF(NEW.reference, ''), CASE WHEN COALESCE(NEW.is_opening_stock, false) THEN 'Opening Stock' ELSE 'Restock' END),
      NEW.recorded_by,
      COALESCE(NEW.recorded_by_name, ''),
      COALESCE(NEW.restock_date, now())
    );

    v_stock := public.sync_product_stock(NEW.product_id, NEW.business_id);

    UPDATE public.stock_movements sm
       SET quantity_after = COALESCE(v_stock, 0)
     WHERE sm.source_table = 'restocks'
       AND sm.source_id = NEW.id
       AND sm.movement_type = v_reason
       AND sm.product_id = NEW.product_id
       AND sm.business_id = NEW.business_id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_business_backup(_payload jsonb, _mode text DEFAULT 'fresh')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_mode text := lower(COALESCE(NULLIF(trim(_mode), ''), 'fresh'));
  v_business_id uuid;
  v_profile_id uuid;
  v_owner_user_id uuid;
  v_restore_id uuid := gen_random_uuid();
  v_version integer;
  v_created timestamptz;
  v_biz jsonb := COALESCE(_payload->'business', '{}'::jsonb);
  v_display text;
  rec jsonb;
  new_id uuid;
  src uuid;
  source_product_id uuid;
  source_customer_id uuid;
  source_bank_account_id uuid;
  source_sale_id uuid;
  source_order_id uuid;
  mapped_product_id uuid;
  mapped_customer_id uuid;
  mapped_bank_account_id uuid;
  mapped_sale_id uuid;
  mapped_order_id uuid;
  candidate_sku text;
  quantity_value integer;
  stock_value numeric;
  selling_value numeric;
  cost_value numeric;
  reorder_value integer;
  counts jsonb := '{}'::jsonb;
  skipped jsonb := '{}'::jsonb;
  c integer;
  s integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid backup file';
  END IF;

  IF COALESCE(_payload->>'format', '') <> 'kuditrack-backup' THEN
    RAISE EXCEPTION 'Invalid backup file';
  END IF;

  v_version := public.kuditrack_restore_int(_payload->>'version', 0);
  IF v_version < 1 THEN
    RAISE EXCEPTION 'Invalid backup version';
  END IF;
  IF v_version > 1 THEN
    RAISE EXCEPTION 'This backup was created with a newer version of KudiTrack and cannot currently be restored.';
  END IF;

  IF v_mode NOT IN ('fresh', 'new_business', 'merge') THEN
    RAISE EXCEPTION 'Unsupported restore mode';
  END IF;

  SELECT p.id, p.business_id, p.user_id, COALESCE(NULLIF(p.display_name, ''), NULLIF(p.email, ''), NULLIF(p.business_name, ''), '')
  INTO v_profile_id, v_business_id, v_owner_user_id, v_display
  FROM public.profiles p
  WHERE p.user_id = uid OR p.id = uid
  ORDER BY CASE WHEN p.user_id = uid THEN 0 ELSE 1 END
  LIMIT 1;

  v_business_id := COALESCE(v_business_id, public.get_user_business_id(uid));
  v_owner_user_id := COALESCE(
    (SELECT b.owner_user_id FROM public.businesses b WHERE b.id = v_business_id),
    v_owner_user_id,
    uid
  );

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'No business profile found for this account. Finish setup before restoring a backup.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.businesses b
    WHERE b.id = v_business_id
      AND b.owner_user_id = uid
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = uid
      AND ur.business_id = v_business_id
      AND ur.role::text = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only a business owner or admin can restore a backup';
  END IF;

  v_created := public.kuditrack_restore_timestamptz(_payload->>'created_at', NULL);

  IF v_mode IN ('fresh', 'new_business') THEN
    UPDATE public.businesses b
       SET name = COALESCE(NULLIF(v_biz->>'business_name', ''), b.name),
           business_type = COALESCE(NULLIF(v_biz->>'business_type', ''), b.business_type),
           phone = COALESCE(NULLIF(v_biz->>'phone', ''), b.phone),
           location = COALESCE(NULLIF(v_biz->>'location', ''), b.location),
           number_of_employees = COALESCE(public.kuditrack_restore_int(v_biz->>'num_employees', NULL), b.number_of_employees),
           logo_light_url = COALESCE(NULLIF(v_biz->>'logo_url', ''), b.logo_light_url),
           logo_dark_url = COALESCE(NULLIF(v_biz->>'logo_url', ''), b.logo_dark_url),
           allow_sales_without_stock = COALESCE(public.kuditrack_restore_bool(v_biz->>'allow_sales_without_stock', NULL), b.allow_sales_without_stock),
           status = 'active',
           updated_at = now()
     WHERE b.id = v_business_id;

    UPDATE public.profiles p
       SET business_id = COALESCE(p.business_id, v_business_id),
           business_name = COALESCE(NULLIF(v_biz->>'business_name', ''), p.business_name),
           business_type = COALESCE(NULLIF(v_biz->>'business_type', ''), p.business_type),
           phone = COALESCE(NULLIF(v_biz->>'phone', ''), p.phone),
           location = COALESCE(NULLIF(v_biz->>'location', ''), p.location),
           num_employees = COALESCE(NULLIF(v_biz->>'num_employees', ''), p.num_employees),
           logo_url = COALESCE(NULLIF(v_biz->>'logo_url', ''), p.logo_url),
           opening_cash_balance = COALESCE(public.kuditrack_restore_numeric(v_biz->>'opening_cash_balance', NULL), p.opening_cash_balance),
           onboarding_completed = true,
           updated_at = now()
     WHERE p.id = v_profile_id OR p.user_id = uid;
  END IF;

  -- PRODUCTS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'products', '[]'::jsonb)) LOOP
    src := public.kuditrack_restore_uuid(rec->>'id');
    new_id := NULL;

    IF src IS NOT NULL THEN
      SELECT m.new_id INTO new_id
      FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'products' AND m.source_id = src
      LIMIT 1;

      IF new_id IS NOT NULL THEN
        s := s + 1;
        CONTINUE;
      END IF;
    END IF;

    IF v_mode = 'merge' THEN
      SELECT p.id INTO new_id
      FROM public.products p
      WHERE p.business_id = v_business_id
        AND (
          (NULLIF(rec->>'sku', '') IS NOT NULL AND p.sku = rec->>'sku')
          OR lower(p.name) = lower(COALESCE(NULLIF(rec->>'name', ''), 'Product'))
        )
      LIMIT 1;

      IF new_id IS NOT NULL THEN
        IF src IS NOT NULL THEN
          INSERT INTO public.restore_record_map(user_id, entity, source_id, new_id, restore_id)
          VALUES (uid, 'products', src, new_id, v_restore_id)
          ON CONFLICT DO NOTHING;
        END IF;
        s := s + 1;
        CONTINUE;
      END IF;
    END IF;

    new_id := gen_random_uuid();
    candidate_sku := COALESCE(NULLIF(trim(rec->>'sku'), ''), 'RESTORE-' || substr(new_id::text, 1, 8));
    IF EXISTS (SELECT 1 FROM public.products p WHERE p.sku = candidate_sku) THEN
      candidate_sku := left(candidate_sku, 80) || '-' || substr(new_id::text, 1, 8);
    END IF;

    cost_value := public.kuditrack_restore_numeric(rec->>'cost_price', public.kuditrack_restore_numeric(rec->>'cost', 0));
    selling_value := public.kuditrack_restore_numeric(rec->>'selling_price', public.kuditrack_restore_numeric(rec->>'price', 0));
    quantity_value := public.kuditrack_restore_int(rec->>'quantity', public.kuditrack_restore_int(rec->>'stock', 0));
    stock_value := public.kuditrack_restore_numeric(rec->>'stock', quantity_value);
    reorder_value := public.kuditrack_restore_int(rec->>'reorder_level', public.kuditrack_restore_int(rec->>'low_stock_threshold', 5));

    INSERT INTO public.products (
      id, business_id, user_id, name, sku, category, brand, sizes, colors,
      cost_price, selling_price, quantity, reorder_level, supplier, image_url,
      barcode, low_stock_threshold, is_archived, stock, created_at
    )
    VALUES (
      new_id,
      v_business_id,
      v_owner_user_id,
      COALESCE(NULLIF(rec->>'name', ''), 'Product'),
      candidate_sku,
      COALESCE(NULLIF(rec->>'category', ''), 'General'),
      COALESCE(rec->>'brand', ''),
      public.kuditrack_restore_text_array(rec->'sizes'),
      public.kuditrack_restore_text_array(rec->'colors'),
      cost_value,
      selling_value,
      GREATEST(quantity_value, 0),
      GREATEST(reorder_value, 0),
      COALESCE(rec->>'supplier', ''),
      COALESCE(rec->>'image_url', ''),
      COALESCE(rec->>'barcode', ''),
      GREATEST(reorder_value, 0),
      public.kuditrack_restore_bool(rec->>'is_archived', false),
      GREATEST(stock_value, 0),
      public.kuditrack_restore_timestamptz(rec->>'created_at', now())
    );

    IF src IS NOT NULL THEN
      INSERT INTO public.restore_record_map(user_id, entity, source_id, new_id, restore_id)
      VALUES (uid, 'products', src, new_id, v_restore_id)
      ON CONFLICT DO NOTHING;
    END IF;
    c := c + 1;
  END LOOP;
  counts := counts || jsonb_build_object('products', c);
  skipped := skipped || jsonb_build_object('products', s);

  -- CUSTOMERS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'customers', '[]'::jsonb)) LOOP
    src := public.kuditrack_restore_uuid(rec->>'id');
    new_id := NULL;

    IF src IS NOT NULL THEN
      SELECT m.new_id INTO new_id
      FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'customers' AND m.source_id = src
      LIMIT 1;

      IF new_id IS NOT NULL THEN
        s := s + 1;
        CONTINUE;
      END IF;
    END IF;

    IF v_mode = 'merge' THEN
      SELECT x.id INTO new_id
      FROM public.customers x
      WHERE x.business_id = v_business_id
        AND lower(x.name) = lower(COALESCE(NULLIF(rec->>'name', ''), 'Customer'))
        AND COALESCE(x.phone, '') = COALESCE(rec->>'phone', '')
      LIMIT 1;

      IF new_id IS NOT NULL THEN
        IF src IS NOT NULL THEN
          INSERT INTO public.restore_record_map(user_id, entity, source_id, new_id, restore_id)
          VALUES (uid, 'customers', src, new_id, v_restore_id)
          ON CONFLICT DO NOTHING;
        END IF;
        s := s + 1;
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO public.customers (
      business_id, name, phone, email, location, notes, created_at
    )
    VALUES (
      v_business_id,
      COALESCE(NULLIF(rec->>'name', ''), 'Customer'),
      COALESCE(rec->>'phone', ''),
      COALESCE(rec->>'email', ''),
      COALESCE(rec->>'location', ''),
      COALESCE(NULLIF(rec->>'notes', ''), rec->>'note', ''),
      public.kuditrack_restore_timestamptz(rec->>'created_at', now())
    )
    RETURNING id INTO new_id;

    IF src IS NOT NULL THEN
      INSERT INTO public.restore_record_map(user_id, entity, source_id, new_id, restore_id)
      VALUES (uid, 'customers', src, new_id, v_restore_id)
      ON CONFLICT DO NOTHING;
    END IF;
    c := c + 1;
  END LOOP;
  counts := counts || jsonb_build_object('customers', c);
  skipped := skipped || jsonb_build_object('customers', s);

  -- BANK ACCOUNTS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'bank_accounts', '[]'::jsonb)) LOOP
    src := public.kuditrack_restore_uuid(rec->>'id');
    new_id := NULL;

    IF src IS NOT NULL THEN
      SELECT m.new_id INTO new_id
      FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'bank_accounts' AND m.source_id = src
      LIMIT 1;

      IF new_id IS NOT NULL THEN
        s := s + 1;
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO public.bank_accounts (
      business_id, user_id, bank_name, account_name, account_number, branch,
      mobile_money_name, mobile_money_number, account_type, note, created_at
    )
    VALUES (
      v_business_id,
      v_owner_user_id,
      COALESCE(NULLIF(rec->>'bank_name', ''), 'Bank account'),
      COALESCE(rec->>'account_name', ''),
      COALESCE(rec->>'account_number', ''),
      COALESCE(rec->>'branch', ''),
      COALESCE(rec->>'mobile_money_name', ''),
      COALESCE(rec->>'mobile_money_number', ''),
      COALESCE(NULLIF(rec->>'account_type', ''), 'bank'),
      COALESCE(rec->>'note', ''),
      public.kuditrack_restore_timestamptz(rec->>'created_at', now())
    )
    RETURNING id INTO new_id;

    IF src IS NOT NULL THEN
      INSERT INTO public.restore_record_map(user_id, entity, source_id, new_id, restore_id)
      VALUES (uid, 'bank_accounts', src, new_id, v_restore_id)
      ON CONFLICT DO NOTHING;
    END IF;
    c := c + 1;
  END LOOP;
  counts := counts || jsonb_build_object('bank_accounts', c);
  skipped := skipped || jsonb_build_object('bank_accounts', s);

  -- RESTOCKS / INVENTORY
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'inventory', '[]'::jsonb)) LOOP
    src := public.kuditrack_restore_uuid(rec->>'id');
    source_product_id := public.kuditrack_restore_uuid(rec->>'product_id');
    mapped_product_id := NULL;
    new_id := NULL;

    IF src IS NOT NULL THEN
      SELECT m.new_id INTO new_id
      FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'restocks' AND m.source_id = src
      LIMIT 1;

      IF new_id IS NOT NULL THEN
        s := s + 1;
        CONTINUE;
      END IF;
    END IF;

    IF source_product_id IS NOT NULL THEN
      SELECT m.new_id INTO mapped_product_id
      FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'products' AND m.source_id = source_product_id
      LIMIT 1;
    END IF;

    IF mapped_product_id IS NULL AND NULLIF(rec->>'product_name', '') IS NOT NULL THEN
      SELECT p.id INTO mapped_product_id
      FROM public.products p
      WHERE p.business_id = v_business_id
        AND lower(p.name) = lower(rec->>'product_name')
      LIMIT 1;
    END IF;

    INSERT INTO public.restocks (
      business_id, user_id, product_id, product_name, sku, category, supplier,
      quantity_added, cost_price_per_unit, total_cost, restock_date, recorded_by,
      recorded_by_name, payment_method, bank_account_id, reference, note, status,
      is_opening_stock, created_at
    )
    VALUES (
      v_business_id,
      v_owner_user_id,
      mapped_product_id,
      COALESCE(NULLIF(rec->>'product_name', ''), 'Product'),
      COALESCE(rec->>'sku', ''),
      COALESCE(NULLIF(rec->>'category', ''), 'General'),
      COALESCE(rec->>'supplier', ''),
      GREATEST(public.kuditrack_restore_int(rec->>'quantity_added', 0), 0),
      public.kuditrack_restore_numeric(rec->>'cost_price_per_unit', 0),
      public.kuditrack_restore_numeric(rec->>'total_cost', 0),
      public.kuditrack_restore_timestamptz(rec->>'restock_date', now()),
      uid,
      COALESCE(v_display, ''),
      COALESCE(NULLIF(rec->>'payment_method', ''), 'cash'),
      NULL,
      COALESCE(rec->>'reference', ''),
      COALESCE(rec->>'note', ''),
      COALESCE(NULLIF(rec->>'status', ''), 'active'),
      public.kuditrack_restore_bool(rec->>'is_opening_stock', false),
      public.kuditrack_restore_timestamptz(rec->>'created_at', now())
    )
    RETURNING id INTO new_id;

    IF src IS NOT NULL THEN
      INSERT INTO public.restore_record_map(user_id, entity, source_id, new_id, restore_id)
      VALUES (uid, 'restocks', src, new_id, v_restore_id)
      ON CONFLICT DO NOTHING;
    END IF;
    c := c + 1;
  END LOOP;
  counts := counts || jsonb_build_object('inventory', c);
  skipped := skipped || jsonb_build_object('inventory', s);

  -- EXPENSES
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'expenses', '[]'::jsonb)) LOOP
    src := public.kuditrack_restore_uuid(rec->>'id');

    IF COALESCE(rec->>'description', '') LIKE '%[RESTOCK:%' THEN
      s := s + 1;
      CONTINUE;
    END IF;

    IF src IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'expenses' AND m.source_id = src
    ) THEN
      s := s + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.expenses (
      business_id, amount, category, description, expense_date, payment_method,
      attachment_path, attachment_name, recorded_by, recorded_by_name, created_at
    )
    VALUES (
      v_business_id,
      public.kuditrack_restore_numeric(rec->>'amount', 0),
      COALESCE(NULLIF(rec->>'category', ''), 'miscellaneous'),
      COALESCE(NULLIF(rec->>'description', ''), rec->>'note', ''),
      public.kuditrack_restore_timestamptz(rec->>'expense_date', now()),
      COALESCE(NULLIF(rec->>'payment_method', ''), 'cash'),
      NULLIF(rec->>'attachment_path', ''),
      NULLIF(rec->>'attachment_name', ''),
      uid,
      COALESCE(v_display, ''),
      public.kuditrack_restore_timestamptz(rec->>'created_at', now())
    )
    RETURNING id INTO new_id;

    IF src IS NOT NULL THEN
      INSERT INTO public.restore_record_map(user_id, entity, source_id, new_id, restore_id)
      VALUES (uid, 'expenses', src, new_id, v_restore_id)
      ON CONFLICT DO NOTHING;
    END IF;
    c := c + 1;
  END LOOP;
  counts := counts || jsonb_build_object('expenses', c);
  skipped := skipped || jsonb_build_object('expenses', s);

  -- OTHER INCOME
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'other_income', '[]'::jsonb)) LOOP
    src := public.kuditrack_restore_uuid(rec->>'id');

    IF src IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'other_income' AND m.source_id = src
    ) THEN
      s := s + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.other_income (
      business_id, category, amount, income_date, payment_method, description,
      attachment_path, attachment_name, recorded_by, recorded_by_name, created_at
    )
    VALUES (
      v_business_id,
      COALESCE(NULLIF(rec->>'category', ''), NULLIF(rec->>'source', ''), 'Other'),
      public.kuditrack_restore_numeric(rec->>'amount', 0),
      public.kuditrack_restore_timestamptz(rec->>'income_date', now()),
      COALESCE(NULLIF(rec->>'payment_method', ''), 'cash'),
      COALESCE(NULLIF(rec->>'description', ''), rec->>'note', ''),
      NULLIF(rec->>'attachment_path', ''),
      NULLIF(rec->>'attachment_name', ''),
      uid,
      COALESCE(v_display, ''),
      public.kuditrack_restore_timestamptz(rec->>'created_at', now())
    )
    RETURNING id INTO new_id;

    IF src IS NOT NULL THEN
      INSERT INTO public.restore_record_map(user_id, entity, source_id, new_id, restore_id)
      VALUES (uid, 'other_income', src, new_id, v_restore_id)
      ON CONFLICT DO NOTHING;
    END IF;
    c := c + 1;
  END LOOP;
  counts := counts || jsonb_build_object('other_income', c);
  skipped := skipped || jsonb_build_object('other_income', s);

  -- SAVINGS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'savings', '[]'::jsonb)) LOOP
    src := public.kuditrack_restore_uuid(rec->>'id');
    source_bank_account_id := public.kuditrack_restore_uuid(rec->>'bank_account_id');
    mapped_bank_account_id := NULL;

    IF src IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'savings' AND m.source_id = src
    ) THEN
      s := s + 1;
      CONTINUE;
    END IF;

    IF source_bank_account_id IS NOT NULL THEN
      SELECT m.new_id INTO mapped_bank_account_id
      FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'bank_accounts' AND m.source_id = source_bank_account_id
      LIMIT 1;
    END IF;

    INSERT INTO public.savings (
      business_id, user_id, amount, savings_date, source, note,
      bank_account_id, reference, recorded_by, created_at
    )
    VALUES (
      v_business_id,
      v_owner_user_id,
      public.kuditrack_restore_numeric(rec->>'amount', 0),
      public.kuditrack_restore_timestamptz(rec->>'savings_date', now()),
      COALESCE(rec->>'source', ''),
      COALESCE(rec->>'note', ''),
      mapped_bank_account_id,
      COALESCE(rec->>'reference', ''),
      uid,
      public.kuditrack_restore_timestamptz(rec->>'created_at', now())
    )
    RETURNING id INTO new_id;

    IF src IS NOT NULL THEN
      INSERT INTO public.restore_record_map(user_id, entity, source_id, new_id, restore_id)
      VALUES (uid, 'savings', src, new_id, v_restore_id)
      ON CONFLICT DO NOTHING;
    END IF;
    c := c + 1;
  END LOOP;
  counts := counts || jsonb_build_object('savings', c);
  skipped := skipped || jsonb_build_object('savings', s);

  -- INVESTMENTS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'investments', '[]'::jsonb)) LOOP
    src := public.kuditrack_restore_uuid(rec->>'id');
    source_bank_account_id := public.kuditrack_restore_uuid(rec->>'bank_account_id');
    mapped_bank_account_id := NULL;

    IF src IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'investments' AND m.source_id = src
    ) THEN
      s := s + 1;
      CONTINUE;
    END IF;

    IF source_bank_account_id IS NOT NULL THEN
      SELECT m.new_id INTO mapped_bank_account_id
      FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'bank_accounts' AND m.source_id = source_bank_account_id
      LIMIT 1;
    END IF;

    INSERT INTO public.investments (
      business_id, user_id, investment_name, amount, investment_date,
      expected_return, duration, status, note, bank_account_id, reference,
      recorded_by, created_at
    )
    VALUES (
      v_business_id,
      v_owner_user_id,
      COALESCE(NULLIF(rec->>'investment_name', ''), NULLIF(rec->>'name', ''), 'Investment'),
      public.kuditrack_restore_numeric(rec->>'amount', 0),
      public.kuditrack_restore_timestamptz(rec->>'investment_date', now()),
      public.kuditrack_restore_numeric(rec->>'expected_return', 0),
      COALESCE(rec->>'duration', ''),
      COALESCE(NULLIF(rec->>'status', ''), 'active'),
      COALESCE(rec->>'note', ''),
      mapped_bank_account_id,
      COALESCE(rec->>'reference', ''),
      uid,
      public.kuditrack_restore_timestamptz(rec->>'created_at', now())
    )
    RETURNING id INTO new_id;

    IF src IS NOT NULL THEN
      INSERT INTO public.restore_record_map(user_id, entity, source_id, new_id, restore_id)
      VALUES (uid, 'investments', src, new_id, v_restore_id)
      ON CONFLICT DO NOTHING;
    END IF;
    c := c + 1;
  END LOOP;
  counts := counts || jsonb_build_object('investments', c);
  skipped := skipped || jsonb_build_object('investments', s);

  -- SALES
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'sales', '[]'::jsonb)) LOOP
    src := public.kuditrack_restore_uuid(rec->>'id');
    source_customer_id := public.kuditrack_restore_uuid(rec->>'customer_id');
    mapped_customer_id := NULL;

    IF public.kuditrack_restore_uuid(rec->>'order_id') IS NOT NULL THEN
      s := s + 1;
      CONTINUE;
    END IF;

    IF src IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'sales' AND m.source_id = src
    ) THEN
      s := s + 1;
      CONTINUE;
    END IF;

    IF source_customer_id IS NOT NULL THEN
      SELECT m.new_id INTO mapped_customer_id
      FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'customers' AND m.source_id = source_customer_id
      LIMIT 1;
    END IF;

    INSERT INTO public.sales (
      business_id, sale_date, customer_id, customer_name, customer_phone,
      staff_id, staff_name, subtotal, discount, total, amount_paid, balance,
      payment_method, payment_status, notes, due_date, status, sale_channel,
      order_id, stock_status, stock_shortfall, created_at
    )
    VALUES (
      v_business_id,
      public.kuditrack_restore_timestamptz(rec->>'sale_date', now()),
      mapped_customer_id,
      COALESCE(rec->>'customer_name', ''),
      COALESCE(rec->>'customer_phone', ''),
      uid,
      COALESCE(NULLIF(rec->>'staff_name', ''), v_display, ''),
      public.kuditrack_restore_numeric(rec->>'subtotal', public.kuditrack_restore_numeric(rec->>'total', 0)),
      public.kuditrack_restore_numeric(rec->>'discount', 0),
      public.kuditrack_restore_numeric(rec->>'total', 0),
      public.kuditrack_restore_numeric(rec->>'amount_paid', public.kuditrack_restore_numeric(rec->>'total', 0)),
      public.kuditrack_restore_numeric(rec->>'balance', 0),
      COALESCE(NULLIF(rec->>'payment_method', ''), 'cash'),
      COALESCE(NULLIF(rec->>'payment_status', ''), 'paid'),
      COALESCE(NULLIF(rec->>'notes', ''), rec->>'note', ''),
      public.kuditrack_restore_timestamptz(rec->>'due_date', NULL),
      COALESCE(NULLIF(rec->>'status', ''), 'completed'),
      COALESCE(NULLIF(rec->>'sale_channel', ''), 'pos'),
      NULL,
      COALESCE(NULLIF(rec->>'stock_status', ''), 'in_stock'),
      public.kuditrack_restore_int(rec->>'stock_shortfall', 0),
      public.kuditrack_restore_timestamptz(rec->>'created_at', now())
    )
    RETURNING id INTO new_id;

    IF src IS NOT NULL THEN
      INSERT INTO public.restore_record_map(user_id, entity, source_id, new_id, restore_id)
      VALUES (uid, 'sales', src, new_id, v_restore_id)
      ON CONFLICT DO NOTHING;
    END IF;
    c := c + 1;
  END LOOP;
  counts := counts || jsonb_build_object('sales', c);
  skipped := skipped || jsonb_build_object('sales', s);

  -- SALE ITEMS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'sale_items', '[]'::jsonb)) LOOP
    src := public.kuditrack_restore_uuid(rec->>'id');
    source_sale_id := public.kuditrack_restore_uuid(rec->>'sale_id');
    source_product_id := public.kuditrack_restore_uuid(rec->>'product_id');
    mapped_sale_id := NULL;
    mapped_product_id := NULL;

    IF source_sale_id IS NOT NULL THEN
      SELECT m.new_id INTO mapped_sale_id
      FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'sales' AND m.source_id = source_sale_id
      LIMIT 1;
    END IF;

    IF mapped_sale_id IS NULL THEN
      s := s + 1;
      CONTINUE;
    END IF;

    IF src IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'sale_items' AND m.source_id = src
    ) THEN
      s := s + 1;
      CONTINUE;
    END IF;

    IF source_product_id IS NOT NULL THEN
      SELECT m.new_id INTO mapped_product_id
      FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'products' AND m.source_id = source_product_id
      LIMIT 1;
    END IF;

    INSERT INTO public.sale_items (
      business_id, sale_id, product_id, product_name, sku, size, color,
      quantity, unit_price, cost_price, line_total, default_price, price_note,
      created_at
    )
    VALUES (
      v_business_id,
      mapped_sale_id,
      mapped_product_id,
      COALESCE(NULLIF(rec->>'product_name', ''), 'Item'),
      COALESCE(rec->>'sku', ''),
      COALESCE(rec->>'size', ''),
      COALESCE(rec->>'color', ''),
      GREATEST(public.kuditrack_restore_int(rec->>'quantity', 1), 1),
      public.kuditrack_restore_numeric(rec->>'unit_price', 0),
      public.kuditrack_restore_numeric(rec->>'cost_price', public.kuditrack_restore_numeric(rec->>'unit_cost', 0)),
      public.kuditrack_restore_numeric(rec->>'line_total', 0),
      public.kuditrack_restore_numeric(rec->>'default_price', public.kuditrack_restore_numeric(rec->>'unit_price', 0)),
      COALESCE(rec->>'price_note', ''),
      public.kuditrack_restore_timestamptz(rec->>'created_at', now())
    )
    RETURNING id INTO new_id;

    IF src IS NOT NULL THEN
      INSERT INTO public.restore_record_map(user_id, entity, source_id, new_id, restore_id)
      VALUES (uid, 'sale_items', src, new_id, v_restore_id)
      ON CONFLICT DO NOTHING;
    END IF;
    c := c + 1;
  END LOOP;
  counts := counts || jsonb_build_object('sale_items', c);
  skipped := skipped || jsonb_build_object('sale_items', s);

  -- ORDERS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'orders', '[]'::jsonb)) LOOP
    src := public.kuditrack_restore_uuid(rec->>'id');
    source_customer_id := public.kuditrack_restore_uuid(rec->>'customer_id');
    mapped_customer_id := NULL;

    IF src IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'orders' AND m.source_id = src
    ) THEN
      s := s + 1;
      CONTINUE;
    END IF;

    IF source_customer_id IS NOT NULL THEN
      SELECT m.new_id INTO mapped_customer_id
      FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'customers' AND m.source_id = source_customer_id
      LIMIT 1;
    END IF;

    INSERT INTO public.orders (
      business_id, user_id, customer_id, customer_name, customer_phone,
      delivery_location, notes, subtotal, discount, total, amount_paid, balance,
      payment_method, payment_status, status, assigned_to, assigned_to_name,
      created_by, created_by_name, due_date, order_date, delivered_at, created_at
    )
    VALUES (
      v_business_id,
      v_owner_user_id,
      mapped_customer_id,
      COALESCE(NULLIF(rec->>'customer_name', ''), 'Walk-in'),
      COALESCE(rec->>'customer_phone', ''),
      COALESCE(rec->>'delivery_location', ''),
      COALESCE(rec->>'notes', ''),
      public.kuditrack_restore_numeric(rec->>'subtotal', public.kuditrack_restore_numeric(rec->>'total', 0)),
      public.kuditrack_restore_numeric(rec->>'discount', 0),
      public.kuditrack_restore_numeric(rec->>'total', 0),
      public.kuditrack_restore_numeric(rec->>'amount_paid', 0),
      public.kuditrack_restore_numeric(rec->>'balance', 0),
      COALESCE(NULLIF(rec->>'payment_method', ''), 'cash'),
      COALESCE(NULLIF(rec->>'payment_status', ''), 'unpaid'),
      COALESCE(NULLIF(rec->>'status', ''), 'pending'),
      public.kuditrack_restore_uuid(rec->>'assigned_to'),
      COALESCE(rec->>'assigned_to_name', ''),
      uid,
      COALESCE(v_display, ''),
      public.kuditrack_restore_timestamptz(rec->>'due_date', NULL),
      public.kuditrack_restore_timestamptz(rec->>'order_date', now()),
      public.kuditrack_restore_timestamptz(rec->>'delivered_at', NULL),
      public.kuditrack_restore_timestamptz(rec->>'created_at', now())
    )
    RETURNING id INTO new_id;

    IF src IS NOT NULL THEN
      INSERT INTO public.restore_record_map(user_id, entity, source_id, new_id, restore_id)
      VALUES (uid, 'orders', src, new_id, v_restore_id)
      ON CONFLICT DO NOTHING;
    END IF;
    c := c + 1;
  END LOOP;
  counts := counts || jsonb_build_object('orders', c);
  skipped := skipped || jsonb_build_object('orders', s);

  -- ORDER ITEMS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'order_items', '[]'::jsonb)) LOOP
    src := public.kuditrack_restore_uuid(rec->>'id');
    source_order_id := public.kuditrack_restore_uuid(rec->>'order_id');
    source_product_id := public.kuditrack_restore_uuid(rec->>'product_id');
    mapped_order_id := NULL;
    mapped_product_id := NULL;

    IF source_order_id IS NOT NULL THEN
      SELECT m.new_id INTO mapped_order_id
      FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'orders' AND m.source_id = source_order_id
      LIMIT 1;
    END IF;

    IF mapped_order_id IS NULL THEN
      s := s + 1;
      CONTINUE;
    END IF;

    IF src IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'order_items' AND m.source_id = src
    ) THEN
      s := s + 1;
      CONTINUE;
    END IF;

    IF source_product_id IS NOT NULL THEN
      SELECT m.new_id INTO mapped_product_id
      FROM public.restore_record_map m
      WHERE m.user_id = uid AND m.entity = 'products' AND m.source_id = source_product_id
      LIMIT 1;
    END IF;

    INSERT INTO public.order_items (
      business_id, user_id, order_id, product_id, product_name, sku,
      quantity, unit_price, cost_price, line_total, created_at
    )
    VALUES (
      v_business_id,
      v_owner_user_id,
      mapped_order_id,
      mapped_product_id,
      COALESCE(NULLIF(rec->>'product_name', ''), 'Item'),
      COALESCE(rec->>'sku', ''),
      GREATEST(public.kuditrack_restore_int(rec->>'quantity', 1), 1),
      public.kuditrack_restore_numeric(rec->>'unit_price', 0),
      public.kuditrack_restore_numeric(rec->>'cost_price', 0),
      public.kuditrack_restore_numeric(rec->>'line_total', 0),
      public.kuditrack_restore_timestamptz(rec->>'created_at', now())
    )
    RETURNING id INTO new_id;

    IF src IS NOT NULL THEN
      INSERT INTO public.restore_record_map(user_id, entity, source_id, new_id, restore_id)
      VALUES (uid, 'order_items', src, new_id, v_restore_id)
      ON CONFLICT DO NOTHING;
    END IF;
    c := c + 1;
  END LOOP;
  counts := counts || jsonb_build_object('order_items', c);
  skipped := skipped || jsonb_build_object('order_items', s);

  -- Reconcile product quantity/stock to the captured backup values after
  -- restock and sale triggers have produced their ledger entries.
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'products', '[]'::jsonb)) LOOP
    src := public.kuditrack_restore_uuid(rec->>'id');
    IF src IS NULL THEN
      CONTINUE;
    END IF;

    SELECT m.new_id INTO mapped_product_id
    FROM public.restore_record_map m
    WHERE m.user_id = uid AND m.entity = 'products' AND m.source_id = src
    LIMIT 1;

    IF mapped_product_id IS NULL THEN
      CONTINUE;
    END IF;

    quantity_value := public.kuditrack_restore_int(rec->>'quantity', public.kuditrack_restore_int(rec->>'stock', 0));
    stock_value := public.kuditrack_restore_numeric(rec->>'stock', quantity_value);

    UPDATE public.products p
       SET quantity = GREATEST(quantity_value, 0),
           stock = GREATEST(stock_value, 0),
           updated_at = now()
     WHERE p.id = mapped_product_id
       AND p.business_id = v_business_id;
  END LOOP;

  UPDATE public.profiles p
     SET onboarding_completed = true,
         updated_at = now()
   WHERE p.id = v_profile_id OR p.user_id = uid;

  UPDATE public.businesses b
     SET status = CASE WHEN b.status = 'pending' THEN 'active' ELSE b.status END,
         updated_at = now()
   WHERE b.id = v_business_id;

  INSERT INTO public.restore_logs (
    id, user_id, business_id, backup_version, backup_created_at,
    backup_business_name, restore_mode, status, restored_counts, skipped_counts
  )
  VALUES (
    v_restore_id, uid, v_business_id, v_version, v_created,
    NULLIF(v_biz->>'business_name', ''), v_mode, 'success', counts, skipped
  );

  INSERT INTO public.audit_log (
    user_id, business_id, action, details, performed_by, performed_by_name
  )
  VALUES (
    uid,
    v_business_id,
    'backup_restored',
    'Restored backup (' || v_mode || ') v' || v_version || ' - ' || COALESCE(NULLIF(v_biz->>'business_name', ''), 'business'),
    uid,
    COALESCE(v_display, '')
  );

  RETURN jsonb_build_object(
    'ok', true,
    'restore_id', v_restore_id,
    'mode', v_mode,
    'restored', counts,
    'skipped', skipped
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_business_backup(jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.restore_business_backup(jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
