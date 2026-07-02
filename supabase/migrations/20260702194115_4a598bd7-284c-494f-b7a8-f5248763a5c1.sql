
CREATE OR REPLACE FUNCTION public.public_get_order_by_tracking(_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o RECORD;
  biz RECORD;
  its JSONB;
BEGIN
  SELECT id, business_id, customer_name, tracking_code, status, payment_status,
         total, subtotal, discount, delivery_fee, fulfillment_type,
         order_date, delivered_at, estimated_delivery_date, customer_confirmed_at,
         carrier_name, carrier_phone, tracking_notes, delivery_location, notes,
         payment_method, customer_payment_name, customer_payment_reference
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
    'payment_method', o.payment_method,
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
    'customer_payment_name', o.customer_payment_name,
    'customer_payment_reference', o.customer_payment_reference,
    'items', its,
    'business', jsonb_build_object(
      'name', biz.business_name,
      'logo_url', biz.logo_url,
      'phone', biz.phone,
      'slug', biz.store_slug
    )
  );
END;
$function$;
