CREATE OR REPLACE FUNCTION public.tg_orders_sync_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing_sale_id uuid;
  new_sale_id uuid;
  should_sync boolean := false;
  v_cost_total numeric := 0;
BEGIN
  IF NEW.status NOT IN ('delivered','completed') THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    should_sync := true;
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    should_sync := true;
  END IF;

  IF NOT should_sync THEN RETURN NEW; END IF;

  SELECT id INTO existing_sale_id FROM public.sales WHERE order_id = NEW.id LIMIT 1;
  IF existing_sale_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(COALESCE(oi.cost_price,0) * COALESCE(oi.quantity,0)), 0)
    INTO v_cost_total
    FROM public.order_items oi WHERE oi.order_id = NEW.id;

  INSERT INTO public.sales (
    user_id, business_id, sale_date, customer_name, customer_phone,
    staff_id, staff_name, subtotal, discount, total, cost_total, amount_paid, balance,
    payment_method, payment_status, notes, status, sale_channel, due_date, order_id
  ) VALUES (
    NEW.business_id, NEW.business_id, COALESCE(NEW.delivered_at, now()),
    NEW.customer_name, NEW.customer_phone,
    COALESCE(NEW.assigned_to, NEW.created_by, NEW.business_id),
    COALESCE(NEW.assigned_to_name, NEW.created_by_name, ''),
    COALESCE(NEW.subtotal, 0), COALESCE(NEW.discount, 0), COALESCE(NEW.total, 0),
    v_cost_total,
    COALESCE(NEW.amount_paid, 0), COALESCE(NEW.balance, 0),
    COALESCE(NEW.payment_method, 'cash'), COALESCE(NEW.payment_status, 'unpaid'),
    NEW.notes, 'delivered', 'order', NEW.due_date, NEW.id
  ) RETURNING id INTO new_sale_id;

  INSERT INTO public.sale_items (
    user_id, business_id, sale_id, product_id, product_name, sku,
    quantity, unit_price, unit_cost, cost_price, line_total
  )
  SELECT NEW.business_id, NEW.business_id, new_sale_id, oi.product_id, oi.product_name,
         COALESCE(oi.sku, ''), oi.quantity, oi.unit_price,
         COALESCE(oi.cost_price, 0), COALESCE(oi.cost_price, 0), oi.line_total
    FROM public.order_items oi
   WHERE oi.order_id = NEW.id;

  RETURN NEW;
END;
$function$;