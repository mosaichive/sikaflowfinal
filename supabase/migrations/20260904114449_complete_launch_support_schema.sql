-- Additive launch-readiness schema for features already present in the app.
-- Existing tenant records are preserved; this migration only adds nullable or
-- defaulted columns, new tables, policies, and narrowly-scoped RPCs.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GHS',
  ADD COLUMN IF NOT EXISTS allow_sales_without_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_emails_opted_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monthly_statement_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS store_slug text,
  ADD COLUMN IF NOT EXISTS online_ordering_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS store_show_stock boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS store_enable_notes boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS store_enable_delivery_address boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS store_enable_product_images boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS store_allow_pickup boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS store_allow_delivery boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS store_default_delivery_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS store_payment_methods text[] NOT NULL DEFAULT ARRAY['cash_on_delivery']::text[],
  ADD COLUMN IF NOT EXISTS store_payment_instructions text,
  ADD COLUMN IF NOT EXISTS orders_auto_publish_products boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_notify_sale_thanks boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_notify_low_stock boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_notify_team_invite boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_notify_new_order boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_notify_order_status boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_store_slug_key
  ON public.profiles (store_slug)
  WHERE store_slug IS NOT NULL;
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS available_online boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_description text;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_code text,
  ADD COLUMN IF NOT EXISTS carrier_name text,
  ADD COLUMN IF NOT EXISTS carrier_phone text,
  ADD COLUMN IF NOT EXISTS tracking_notes text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS estimated_delivery_date date,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fulfillment_type text NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS customer_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_token text,
  ADD COLUMN IF NOT EXISTS customer_payment_name text,
  ADD COLUMN IF NOT EXISTS customer_payment_reference text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_tracking_code_key
  ON public.orders (tracking_code)
  WHERE tracking_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_business_status_idx
  ON public.orders (business_id, status);
CREATE OR REPLACE FUNCTION public.slugify(_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(
      regexp_replace(
        regexp_replace(lower(COALESCE(_input, '')), '[^a-z0-9]+', '-', 'g'),
        '^-+|-+$', '', 'g'
      ),
      ''
    ),
    'store'
  );
$$;
CREATE OR REPLACE FUNCTION public.ensure_unique_store_slug(_base text, _owner uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base text := public.slugify(_base);
  candidate text := base;
  suffix integer := 2;
BEGIN
  WHILE EXISTS (
    SELECT 1 FROM public.profiles
    WHERE store_slug = candidate AND id <> _owner
  ) LOOP
    candidate := base || '-' || suffix::text;
    suffix := suffix + 1;
  END LOOP;
  RETURN candidate;
END;
$$;
CREATE OR REPLACE FUNCTION public.tg_profiles_set_store_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.store_slug IS NULL
     AND NEW.business_name IS NOT NULL
     AND btrim(NEW.business_name) <> ''
     AND NEW.online_ordering_enabled IS TRUE THEN
    NEW.store_slug := public.ensure_unique_store_slug(NEW.business_name, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_set_store_slug ON public.profiles;
CREATE TRIGGER profiles_set_store_slug
  BEFORE INSERT OR UPDATE OF business_name, store_slug, online_ordering_enabled
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_set_store_slug();
CREATE OR REPLACE FUNCTION public.gen_tracking_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate text;
BEGIN
  LOOP
    candidate := 'KT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE tracking_code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;
CREATE OR REPLACE FUNCTION public.tg_orders_set_public_tokens()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tracking_code IS NULL OR btrim(NEW.tracking_code) = '' THEN
    NEW.tracking_code := public.gen_tracking_code();
  END IF;
  IF NEW.confirmation_token IS NULL OR btrim(NEW.confirmation_token) = '' THEN
    NEW.confirmation_token := encode(gen_random_bytes(18), 'hex');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_set_public_tokens ON public.orders;
CREATE TRIGGER orders_set_public_tokens
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_orders_set_public_tokens();
CREATE TABLE IF NOT EXISTS public.currencies (
  code text PRIMARY KEY,
  name text NOT NULL,
  symbol text NOT NULL,
  flag text,
  country text,
  decimals integer NOT NULL DEFAULT 2 CHECK (decimals BETWEEN 0 AND 4),
  active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.currencies TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.currencies TO authenticated;
GRANT ALL ON public.currencies TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS currencies_single_default_idx
  ON public.currencies (is_default) WHERE is_default;
DROP POLICY IF EXISTS "Currencies are publicly readable" ON public.currencies;
CREATE POLICY "Currencies are publicly readable" ON public.currencies
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "AAL2 super admins manage currencies" ON public.currencies;
CREATE POLICY "AAL2 super admins manage currencies" ON public.currencies
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
INSERT INTO public.currencies (
  code, name, symbol, flag, country, decimals, active, is_default, sort_order
) VALUES
  ('GHS', 'Ghanaian Cedi', '₵', '🇬🇭', 'Ghana', 2, true, false, 1),
  ('NGN', 'Nigerian Naira', '₦', '🇳🇬', 'Nigeria', 2, true, false, 2),
  ('USD', 'US Dollar', '$', '🇺🇸', 'United States', 2, true, false, 3),
  ('GBP', 'British Pound', '£', '🇬🇧', 'United Kingdom', 2, true, false, 4),
  ('EUR', 'Euro', '€', '🇪🇺', 'European Union', 2, true, false, 5),
  ('ZAR', 'South African Rand', 'R', '🇿🇦', 'South Africa', 2, true, false, 6),
  ('KES', 'Kenyan Shilling', 'KSh', '🇰🇪', 'Kenya', 2, true, false, 7),
  ('CAD', 'Canadian Dollar', 'CA$', '🇨🇦', 'Canada', 2, true, false, 8),
  ('AUD', 'Australian Dollar', 'A$', '🇦🇺', 'Australia', 2, true, false, 9),
  ('JPY', 'Japanese Yen', '¥', '🇯🇵', 'Japan', 0, true, false, 10)
ON CONFLICT (code) DO NOTHING;
UPDATE public.currencies
SET is_default = true
WHERE code = 'GHS'
  AND NOT EXISTS (SELECT 1 FROM public.currencies WHERE is_default);
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency text NOT NULL,
  target_currency text NOT NULL,
  rate numeric NOT NULL CHECK (rate > 0),
  provider text NOT NULL DEFAULT 'open.er-api.com',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (base_currency, target_currency)
);
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.exchange_rates TO anon, authenticated;
GRANT ALL ON public.exchange_rates TO service_role;
DROP POLICY IF EXISTS "Exchange rates are publicly readable" ON public.exchange_rates;
CREATE POLICY "Exchange rates are publicly readable" ON public.exchange_rates
  FOR SELECT USING (true);
CREATE TABLE IF NOT EXISTS public.dashboard_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  layout jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS dashboard_preferences_user_business_idx
  ON public.dashboard_preferences (
    user_id,
    COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
ALTER TABLE public.dashboard_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_preferences TO authenticated;
GRANT ALL ON public.dashboard_preferences TO service_role;
DROP POLICY IF EXISTS "Users manage own dashboard preferences" ON public.dashboard_preferences;
CREATE POLICY "Users manage own dashboard preferences" ON public.dashboard_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (business_id IS NULL OR public.user_can_access_business(business_id))
  );
CREATE TABLE IF NOT EXISTS public.surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  thank_you_message text,
  enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS surveys_one_enabled
  ON public.surveys ((enabled)) WHERE enabled;
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.surveys TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.surveys TO authenticated;
GRANT ALL ON public.surveys TO service_role;
DROP POLICY IF EXISTS "Users view enabled surveys" ON public.surveys;
CREATE POLICY "Users view enabled surveys" ON public.surveys
  FOR SELECT TO authenticated
  USING (enabled OR public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "AAL2 super admins manage surveys" ON public.surveys;
CREATE POLICY "AAL2 super admins manage surveys" ON public.surveys
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE OR REPLACE FUNCTION public.tg_surveys_set_enabled_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.enabled THEN
      NEW.enabled_at := now();
    END IF;
  ELSIF NEW.enabled AND NOT COALESCE(OLD.enabled, false) THEN
    NEW.enabled_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS surveys_set_enabled_at ON public.surveys;
CREATE TRIGGER surveys_set_enabled_at
  BEFORE INSERT OR UPDATE OF enabled ON public.surveys
  FOR EACH ROW EXECUTE FUNCTION public.tg_surveys_set_enabled_at();
CREATE TABLE IF NOT EXISTS public.survey_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('rating','multiple_choice','checkbox','short_text','long_text')),
  label text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS survey_questions_survey_idx
  ON public.survey_questions (survey_id, position);
ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_questions TO authenticated;
GRANT ALL ON public.survey_questions TO service_role;
DROP POLICY IF EXISTS "Users view questions for enabled surveys" ON public.survey_questions;
CREATE POLICY "Users view questions for enabled surveys" ON public.survey_questions
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_id AND s.enabled
    )
  );
DROP POLICY IF EXISTS "AAL2 super admins manage survey questions" ON public.survey_questions;
CREATE POLICY "AAL2 super admins manage survey questions" ON public.survey_questions
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE TABLE IF NOT EXISTS public.survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  name text,
  email text,
  phone text,
  rating integer CHECK (rating BETWEEN 1 AND 5),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (survey_id, user_id)
);
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.survey_responses TO authenticated;
GRANT ALL ON public.survey_responses TO service_role;
DROP POLICY IF EXISTS "Users submit own survey response" ON public.survey_responses;
CREATE POLICY "Users submit own survey response" ON public.survey_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (business_id IS NULL OR public.user_can_access_business(business_id))
  );
DROP POLICY IF EXISTS "Users view own survey responses" ON public.survey_responses;
CREATE POLICY "Users view own survey responses" ON public.survey_responses
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE TABLE IF NOT EXISTS public.survey_response_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.survey_responses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.survey_questions(id) ON DELETE CASCADE,
  answer jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.survey_response_answers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.survey_response_answers TO authenticated;
GRANT ALL ON public.survey_response_answers TO service_role;
DROP POLICY IF EXISTS "Users add own survey answers" ON public.survey_response_answers;
CREATE POLICY "Users add own survey answers" ON public.survey_response_answers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.survey_responses r
      WHERE r.id = response_id AND r.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Users view own survey answers" ON public.survey_response_answers;
CREATE POLICY "Users view own survey answers" ON public.survey_response_answers
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.survey_responses r
      WHERE r.id = response_id AND r.user_id = auth.uid()
    )
  );
CREATE TABLE IF NOT EXISTS public.survey_user_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('shown','skipped','completed')),
  shown_at timestamptz,
  skipped_at timestamptz,
  submitted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (survey_id, user_id)
);
ALTER TABLE public.survey_user_status ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.survey_user_status TO authenticated;
GRANT ALL ON public.survey_user_status TO service_role;
DROP POLICY IF EXISTS "Users manage own survey status" ON public.survey_user_status;
CREATE POLICY "Users manage own survey status" ON public.survey_user_status
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  preview_text text,
  from_name text NOT NULL DEFAULT 'KudiTrack Team',
  from_email text NOT NULL DEFAULT 'news@mail.kuditrack.online',
  reply_to text,
  body_html text NOT NULL DEFAULT '',
  template_id uuid,
  audience_type text NOT NULL DEFAULT 'all_users',
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  recipient_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  timezone text DEFAULT 'UTC',
  sent_at timestamptz,
  started_at timestamptz,
  delivered_count integer NOT NULL DEFAULT 0,
  open_count integer NOT NULL DEFAULT 0,
  unique_open_count integer NOT NULL DEFAULT 0,
  click_count integer NOT NULL DEFAULT 0,
  unique_click_count integer NOT NULL DEFAULT 0,
  bounce_count integer NOT NULL DEFAULT 0,
  unsubscribe_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  email text NOT NULL,
  user_id uuid,
  merge_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  resend_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0,
  first_clicked_at timestamptz,
  click_count integer NOT NULL DEFAULT 0,
  bounced_at timestamptz,
  unsubscribed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, email)
);
CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  subject text NOT NULL DEFAULT '',
  preview_text text,
  body_html text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.email_media_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  kind text NOT NULL DEFAULT 'image',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.email_marketing_unsubscribes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  user_id uuid,
  reason text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.email_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'email_campaigns',
    'email_campaign_recipients',
    'email_templates',
    'email_media_library',
    'email_marketing_unsubscribes',
    'email_audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', table_name);
  END LOOP;
END;
$$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaign_recipients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_media_library TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.email_marketing_unsubscribes TO authenticated;
GRANT SELECT, INSERT ON public.email_audit_log TO authenticated;
DROP POLICY IF EXISTS "AAL2 super admins manage email campaigns" ON public.email_campaigns;
CREATE POLICY "AAL2 super admins manage email campaigns" ON public.email_campaigns
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "AAL2 super admins manage email recipients" ON public.email_campaign_recipients;
CREATE POLICY "AAL2 super admins manage email recipients" ON public.email_campaign_recipients
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "AAL2 super admins manage email templates" ON public.email_templates;
CREATE POLICY "AAL2 super admins manage email templates" ON public.email_templates
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "AAL2 super admins manage email media" ON public.email_media_library;
CREATE POLICY "AAL2 super admins manage email media" ON public.email_media_library
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "AAL2 super admins view unsubscribes" ON public.email_marketing_unsubscribes;
CREATE POLICY "AAL2 super admins view unsubscribes" ON public.email_marketing_unsubscribes
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "Users unsubscribe own email" ON public.email_marketing_unsubscribes;
CREATE POLICY "Users unsubscribe own email" ON public.email_marketing_unsubscribes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );
DROP POLICY IF EXISTS "AAL2 super admins delete unsubscribes" ON public.email_marketing_unsubscribes;
CREATE POLICY "AAL2 super admins delete unsubscribes" ON public.email_marketing_unsubscribes
  FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "AAL2 super admins view email audit" ON public.email_audit_log;
CREATE POLICY "AAL2 super admins view email audit" ON public.email_audit_log
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "AAL2 super admins add email audit" ON public.email_audit_log;
CREATE POLICY "AAL2 super admins add email audit" ON public.email_audit_log
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));
CREATE TABLE IF NOT EXISTS public.statement_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_key text NOT NULL UNIQUE DEFAULT 'default',
  automation_enabled boolean NOT NULL DEFAULT false,
  send_day integer NOT NULL DEFAULT 1 CHECK (send_day BETWEEN 1 AND 28),
  from_name text NOT NULL DEFAULT 'KudiTrack',
  from_email text NOT NULL DEFAULT 'statements@mail.kuditrack.online',
  last_run_at timestamptz,
  last_run_period text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.statement_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
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
ALTER TABLE public.statement_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statement_deliveries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.statement_settings TO authenticated;
GRANT SELECT ON public.statement_deliveries TO authenticated;
GRANT ALL ON public.statement_settings, public.statement_deliveries TO service_role;
DROP POLICY IF EXISTS "AAL2 super admins manage statement settings" ON public.statement_settings;
CREATE POLICY "AAL2 super admins manage statement settings" ON public.statement_settings
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "Users view own statement deliveries" ON public.statement_deliveries;
CREATE POLICY "Users view own statement deliveries" ON public.statement_deliveries
  FOR SELECT TO authenticated
  USING (public.user_can_access_business(business_id) OR public.is_super_admin(auth.uid()));
INSERT INTO public.statement_settings (singleton_key)
VALUES ('default')
ON CONFLICT (singleton_key) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  recipient_phone text NOT NULL,
  notification_type text NOT NULL CHECK (
    notification_type IN (
      'sale_thanks', 'low_stock', 'team_invite', 'new_order',
      'order_confirmation', 'order_status', 'order_completed'
    )
  ),
  message_preview text,
  provider_response jsonb,
  status text NOT NULL CHECK (status IN ('sent','failed','queued')),
  error_message text,
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.sms_logs TO authenticated;
GRANT ALL ON public.sms_logs TO service_role;
DROP POLICY IF EXISTS "Business members view SMS logs" ON public.sms_logs;
CREATE POLICY "Business members view SMS logs" ON public.sms_logs
  FOR SELECT TO authenticated
  USING (public.user_can_access_business(business_id));
CREATE TABLE IF NOT EXISTS public.damaged_goods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  quantity integer NOT NULL CHECK (quantity > 0),
  quantity_after integer NOT NULL DEFAULT 0,
  reason text NOT NULL CHECK (
    reason IN ('Broken','Expired','Spoiled','Torn','Missing parts','Defective','Customer return damaged','Other')
  ),
  damage_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  unit_cost numeric(10,2) NOT NULL DEFAULT 0,
  total_value numeric(10,2) NOT NULL DEFAULT 0,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.damaged_goods ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.damaged_goods FROM authenticated;
GRANT SELECT ON public.damaged_goods TO authenticated;
GRANT ALL ON public.damaged_goods TO service_role;
CREATE INDEX IF NOT EXISTS damaged_goods_business_date_idx
  ON public.damaged_goods (business_id, damage_date DESC);
DROP POLICY IF EXISTS "Business members view damaged goods" ON public.damaged_goods;
CREATE POLICY "Business members view damaged goods" ON public.damaged_goods
  FOR SELECT TO authenticated USING (public.user_can_access_business(business_id));
CREATE OR REPLACE FUNCTION public.record_damaged_goods_v2(
  _business_id uuid,
  _damage_date timestamptz,
  _notes text,
  _product_id uuid,
  _quantity integer,
  _reason text,
  _recorded_by_name text
)
RETURNS TABLE(damaged_good_id uuid, quantity_after integer, total_value numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  product_row public.products%ROWTYPE;
  quantity_after_value integer;
  total_value_amount numeric;
  damage_id uuid;
BEGIN
  IF actor IS NULL OR NOT public.user_can_access_business(_business_id) THEN
    RAISE EXCEPTION 'You do not have access to this business';
  END IF;
  IF COALESCE(_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Damaged quantity must be greater than zero';
  END IF;

  SELECT * INTO product_row
  FROM public.products
  WHERE id = _product_id AND business_id = _business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  IF product_row.quantity < _quantity THEN
    RAISE EXCEPTION 'Insufficient stock';
  END IF;

  quantity_after_value := product_row.quantity - _quantity;
  total_value_amount := round((_quantity * product_row.cost_price)::numeric, 2);

  INSERT INTO public.damaged_goods (
    business_id, user_id, product_id, product_name, category, quantity,
    quantity_after, reason, damage_date, notes, unit_cost, total_value,
    recorded_by, recorded_by_name
  ) VALUES (
    _business_id, product_row.user_id, product_row.id, product_row.name,
    product_row.category, _quantity, quantity_after_value, _reason,
    COALESCE(_damage_date, now()), NULLIF(btrim(COALESCE(_notes, '')), ''),
    product_row.cost_price, total_value_amount, actor,
    COALESCE(NULLIF(btrim(_recorded_by_name), ''), '')
  ) RETURNING id INTO damage_id;

  UPDATE public.products
  SET quantity = quantity_after_value,
      stock = quantity_after_value,
      updated_at = now()
  WHERE id = product_row.id;

  INSERT INTO public.stock_movements (
    business_id, product_id, movement_type, quantity_change, quantity_after,
    unit_cost, unit_price, source_table, source_id, created_by,
    created_by_name, note, movement_date
  ) VALUES (
    _business_id, product_row.id, 'damaged_stock', -_quantity,
    quantity_after_value, product_row.cost_price, 0, 'damaged_goods',
    damage_id, actor, COALESCE(NULLIF(btrim(_recorded_by_name), ''), ''),
    'Damaged goods: ' || _reason || COALESCE(' - ' || NULLIF(btrim(_notes), ''), ''),
    COALESCE(_damage_date, now())
  );

  RETURN QUERY SELECT damage_id, quantity_after_value, total_value_amount;
END;
$$;
REVOKE ALL ON FUNCTION public.record_damaged_goods_v2(uuid,timestamptz,text,uuid,integer,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_damaged_goods_v2(uuid,timestamptz,text,uuid,integer,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.public_get_store(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_row public.profiles%ROWTYPE;
  business_uuid uuid;
  product_rows jsonb;
BEGIN
  SELECT * INTO profile_row
  FROM public.profiles
  WHERE store_slug = lower(btrim(_slug))
    AND online_ordering_enabled
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;
  business_uuid := COALESCE(profile_row.business_id, profile_row.id);

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'name'), '[]'::jsonb)
  INTO product_rows
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'online_description', p.online_description,
      'price', p.selling_price,
      'stock', CASE WHEN profile_row.store_show_stock THEN p.quantity ELSE NULL END,
      'available', p.quantity > 0,
      'image_url', CASE WHEN profile_row.store_enable_product_images THEN p.image_url ELSE NULL END,
      'category', p.category
    ) AS item
    FROM public.products p
    WHERE p.business_id = business_uuid
      AND NOT p.is_archived
      AND (profile_row.orders_auto_publish_products OR p.available_online)
  ) products;

  RETURN jsonb_build_object(
    'business', jsonb_build_object(
      'name', profile_row.business_name,
      'logo_url', profile_row.logo_url,
      'phone', profile_row.phone,
      'location', profile_row.location,
      'slug', profile_row.store_slug,
      'currency', profile_row.currency,
      'show_stock', profile_row.store_show_stock,
      'enable_notes', profile_row.store_enable_notes,
      'enable_delivery_address', profile_row.store_enable_delivery_address,
      'enable_product_images', profile_row.store_enable_product_images,
      'payment_methods', profile_row.store_payment_methods,
      'payment_instructions', profile_row.store_payment_instructions,
      'default_delivery_fee', profile_row.store_default_delivery_fee,
      'allow_pickup', profile_row.store_allow_pickup,
      'allow_delivery', profile_row.store_allow_delivery
    ),
    'products', product_rows
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.public_get_order_by_tracking(_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.orders%ROWTYPE;
  profile_row public.profiles%ROWTYPE;
  item_rows jsonb;
BEGIN
  SELECT * INTO order_row
  FROM public.orders
  WHERE tracking_code = upper(btrim(_code))
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO profile_row
  FROM public.profiles
  WHERE business_id = order_row.business_id OR id = order_row.business_id
  ORDER BY CASE WHEN business_id = order_row.business_id THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', product_name,
    'quantity', quantity,
    'unit_price', unit_price,
    'line_total', line_total
  )), '[]'::jsonb)
  INTO item_rows
  FROM public.order_items
  WHERE order_id = order_row.id;

  RETURN jsonb_build_object(
    'tracking_code', order_row.tracking_code,
    'status', order_row.status,
    'payment_status', order_row.payment_status,
    'customer_name', order_row.customer_name,
    'total', order_row.total,
    'subtotal', order_row.subtotal,
    'discount', order_row.discount,
    'delivery_fee', order_row.delivery_fee,
    'fulfillment_type', order_row.fulfillment_type,
    'order_date', order_row.order_date,
    'delivered_at', order_row.delivered_at,
    'estimated_delivery_date', order_row.estimated_delivery_date,
    'customer_confirmed_at', order_row.customer_confirmed_at,
    'carrier_name', CASE WHEN order_row.status = 'out_for_delivery' THEN order_row.carrier_name ELSE NULL END,
    'carrier_phone', CASE WHEN order_row.status = 'out_for_delivery' THEN order_row.carrier_phone ELSE NULL END,
    'tracking_notes', CASE WHEN order_row.status = 'out_for_delivery' THEN order_row.tracking_notes ELSE NULL END,
    'delivery_location', order_row.delivery_location,
    'notes', order_row.notes,
    'items', item_rows,
    'business', jsonb_build_object(
      'name', profile_row.business_name,
      'logo_url', profile_row.logo_url,
      'phone', profile_row.phone,
      'slug', profile_row.store_slug
    )
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.public_confirm_order_receipt_by_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.orders%ROWTYPE;
BEGIN
  SELECT * INTO order_row
  FROM public.orders
  WHERE tracking_code = upper(btrim(_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF order_row.customer_confirmed_at IS NOT NULL OR order_row.status = 'completed' THEN
    RETURN jsonb_build_object(
      'ok', true, 'already', true, 'business_id', order_row.business_id,
      'order_id', order_row.id, 'customer_name', order_row.customer_name,
      'tracking_code', order_row.tracking_code
    );
  END IF;
  IF order_row.status NOT IN ('delivered', 'out_for_delivery', 'ready_for_pickup') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_yet_delivered', 'status', order_row.status);
  END IF;

  UPDATE public.orders
  SET status = 'completed',
      customer_confirmed_at = now(),
      delivered_at = COALESCE(delivered_at, now()),
      updated_at = now()
  WHERE id = order_row.id;

  RETURN jsonb_build_object(
    'ok', true, 'business_id', order_row.business_id,
    'order_id', order_row.id, 'customer_name', order_row.customer_name,
    'tracking_code', order_row.tracking_code
  );
END;
$$;
REVOKE ALL ON FUNCTION public.public_confirm_order_receipt_by_code(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_confirm_order_receipt_by_code(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.public_get_store(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_order_by_tracking(text) TO anon, authenticated;
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'currencies', 'exchange_rates', 'dashboard_preferences', 'surveys',
    'survey_questions', 'survey_user_status', 'email_campaigns',
    'email_campaign_recipients', 'email_templates', 'email_media_library',
    'statement_settings', 'statement_deliveries', 'damaged_goods'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = table_name || '_set_updated_at' AND NOT tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
        table_name || '_set_updated_at', table_name
      );
    END IF;
  END LOOP;
END;
$$;
NOTIFY pgrst, 'reload schema';
