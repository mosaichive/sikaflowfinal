CREATE OR REPLACE FUNCTION public.tg_order_items_lock_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  parent_status text;
  parent_id uuid := COALESCE(NEW.order_id, OLD.order_id);
BEGIN
  IF parent_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP <> 'UPDATE' THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT status INTO parent_status FROM public.orders WHERE id = parent_id;
  IF parent_status IN ('delivered','completed') THEN
    RAISE EXCEPTION 'Order is % and items cannot be modified.', parent_status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;