-- Inventory module audit: add missing product columns and tighten restocks.user_id

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_url text;

CREATE INDEX IF NOT EXISTS products_user_archived_idx
  ON public.products (user_id, is_archived);

-- restocks.user_id is currently nullable; no null rows exist. Enforce NOT NULL
-- so future inserts can never bypass RLS by leaving user_id blank.
ALTER TABLE public.restocks
  ALTER COLUMN user_id SET NOT NULL;