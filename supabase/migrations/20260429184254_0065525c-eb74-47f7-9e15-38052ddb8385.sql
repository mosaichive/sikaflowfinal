CREATE TYPE public.savings_type AS ENUM ('bank', 'mobile_money', 'susu');

CREATE TABLE public.savings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  savings_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  type public.savings_type NOT NULL DEFAULT 'bank',
  institution TEXT,
  account_name TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.savings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "savings select own" ON public.savings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "savings insert own" ON public.savings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "savings update own" ON public.savings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "savings delete own" ON public.savings FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER set_savings_updated_at
  BEFORE UPDATE ON public.savings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_savings_user_date ON public.savings(user_id, savings_date DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.savings;
ALTER TABLE public.savings REPLICA IDENTITY FULL;