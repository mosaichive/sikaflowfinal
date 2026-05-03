ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['bank_accounts','profiles','expenses','other_income','products','stock_movements','restocks','sales','sale_items','investments','investor_funding','savings']) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;