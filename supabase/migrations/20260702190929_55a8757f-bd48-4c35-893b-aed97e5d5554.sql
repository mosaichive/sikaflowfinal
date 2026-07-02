
-- Additive columns on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fulfillment_type text NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS customer_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_token text;

CREATE INDEX IF NOT EXISTS orders_confirmation_token_idx ON public.orders(confirmation_token);

-- Additive columns on profiles for store settings
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS store_payment_methods text[] NOT NULL DEFAULT ARRAY['cash_on_delivery']::text[],
  ADD COLUMN IF NOT EXISTS store_payment_instructions text,
  ADD COLUMN IF NOT EXISTS orders_auto_publish_products boolean NOT NULL DEFAULT true;

-- Confirmation token generator + trigger
CREATE OR REPLACE FUNCTION public.tg_orders_set_confirmation_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.confirmation_token IS NULL OR NEW.confirmation_token = '' THEN
    NEW.confirmation_token := encode(gen_random_bytes(18), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_confirmation_token ON public.orders;
CREATE TRIGGER orders_set_confirmation_token
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_orders_set_confirmation_token();

-- Update public_get_store to include payment settings and auto-publish behavior
CREATE OR REPLACE FUNCTION public.public_get_store(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  biz RECORD;
  items JSONB;
BEGIN
  SELECT id, business_name, logo_url, phone, location,
         online_ordering_enabled, store_show_stock, store_enable_notes,
         store_enable_delivery_address, store_enable_product_images, store_slug,
         store_payment_methods, store_payment_instructions, orders_auto_publish_products
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
             (COALESCE(stock, 0) > 0) AS available,
             CASE WHEN biz.store_enable_product_images THEN image_url ELSE NULL END AS image_url,
             category
        FROM public.products
       WHERE user_id = biz.id
         AND COALESCE(is_archived, false) = false
         AND (
           biz.orders_auto_publish_products = true
           OR available_online = true
         )
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
      'enable_product_images', biz.store_enable_product_images,
      'payment_methods', COALESCE(biz.store_payment_methods, ARRAY['cash_on_delivery']::text[]),
      'payment_instructions', biz.store_payment_instructions
    ),
    'products', items
  );
END;
$$;

-- Update tracking RPC to include fulfillment/delivery fee (never expose confirmation_token)
CREATE OR REPLACE FUNCTION public.public_get_order_by_tracking(_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o RECORD;
  biz RECORD;
  its JSONB;
BEGIN
  SELECT id, business_id, customer_name, tracking_code, status, payment_status,
         total, subtotal, discount, delivery_fee, fulfillment_type,
         order_date, delivered_at, estimated_delivery_date, customer_confirmed_at,
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
    'delivery_fee', COALESCE(o.delivery_fee, 0),
    'fulfillment_type', COALESCE(o.fulfillment_type, 'delivery'),
    'order_date', o.order_date,
    'delivered_at', o.delivered_at,
    'estimated_delivery_date', o.estimated_delivery_date,
    'customer_confirmed_at', o.customer_confirmed_at,
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

-- Confirm receipt RPC (verified by tracking code + last 4 phone digits)
CREATE OR REPLACE FUNCTION public.public_confirm_order_receipt(_code text, _phone_last4 text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o RECORD;
  phone_digits text;
BEGIN
  IF _code IS NULL OR _phone_last4 IS NULL OR length(_phone_last4) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  SELECT id, business_id, customer_phone, status, customer_confirmed_at, tracking_code
    INTO o
    FROM public.orders
   WHERE tracking_code = _code
   LIMIT 1;

  IF o.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  phone_digits := regexp_replace(COALESCE(o.customer_phone, ''), '\D', '', 'g');
  IF right(phone_digits, 4) <> right(regexp_replace(_phone_last4, '\D', '', 'g'), 4) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_mismatch');
  END IF;

  IF o.customer_confirmed_at IS NOT NULL OR o.status = 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'business_id', o.business_id, 'order_id', o.id, 'tracking_code', o.tracking_code);
  END IF;

  UPDATE public.orders
     SET status = 'completed',
         customer_confirmed_at = now(),
         delivered_at = COALESCE(delivered_at, now()),
         updated_at = now()
   WHERE id = o.id;

  RETURN jsonb_build_object('ok', true, 'business_id', o.business_id, 'order_id', o.id, 'tracking_code', o.tracking_code);
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_confirm_order_receipt(text, text) TO anon, authenticated;
