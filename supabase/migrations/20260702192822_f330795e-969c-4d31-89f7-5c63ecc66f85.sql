
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.tg_orders_set_confirmation_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.confirmation_token IS NULL OR NEW.confirmation_token = '' THEN
    NEW.confirmation_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    NEW.confirmation_token := substr(NEW.confirmation_token, 1, 36);
  END IF;
  RETURN NEW;
END;
$function$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_payment_name text,
  ADD COLUMN IF NOT EXISTS customer_payment_reference text;
