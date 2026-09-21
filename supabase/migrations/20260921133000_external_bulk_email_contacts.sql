-- External marketing email contacts are deliberately separate from profiles
-- and Supabase Auth users. This migration is additive and preserves all
-- existing SMS contacts, registered users, campaigns, and subscription data.

CREATE TABLE IF NOT EXISTS public.external_email_contact_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.external_email_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.external_email_contact_lists(id) ON DELETE CASCADE,
  business_name text,
  contact_name text,
  email_address text NOT NULL,
  normalized_email_address text NOT NULL CHECK (
    char_length(normalized_email_address) <= 254
    AND normalized_email_address ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
  ),
  city text,
  region text,
  category text,
  source text NOT NULL DEFAULT 'manual',
  notes text,
  email_opt_out boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, normalized_email_address)
);

CREATE INDEX IF NOT EXISTS external_email_contacts_list_idx
  ON public.external_email_contacts (list_id, created_at DESC);
CREATE INDEX IF NOT EXISTS external_email_contacts_address_idx
  ON public.external_email_contacts (normalized_email_address);
CREATE INDEX IF NOT EXISTS external_email_contacts_opt_out_idx
  ON public.external_email_contacts (normalized_email_address)
  WHERE email_opt_out;

DROP TRIGGER IF EXISTS external_email_contact_lists_set_updated_at
  ON public.external_email_contact_lists;
CREATE TRIGGER external_email_contact_lists_set_updated_at
  BEFORE UPDATE ON public.external_email_contact_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS external_email_contacts_set_updated_at
  ON public.external_email_contacts;
CREATE TRIGGER external_email_contacts_set_updated_at
  BEFORE UPDATE ON public.external_email_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.external_email_contact_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_email_contacts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.external_email_contact_lists FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.external_email_contacts FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_email_contact_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_email_contacts TO authenticated;
GRANT ALL ON public.external_email_contact_lists, public.external_email_contacts TO service_role;

DROP POLICY IF EXISTS "AAL2 super admins manage external email contact lists"
  ON public.external_email_contact_lists;
CREATE POLICY "AAL2 super admins manage external email contact lists"
  ON public.external_email_contact_lists FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    AND COALESCE(auth.jwt() ->> 'aal', '') = 'aal2'
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    AND COALESCE(auth.jwt() ->> 'aal', '') = 'aal2'
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "AAL2 super admins manage external email contacts"
  ON public.external_email_contacts;
CREATE POLICY "AAL2 super admins manage external email contacts"
  ON public.external_email_contacts FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    AND COALESCE(auth.jwt() ->> 'aal', '') = 'aal2'
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    AND COALESCE(auth.jwt() ->> 'aal', '') = 'aal2'
    AND created_by = auth.uid()
  );

