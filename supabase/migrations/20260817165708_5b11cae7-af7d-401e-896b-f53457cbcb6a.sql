-- Global currency system: supported currencies + exchange rate cache
CREATE TABLE IF NOT EXISTS public.currencies (
  code text PRIMARY KEY,
  name text NOT NULL,
  symbol text NOT NULL,
  flag text,
  country text,
  decimals integer NOT NULL DEFAULT 2,
  active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.currencies TO anon;
GRANT SELECT ON public.currencies TO authenticated;
GRANT ALL ON public.currencies TO service_role;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Currencies readable by everyone" ON public.currencies;
CREATE POLICY "Currencies readable by everyone" ON public.currencies FOR SELECT USING (true);

DROP POLICY IF EXISTS "Super admins manage currencies" ON public.currencies;
CREATE POLICY "Super admins manage currencies" ON public.currencies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

GRANT INSERT, UPDATE, DELETE ON public.currencies TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS currencies_single_default_idx ON public.currencies (is_default) WHERE is_default;

DROP TRIGGER IF EXISTS currencies_set_updated_at ON public.currencies;
CREATE TRIGGER currencies_set_updated_at BEFORE UPDATE ON public.currencies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency text NOT NULL,
  target_currency text NOT NULL,
  rate numeric NOT NULL,
  provider text NOT NULL DEFAULT 'open.er-api.com',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS exchange_rates_pair_idx ON public.exchange_rates (base_currency, target_currency);
CREATE INDEX IF NOT EXISTS exchange_rates_fetched_at_idx ON public.exchange_rates (fetched_at DESC);

GRANT SELECT ON public.exchange_rates TO anon;
GRANT SELECT ON public.exchange_rates TO authenticated;
GRANT ALL ON public.exchange_rates TO service_role;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Exchange rates readable by everyone" ON public.exchange_rates;
CREATE POLICY "Exchange rates readable by everyone" ON public.exchange_rates FOR SELECT USING (true);

DROP TRIGGER IF EXISTS exchange_rates_set_updated_at ON public.exchange_rates;
CREATE TRIGGER exchange_rates_set_updated_at BEFORE UPDATE ON public.exchange_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
