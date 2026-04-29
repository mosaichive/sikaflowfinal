
-- Add logo_url to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS logo_url text;

-- Storage bucket for business logos (public-readable)
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-logos', 'business-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Logo storage policies (folder = user id)
DROP POLICY IF EXISTS "logos public read" ON storage.objects;
CREATE POLICY "logos public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'business-logos');

DROP POLICY IF EXISTS "logos owner upload" ON storage.objects;
CREATE POLICY "logos owner upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'business-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "logos owner update" ON storage.objects;
CREATE POLICY "logos owner update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'business-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "logos owner delete" ON storage.objects;
CREATE POLICY "logos owner delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'business-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Staff invites table
CREATE TABLE IF NOT EXISTS public.staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_owner_id uuid NOT NULL,
  email text NOT NULL,
  display_name text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  status text NOT NULL DEFAULT 'pending', -- pending | accepted | revoked
  accepted_user_id uuid,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_invites_owner_idx ON public.staff_invites(business_owner_id);
CREATE INDEX IF NOT EXISTS staff_invites_email_idx ON public.staff_invites(lower(email));

ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invites owner select" ON public.staff_invites;
CREATE POLICY "invites owner select" ON public.staff_invites
  FOR SELECT USING (auth.uid() = business_owner_id);

DROP POLICY IF EXISTS "invites owner insert" ON public.staff_invites;
CREATE POLICY "invites owner insert" ON public.staff_invites
  FOR INSERT WITH CHECK (auth.uid() = business_owner_id);

DROP POLICY IF EXISTS "invites owner update" ON public.staff_invites;
CREATE POLICY "invites owner update" ON public.staff_invites
  FOR UPDATE USING (auth.uid() = business_owner_id);

DROP POLICY IF EXISTS "invites owner delete" ON public.staff_invites;
CREATE POLICY "invites owner delete" ON public.staff_invites
  FOR DELETE USING (auth.uid() = business_owner_id);

-- Allow signed-in users to look up their own invite by token (for acceptance flow)
DROP POLICY IF EXISTS "invites invitee read by email" ON public.staff_invites;
CREATE POLICY "invites invitee read by email" ON public.staff_invites
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );

DROP POLICY IF EXISTS "invites invitee accept" ON public.staff_invites;
CREATE POLICY "invites invitee accept" ON public.staff_invites
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );

CREATE TRIGGER staff_invites_set_updated_at
  BEFORE UPDATE ON public.staff_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Staff memberships table (active staff linked to a business owner)
CREATE TABLE IF NOT EXISTS public.staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_owner_id uuid NOT NULL,
  staff_user_id uuid NOT NULL,
  display_name text,
  email text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_owner_id, staff_user_id)
);

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff owner manage" ON public.staff_members;
CREATE POLICY "staff owner manage" ON public.staff_members
  FOR ALL USING (auth.uid() = business_owner_id) WITH CHECK (auth.uid() = business_owner_id);

DROP POLICY IF EXISTS "staff self read" ON public.staff_members;
CREATE POLICY "staff self read" ON public.staff_members
  FOR SELECT USING (auth.uid() = staff_user_id);

CREATE TRIGGER staff_members_set_updated_at
  BEFORE UPDATE ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add staff role to enum if missing (already in spec but ensure exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'staff') THEN
    ALTER TYPE public.app_role ADD VALUE 'staff';
  END IF;
END $$;
