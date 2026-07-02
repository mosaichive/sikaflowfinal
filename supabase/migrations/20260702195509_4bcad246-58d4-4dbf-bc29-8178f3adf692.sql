
-- 1. Split orders RLS so only the owner can DELETE (staff can still SELECT/INSERT/UPDATE).
DROP POLICY IF EXISTS "orders own all" ON public.orders;
DROP POLICY IF EXISTS "orders team all" ON public.orders;

CREATE POLICY "orders owner select" ON public.orders FOR SELECT USING (auth.uid() = business_id);
CREATE POLICY "orders owner insert" ON public.orders FOR INSERT WITH CHECK (auth.uid() = business_id);
CREATE POLICY "orders owner update" ON public.orders FOR UPDATE USING (auth.uid() = business_id) WITH CHECK (auth.uid() = business_id);
CREATE POLICY "orders owner delete" ON public.orders FOR DELETE USING (auth.uid() = business_id);

CREATE POLICY "orders team select" ON public.orders FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY "orders team insert" ON public.orders FOR INSERT WITH CHECK (public.is_business_member(business_id));
CREATE POLICY "orders team update" ON public.orders FOR UPDATE USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
-- NOTE: no DELETE policy for team members — deletion restricted to owner.

-- 2. Lock edits when order is delivered/completed (allow delivered→completed transition
--    and internal timestamp fields used by the receipt confirmation flow).
CREATE OR REPLACE FUNCTION public.tg_orders_lock_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF OLD.status NOT IN ('delivered','completed') THEN RETURN NEW; END IF;

  -- Allow the one legal status transition and internal bookkeeping fields.
  IF OLD.status = 'delivered' AND NEW.status = 'completed' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Order is % and cannot change status.', OLD.status USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.customer_name IS DISTINCT FROM OLD.customer_name
     OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone
     OR NEW.delivery_location IS DISTINCT FROM OLD.delivery_location
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.discount IS DISTINCT FROM OLD.discount
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
     OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
     OR NEW.balance IS DISTINCT FROM OLD.balance
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.fulfillment_type IS DISTINCT FROM OLD.fulfillment_type
     OR NEW.carrier_name IS DISTINCT FROM OLD.carrier_name
     OR NEW.carrier_phone IS DISTINCT FROM OLD.carrier_phone
     OR NEW.tracking_notes IS DISTINCT FROM OLD.tracking_notes
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.estimated_delivery_date IS DISTINCT FROM OLD.estimated_delivery_date
     OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    RAISE EXCEPTION 'Order is % and cannot be modified.', OLD.status USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_lock_completed ON public.orders;
CREATE TRIGGER orders_lock_completed
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_orders_lock_completed();

-- Also lock order_items edits when the parent order is delivered/completed.
CREATE OR REPLACE FUNCTION public.tg_order_items_lock_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  parent_status text;
  parent_id uuid := COALESCE(NEW.order_id, OLD.order_id);
BEGIN
  IF parent_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT status INTO parent_status FROM public.orders WHERE id = parent_id;
  IF parent_status IN ('delivered','completed') AND TG_OP <> 'INSERT' THEN
    -- Allow inserts driven by the sales-sync trigger below (it doesn't touch order_items).
    -- Block updates/deletes on items belonging to locked orders.
    RAISE EXCEPTION 'Order is % and items cannot be modified.', parent_status USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS order_items_lock_completed ON public.order_items;
CREATE TRIGGER order_items_lock_completed
BEFORE UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.tg_order_items_lock_completed();

-- 3. Auto-post to Sales when an order enters delivered/completed.
CREATE OR REPLACE FUNCTION public.tg_orders_sync_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing_sale_id uuid;
  new_sale_id uuid;
  should_sync boolean := false;
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

  INSERT INTO public.sales (
    user_id, business_id, sale_date, customer_name, customer_phone,
    staff_id, staff_name, subtotal, discount, total, amount_paid, balance,
    payment_method, payment_status, notes, status, sale_channel, due_date, order_id
  ) VALUES (
    NEW.business_id, NEW.business_id, COALESCE(NEW.delivered_at, now()),
    NEW.customer_name, NEW.customer_phone,
    COALESCE(NEW.assigned_to, NEW.created_by, NEW.business_id),
    COALESCE(NEW.assigned_to_name, NEW.created_by_name, ''),
    COALESCE(NEW.subtotal, 0), COALESCE(NEW.discount, 0), COALESCE(NEW.total, 0),
    COALESCE(NEW.amount_paid, 0), COALESCE(NEW.balance, 0),
    COALESCE(NEW.payment_method, 'cash'), COALESCE(NEW.payment_status, 'unpaid'),
    NEW.notes, 'delivered', 'order', NEW.due_date, NEW.id
  ) RETURNING id INTO new_sale_id;

  INSERT INTO public.sale_items (
    user_id, business_id, sale_id, product_id, product_name, sku,
    quantity, unit_price, cost_price, line_total
  )
  SELECT NEW.business_id, NEW.business_id, new_sale_id, oi.product_id, oi.product_name,
         COALESCE(oi.sku, ''), oi.quantity, oi.unit_price, oi.cost_price, oi.line_total
    FROM public.order_items oi
   WHERE oi.order_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_sync_sale ON public.orders;
CREATE TRIGGER orders_sync_sale
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_orders_sync_sale();

-- 4. Rollback: when an order is deleted, remove the linked sale + items.
CREATE OR REPLACE FUNCTION public.tg_orders_rollback_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.sale_items WHERE sale_id IN (SELECT id FROM public.sales WHERE order_id = OLD.id);
  DELETE FROM public.sales WHERE order_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS orders_rollback_sale ON public.orders;
CREATE TRIGGER orders_rollback_sale
BEFORE DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_orders_rollback_sale();
