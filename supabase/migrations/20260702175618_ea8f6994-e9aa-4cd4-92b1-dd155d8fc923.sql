
-- =========================================================================
-- Customer Order Portal & Tracking System
-- Non-destructive extensions to existing profiles, products, orders.
-- =========================================================================

-- 1) Profiles: public store settings + SMS preferences
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS store_slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS online_ordering_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS store_show_stock BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS store_enable_notes BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS store_enable_delivery_address BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS store_enable_product_images BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_notify_new_order BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_notify_order_status BOOLEAN NOT NULL DEFAULT true;

-- 2) Products: online availability + optional richer description
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS available_online BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_description TEXT;

-- 3) Orders: tracking, carrier, source, ETA
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS carrier_name TEXT,
  ADD COLUMN IF NOT EXISTS carrier_phone TEXT,
  ADD COLUMN IF NOT EXISTS tracking_notes TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE;

CREATE INDEX IF NOT EXISTS idx_orders_tracking_code ON public.orders (tracking_code);
CREATE INDEX IF NOT EXISTS idx_orders_business_status ON public.orders (business_id, status);

-- 4) Auto-generate a random unguessable tracking code on insert
CREATE OR REPLACE FUNCTION public.gen_tracking_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  candidate TEXT;
  attempts INT := 0;
BEGIN
  LOOP
    -- KT- + 10 chars of base36-ish from a random UUID (upper-case hex trimmed)
    candidate := 'KT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    PERFORM 1 FROM public.orders WHERE tracking_code = candidate;
    IF NOT FOUND THEN
      RETURN candidate;
    END IF;
    attempts := attempts + 1;
    IF attempts > 8 THEN
      RETURN 'KT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_orders_set_tracking_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tracking_code IS NULL OR NEW.tracking_code = '' THEN
    NEW.tracking_code := public.gen_tracking_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_tracking_code ON public.orders;
CREATE TRIGGER orders_set_tracking_code
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_orders_set_tracking_code();

-- Backfill existing orders without a tracking code
UPDATE public.orders SET tracking_code = public.gen_tracking_code()
 WHERE tracking_code IS NULL;

-- 5) Auto-generate store_slug when a business_name is first set
CREATE OR REPLACE FUNCTION public.slugify(_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s TEXT;
BEGIN
  s := lower(coalesce(_input, ''));
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '^-+|-+$', '', 'g');
  IF s = '' THEN s := 'store'; END IF;
  RETURN s;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_unique_store_slug(_base TEXT, _owner uuid)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  base TEXT := public.slugify(_base);
  candidate TEXT := base;
  n INT := 2;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE store_slug = candidate AND id <> _owner) LOOP
    candidate := base || '-' || n::text;
    n := n + 1;
  END LOOP;
  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_profiles_set_store_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.store_slug IS NULL AND NEW.business_name IS NOT NULL AND btrim(NEW.business_name) <> '' THEN
    NEW.store_slug := public.ensure_unique_store_slug(NEW.business_name, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_store_slug ON public.profiles;
CREATE TRIGGER profiles_set_store_slug
  BEFORE INSERT OR UPDATE OF business_name, store_slug ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_set_store_slug();

-- Backfill existing profiles
UPDATE public.profiles
   SET store_slug = public.ensure_unique_store_slug(business_name, id)
 WHERE store_slug IS NULL
   AND business_name IS NOT NULL
   AND btrim(business_name) <> '';

-- 6) Public read RPCs (SECURITY DEFINER) — the only path anon can use
-- to see store & tracking data. No new RLS on base tables required.

CREATE OR REPLACE FUNCTION public.public_get_store(_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  biz RECORD;
  items JSONB;
BEGIN
  SELECT id, business_name, logo_url, phone, location,
         online_ordering_enabled, store_show_stock, store_enable_notes,
         store_enable_delivery_address, store_enable_product_images, store_slug
    INTO biz
    FROM public.profiles
   WHERE store_slug = _slug
   LIMIT 1;

  IF biz.id IS NULL OR biz.online_ordering_enabled IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb)
    INTO items
    FROM (
      SELECT id, name, online_description, price,
             CASE WHEN biz.store_show_stock THEN stock ELSE NULL END AS stock,
             CASE WHEN biz.store_enable_product_images THEN image_url ELSE NULL END AS image_url,
             category
        FROM public.products
       WHERE user_id = biz.id
         AND available_online = true
         AND COALESCE(is_archived, false) = false
       ORDER BY name ASC
    ) p;

  RETURN jsonb_build_object(
    'business', jsonb_build_object(
      'name', biz.business_name,
      'logo_url', biz.logo_url,
      'phone', biz.phone,
      'location', biz.location,
      'slug', biz.store_slug,
      'show_stock', biz.store_show_stock,
      'enable_notes', biz.store_enable_notes,
      'enable_delivery_address', biz.store_enable_delivery_address,
      'enable_product_images', biz.store_enable_product_images
    ),
    'products', items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.public_get_order_by_tracking(_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o RECORD;
  biz RECORD;
  its JSONB;
BEGIN
  SELECT id, business_id, customer_name, tracking_code, status, payment_status,
         total, subtotal, discount, order_date, delivered_at, estimated_delivery_date,
         carrier_name, carrier_phone, tracking_notes, delivery_location, notes
    INTO o
    FROM public.orders
   WHERE tracking_code = _code
   LIMIT 1;

  IF o.id IS NULL THEN RETURN NULL; END IF;

  SELECT business_name, logo_url, phone, store_slug
    INTO biz FROM public.profiles WHERE id = o.business_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', product_name, 'quantity', quantity, 'unit_price', unit_price, 'line_total', line_total
  )), '[]'::jsonb)
    INTO its FROM public.order_items WHERE order_id = o.id;

  RETURN jsonb_build_object(
    'tracking_code', o.tracking_code,
    'status', o.status,
    'payment_status', o.payment_status,
    'customer_name', o.customer_name,
    'total', o.total,
    'subtotal', o.subtotal,
    'discount', o.discount,
    'order_date', o.order_date,
    'delivered_at', o.delivered_at,
    'estimated_delivery_date', o.estimated_delivery_date,
    'carrier_name', CASE WHEN o.status = 'out_for_delivery' THEN o.carrier_name ELSE NULL END,
    'carrier_phone', CASE WHEN o.status = 'out_for_delivery' THEN o.carrier_phone ELSE NULL END,
    'tracking_notes', CASE WHEN o.status = 'out_for_delivery' THEN o.tracking_notes ELSE NULL END,
    'delivery_location', o.delivery_location,
    'notes', o.notes,
    'items', its,
    'business', jsonb_build_object(
      'name', biz.business_name,
      'logo_url', biz.logo_url,
      'phone', biz.phone,
      'slug', biz.store_slug
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_get_store(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_order_by_tracking(TEXT) TO anon, authenticated;
