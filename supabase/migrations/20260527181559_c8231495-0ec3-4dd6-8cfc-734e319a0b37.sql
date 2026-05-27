ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_verified_phone text;

-- Backfill last_verified_phone for any already-verified accounts.
UPDATE public.profiles
   SET last_verified_phone = phone
 WHERE phone_verified = true
   AND last_verified_phone IS NULL
   AND phone IS NOT NULL;