
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS store_default_delivery_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS store_allow_pickup boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS store_allow_delivery boolean NOT NULL DEFAULT true;

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
         store_payment_methods, store_payment_instructions, orders_auto_publish_products,
         store_default_delivery_fee, store_allow_pickup, store_allow_delivery
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
      'payment_instructions', biz.store_payment_instructions,
      'default_delivery_fee', COALESCE(biz.store_default_delivery_fee, 0),
      'allow_pickup', COALESCE(biz.store_allow_pickup, true),
      'allow_delivery', COALESCE(biz.store_allow_delivery, true)
    ),
    'products', items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.public_confirm_order_receipt_by_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o RECORD;
BEGIN
  IF _code IS NULL OR btrim(_code) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  SELECT id, business_id, status, customer_confirmed_at, customer_name, tracking_code
    INTO o
    FROM public.orders
   WHERE tracking_code = _code
   LIMIT 1;

  IF o.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF o.customer_confirmed_at IS NOT NULL OR o.status = 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'business_id', o.business_id, 'order_id', o.id, 'customer_name', o.customer_name, 'tracking_code', o.tracking_code);
  END IF;

  IF o.status NOT IN ('delivered', 'out_for_delivery', 'ready_for_pickup') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_yet_delivered', 'status', o.status);
  END IF;

  UPDATE public.orders
     SET status = 'completed',
         customer_confirmed_at = now(),
         delivered_at = COALESCE(delivered_at, now()),
         updated_at = now()
   WHERE id = o.id;

  RETURN jsonb_build_object('ok', true, 'business_id', o.business_id, 'order_id', o.id, 'customer_name', o.customer_name, 'tracking_code', o.tracking_code);
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_confirm_order_receipt_by_code(text) TO anon, authenticated;
