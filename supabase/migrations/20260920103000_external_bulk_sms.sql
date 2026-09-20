-- External-contact bulk SMS. This is intentionally separate from profiles and
-- the tenant-scoped sms_logs table used for registered KudiTrack users.

CREATE TABLE IF NOT EXISTS public.external_contact_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.external_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.external_contact_lists(id) ON DELETE CASCADE,
  business_name text,
  contact_name text,
  phone_number text NOT NULL,
  normalized_phone_number text NOT NULL CHECK (normalized_phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  country_code text,
  city text,
  region text,
  category text,
  source text NOT NULL DEFAULT 'manual',
  notes text,
  sms_opt_out boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, normalized_phone_number)
);

CREATE TABLE IF NOT EXISTS public.sms_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_phone_number text NOT NULL UNIQUE CHECK (normalized_phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  reason text NOT NULL DEFAULT 'opt_out' CHECK (reason IN ('opt_out', 'blocked', 'complaint', 'invalid')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1600),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bulk_sms_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1600),
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'scheduled', 'queued', 'sending', 'completed', 'partially_completed', 'failed', 'cancelled')
  ),
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'upload', 'contact_list', 'duplicate')),
  source_list_id uuid REFERENCES public.external_contact_lists(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'africastalking',
  sender_id text,
  encoding text NOT NULL DEFAULT 'gsm7' CHECK (encoding IN ('gsm7', 'ucs2')),
  message_characters integer NOT NULL DEFAULT 0 CHECK (message_characters >= 0),
  segments_per_recipient integer NOT NULL DEFAULT 1 CHECK (segments_per_recipient BETWEEN 1 AND 20),
  estimated_total_segments integer NOT NULL DEFAULT 0 CHECK (estimated_total_segments >= 0),
  estimated_cost numeric,
  estimated_cost_currency text,
  total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  total_recipients integer NOT NULL DEFAULT 0 CHECK (total_recipients >= 0),
  total_valid integer NOT NULL DEFAULT 0 CHECK (total_valid >= 0),
  total_invalid integer NOT NULL DEFAULT 0 CHECK (total_invalid >= 0),
  total_duplicates integer NOT NULL DEFAULT 0 CHECK (total_duplicates >= 0),
  total_excluded integer NOT NULL DEFAULT 0 CHECK (total_excluded >= 0),
  total_sent integer NOT NULL DEFAULT 0 CHECK (total_sent >= 0),
  total_delivered integer NOT NULL DEFAULT 0 CHECK (total_delivered >= 0),
  total_failed integer NOT NULL DEFAULT 0 CHECK (total_failed >= 0),
  total_pending integer NOT NULL DEFAULT 0 CHECK (total_pending >= 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by_email text,
  scheduled_at timestamptz,
  timezone text NOT NULL DEFAULT 'Africa/Accra',
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bulk_sms_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.bulk_sms_campaigns(id) ON DELETE CASCADE,
  external_contact_id uuid REFERENCES public.external_contacts(id) ON DELETE SET NULL,
  business_name text,
  contact_name text,
  phone_number text NOT NULL,
  normalized_phone_number text,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending', 'processing', 'sent', 'submitted', 'buffered', 'delivered',
      'failed', 'rejected', 'expired', 'invalid', 'duplicate', 'suppressed', 'cancelled'
    )
  ),
  excluded_reason text,
  provider_message_id text,
  provider_status text,
  provider_cost text,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  processing_token uuid,
  locked_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (normalized_phone_number IS NULL OR normalized_phone_number ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE INDEX IF NOT EXISTS external_contacts_list_idx
  ON public.external_contacts (list_id, created_at DESC);
CREATE INDEX IF NOT EXISTS external_contacts_phone_idx
  ON public.external_contacts (normalized_phone_number);
CREATE INDEX IF NOT EXISTS external_contacts_opt_out_idx
  ON public.external_contacts (normalized_phone_number) WHERE sms_opt_out;
CREATE INDEX IF NOT EXISTS bulk_sms_campaigns_status_idx
  ON public.bulk_sms_campaigns (status, created_at DESC);
CREATE INDEX IF NOT EXISTS bulk_sms_campaigns_created_idx
  ON public.bulk_sms_campaigns (created_at DESC);
CREATE INDEX IF NOT EXISTS bulk_sms_recipients_campaign_status_idx
  ON public.bulk_sms_recipients (campaign_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS bulk_sms_recipients_provider_id_unique_idx
  ON public.bulk_sms_recipients (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bulk_sms_one_sendable_recipient_idx
  ON public.bulk_sms_recipients (campaign_id, normalized_phone_number)
  WHERE normalized_phone_number IS NOT NULL
    AND status NOT IN ('invalid', 'duplicate', 'suppressed', 'cancelled');

DROP TRIGGER IF EXISTS external_contact_lists_set_updated_at ON public.external_contact_lists;
CREATE TRIGGER external_contact_lists_set_updated_at
  BEFORE UPDATE ON public.external_contact_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS external_contacts_set_updated_at ON public.external_contacts;
CREATE TRIGGER external_contacts_set_updated_at
  BEFORE UPDATE ON public.external_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS sms_templates_set_updated_at ON public.sms_templates;
CREATE TRIGGER sms_templates_set_updated_at
  BEFORE UPDATE ON public.sms_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS bulk_sms_campaigns_set_updated_at ON public.bulk_sms_campaigns;
CREATE TRIGGER bulk_sms_campaigns_set_updated_at
  BEFORE UPDATE ON public.bulk_sms_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS bulk_sms_recipients_set_updated_at ON public.bulk_sms_recipients;
CREATE TRIGGER bulk_sms_recipients_set_updated_at
  BEFORE UPDATE ON public.bulk_sms_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.external_contact_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_sms_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_sms_recipients ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.external_contact_lists FROM anon, authenticated;
REVOKE ALL ON public.external_contacts FROM anon, authenticated;
REVOKE ALL ON public.sms_suppressions FROM anon, authenticated;
REVOKE ALL ON public.sms_templates FROM anon, authenticated;
REVOKE ALL ON public.bulk_sms_campaigns FROM anon, authenticated;
REVOKE ALL ON public.bulk_sms_recipients FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_contact_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_contacts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.sms_suppressions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_templates TO authenticated;
GRANT SELECT ON public.bulk_sms_campaigns TO authenticated;
GRANT SELECT ON public.bulk_sms_recipients TO authenticated;
GRANT ALL ON public.external_contact_lists, public.external_contacts, public.sms_suppressions,
  public.sms_templates, public.bulk_sms_campaigns, public.bulk_sms_recipients TO service_role;

CREATE POLICY "AAL2 super admins manage external contact lists"
  ON public.external_contact_lists FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "AAL2 super admins manage external contacts"
  ON public.external_contacts FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "AAL2 super admins manage SMS suppressions"
  ON public.sms_suppressions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()) AND (created_by IS NULL OR created_by = auth.uid()));
CREATE POLICY "AAL2 super admins manage SMS templates"
  ON public.sms_templates FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "AAL2 super admins view bulk SMS campaigns"
  ON public.bulk_sms_campaigns FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
CREATE POLICY "AAL2 super admins view bulk SMS recipients"
  ON public.bulk_sms_recipients FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.claim_bulk_sms_recipients(
  _campaign_id uuid,
  _batch_size integer,
  _processing_token uuid
)
RETURNS SETOF public.bulk_sms_recipients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  -- A provider request may have left the runtime before its response was
  -- persisted. Do not automatically resend those rows: surface the uncertain
  -- state for an explicit failed-recipient retry instead.
  UPDATE public.bulk_sms_recipients
  SET status = 'failed',
      error_message = 'Delivery state is unknown after an interrupted worker. Review before retrying.',
      processing_token = NULL,
      locked_at = NULL
  WHERE campaign_id = _campaign_id
    AND status = 'processing'
    AND locked_at < now() - interval '10 minutes';

  RETURN QUERY
  WITH candidates AS (
    SELECT r.id
    FROM public.bulk_sms_recipients AS r
    JOIN public.bulk_sms_campaigns AS c ON c.id = r.campaign_id
    WHERE r.campaign_id = _campaign_id
      AND r.status = 'pending'
      AND c.status IN ('queued', 'sending')
    ORDER BY r.created_at, r.id
    FOR UPDATE OF r SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(_batch_size, 1), 1), 50)
  )
  UPDATE public.bulk_sms_recipients AS r
  SET status = 'processing',
      processing_token = _processing_token,
      locked_at = now(),
      attempt_count = r.attempt_count + 1
  FROM candidates
  WHERE r.id = candidates.id
  RETURNING r.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_bulk_sms_campaign(_campaign_id uuid)
RETURNS public.bulk_sms_campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result public.bulk_sms_campaigns;
  pending_count integer;
  sent_count integer;
  delivered_count integer;
  failed_count integer;
  next_status text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT
    count(*) FILTER (WHERE status IN ('pending', 'processing')),
    count(*) FILTER (WHERE status IN ('sent', 'submitted', 'buffered', 'delivered')),
    count(*) FILTER (WHERE status = 'delivered'),
    count(*) FILTER (WHERE status IN ('failed', 'rejected', 'expired'))
  INTO pending_count, sent_count, delivered_count, failed_count
  FROM public.bulk_sms_recipients
  WHERE campaign_id = _campaign_id;

  SELECT status INTO next_status FROM public.bulk_sms_campaigns WHERE id = _campaign_id FOR UPDATE;
  IF next_status IS NULL THEN
    RAISE EXCEPTION 'campaign_not_found';
  ELSIF next_status = 'cancelled' THEN
    NULL;
  ELSIF pending_count > 0 THEN
    next_status := 'sending';
  ELSIF sent_count > 0 AND failed_count > 0 THEN
    next_status := 'partially_completed';
  ELSIF sent_count > 0 THEN
    next_status := 'completed';
  ELSIF failed_count > 0 THEN
    next_status := 'failed';
  ELSE
    next_status := 'failed';
  END IF;

  UPDATE public.bulk_sms_campaigns
  SET total_pending = pending_count,
      total_sent = sent_count,
      total_delivered = delivered_count,
      total_failed = failed_count,
      status = next_status,
      completed_at = CASE
        WHEN pending_count = 0 AND next_status IN ('completed', 'partially_completed', 'failed')
          THEN COALESCE(completed_at, now())
        ELSE completed_at
      END
  WHERE id = _campaign_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_bulk_sms_recipients(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_bulk_sms_campaign(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_bulk_sms_recipients(uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_bulk_sms_campaign(uuid) TO service_role;

INSERT INTO public.sms_templates (name, message, created_by)
SELECT
  'KudiTrack Introduction',
  'Manage your business smarter with KudiTrack. Track sales, stock, expenses, customers, orders & profits in one place. Try KudiTrack today: kuditrack.online - KudiTrack Team',
  ur.user_id
FROM public.user_roles AS ur
WHERE ur.role = 'super_admin'::public.app_role
  AND ur.business_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.sms_templates WHERE name = 'KudiTrack Introduction'
  )
ORDER BY ur.created_at
LIMIT 1
ON CONFLICT DO NOTHING;
