ALTER TABLE public.marketing_reviews
  ADD COLUMN IF NOT EXISTS media_fit TEXT NOT NULL DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS media_position_x INT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS media_position_y INT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS media_zoom NUMERIC NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_reviews_media_fit_check'
  ) THEN
    ALTER TABLE public.marketing_reviews
      ADD CONSTRAINT marketing_reviews_media_fit_check CHECK (media_fit IN ('cover', 'contain'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_reviews_media_position_x_check'
  ) THEN
    ALTER TABLE public.marketing_reviews
      ADD CONSTRAINT marketing_reviews_media_position_x_check CHECK (media_position_x BETWEEN 0 AND 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_reviews_media_position_y_check'
  ) THEN
    ALTER TABLE public.marketing_reviews
      ADD CONSTRAINT marketing_reviews_media_position_y_check CHECK (media_position_y BETWEEN 0 AND 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_reviews_media_zoom_check'
  ) THEN
    ALTER TABLE public.marketing_reviews
      ADD CONSTRAINT marketing_reviews_media_zoom_check CHECK (media_zoom >= 1 AND media_zoom <= 3);
  END IF;
END $$;
