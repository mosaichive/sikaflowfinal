ALTER TABLE public.marketing_reviews
  ADD COLUMN IF NOT EXISTS media_fit text NOT NULL DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS media_position_x numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS media_position_y numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS media_zoom numeric NOT NULL DEFAULT 1;