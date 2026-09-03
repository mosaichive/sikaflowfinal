ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS movement_date timestamptz NOT NULL DEFAULT now();

UPDATE public.stock_movements SET movement_date = created_at WHERE movement_date <> created_at;

CREATE INDEX IF NOT EXISTS stock_movements_user_movement_date_idx
  ON public.stock_movements (user_id, movement_date DESC);

ALTER TABLE public.profiles
  ALTER COLUMN trial_end_date SET DEFAULT (now() + INTERVAL '15 days');