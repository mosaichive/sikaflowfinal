-- Launch hardening for team invitations, OTP verification, and edge abuse controls.
-- This migration is additive and does not rewrite or delete existing tenant data.

ALTER TABLE public.staff_invites
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_verified_phone text;

CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  action text NOT NULL,
  key_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (action, key_hash, window_start)
);

ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.edge_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.edge_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_edge_rate_limit(
  p_action text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_action IS NULL OR length(p_action) NOT BETWEEN 1 AND 80
     OR p_key_hash IS NULL OR length(p_key_hash) <> 64
     OR p_limit NOT BETWEEN 1 AND 10000
     OR p_window_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'invalid rate limit input' USING ERRCODE = '22023';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.edge_rate_limits (action, key_hash, window_start, request_count, updated_at)
  VALUES (p_action, p_key_hash, v_window_start, 1, now())
  ON CONFLICT (action, key_hash, window_start)
  DO UPDATE SET
    request_count = public.edge_rate_limits.request_count + 1,
    updated_at = now()
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_edge_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_edge_rate_limit(text, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.protect_staff_member_linkage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND (
       NEW.business_owner_id IS DISTINCT FROM OLD.business_owner_id
       OR NEW.business_id IS DISTINCT FROM OLD.business_id
       OR NEW.staff_user_id IS DISTINCT FROM OLD.staff_user_id
       OR NEW.email IS DISTINCT FROM OLD.email
     ) THEN
    RAISE EXCEPTION 'Team membership linkage can only be changed by a trusted server workflow.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_staff_member_linkage_trigger ON public.staff_members;
CREATE TRIGGER protect_staff_member_linkage_trigger
BEFORE UPDATE ON public.staff_members
FOR EACH ROW EXECUTE FUNCTION public.protect_staff_member_linkage();

DROP POLICY IF EXISTS "staff members owner manage" ON public.staff_members;
DROP POLICY IF EXISTS "staff members owner read" ON public.staff_members;
DROP POLICY IF EXISTS "staff members owner update" ON public.staff_members;

CREATE POLICY "staff members owner read"
ON public.staff_members
FOR SELECT
TO authenticated
USING (business_owner_id = auth.uid());

CREATE POLICY "staff members owner update"
ON public.staff_members
FOR UPDATE
TO authenticated
USING (business_owner_id = auth.uid())
WITH CHECK (
  business_owner_id = auth.uid()
  AND business_id IN (
    SELECT b.id FROM public.businesses b WHERE b.owner_user_id = auth.uid()
  )
);

REVOKE INSERT, DELETE ON public.staff_members FROM authenticated;
GRANT SELECT, UPDATE ON public.staff_members TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 4194304, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('email-media', 'email-media', false, 4194304, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

UPDATE storage.buckets
SET public = true,
    file_size_limit = 4194304,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'product-images';

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id IN ('business-logos', 'platform-ads');

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
WHERE id IN ('expense-receipts', 'other-income-receipts');

DROP POLICY IF EXISTS "Anyone can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete product images" ON storage.objects;
DROP POLICY IF EXISTS "Product images public read" ON storage.objects;
DROP POLICY IF EXISTS "Product images authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "Product images authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "Product images authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "product images business insert" ON storage.objects;
DROP POLICY IF EXISTS "product images business update" ON storage.objects;
DROP POLICY IF EXISTS "product images business delete" ON storage.objects;

CREATE POLICY "Product images public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "product images business insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND public.user_can_access_business(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "product images business update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND public.user_can_access_business(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND public.user_can_access_business(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "product images business delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND public.user_can_access_business(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
DROP POLICY IF EXISTS "avatars own insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars own update" ON storage.objects;
DROP POLICY IF EXISTS "avatars own delete" ON storage.objects;
CREATE POLICY "avatars public read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars own insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Super admins read email-media" ON storage.objects;
DROP POLICY IF EXISTS "Super admins upload email-media" ON storage.objects;
DROP POLICY IF EXISTS "Super admins update email-media" ON storage.objects;
DROP POLICY IF EXISTS "Super admins delete email-media" ON storage.objects;
CREATE POLICY "Super admins read email-media" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'email-media' AND public.is_super_admin(auth.uid()));
CREATE POLICY "Super admins upload email-media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'email-media' AND public.is_super_admin(auth.uid()));
CREATE POLICY "Super admins update email-media" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'email-media' AND public.is_super_admin(auth.uid()))
  WITH CHECK (bucket_id = 'email-media' AND public.is_super_admin(auth.uid()));
CREATE POLICY "Super admins delete email-media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'email-media' AND public.is_super_admin(auth.uid()));

NOTIFY pgrst, 'reload schema';
