-- 1. Missing Data API grants for the email system tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaigns TO authenticated;
GRANT ALL ON public.email_campaigns TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaign_recipients TO authenticated;
GRANT ALL ON public.email_campaign_recipients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_media_library TO authenticated;
GRANT ALL ON public.email_media_library TO service_role;
GRANT SELECT, INSERT, DELETE ON public.email_marketing_unsubscribes TO authenticated;
GRANT INSERT ON public.email_marketing_unsubscribes TO anon;
GRANT ALL ON public.email_marketing_unsubscribes TO service_role;
GRANT SELECT, INSERT ON public.email_audit_log TO authenticated;
GRANT ALL ON public.email_audit_log TO service_role;

-- 2. Monthly statement automation settings (singleton)
CREATE TABLE IF NOT EXISTS public.statement_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_key text NOT NULL UNIQUE DEFAULT 'default',
  automation_enabled boolean NOT NULL DEFAULT false,
  send_day integer NOT NULL DEFAULT 1,
  from_name text NOT NULL DEFAULT 'KudiTrack',
  from_email text NOT NULL DEFAULT 'statements@kuditrack.online',
  last_run_at timestamptz,
  last_run_period text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.statement_settings TO authenticated;
GRANT ALL ON public.statement_settings TO service_role;
ALTER TABLE public.statement_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins manage statement settings"
  ON public.statement_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

INSERT INTO public.statement_settings (singleton_key) VALUES ('default')
ON CONFLICT (singleton_key) DO NOTHING;

-- 3. Statement delivery log
CREATE TABLE IF NOT EXISTS public.statement_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  business_name text,
  email text NOT NULL,
  period text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  generated_at timestamptz,
  sent_at timestamptz,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  provider_message_id text,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, period)
);

CREATE INDEX IF NOT EXISTS statement_deliveries_period_idx ON public.statement_deliveries (period, status);

GRANT SELECT ON public.statement_deliveries TO authenticated;
GRANT ALL ON public.statement_deliveries TO service_role;
ALTER TABLE public.statement_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins view statement deliveries"
  ON public.statement_deliveries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER statement_settings_set_updated_at
  BEFORE UPDATE ON public.statement_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER statement_deliveries_set_updated_at
  BEFORE UPDATE ON public.statement_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();