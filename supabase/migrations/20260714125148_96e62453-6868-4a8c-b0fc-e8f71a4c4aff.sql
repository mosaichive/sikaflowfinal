
-- =========================================================================
-- Bulk Email & Newsletter System
-- =========================================================================

-- Profiles: marketing opt-out flag (transactional emails always allowed)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_emails_opted_out boolean NOT NULL DEFAULT false;

-- ---------- email_campaigns ----------
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  preview_text text,
  from_name text NOT NULL DEFAULT 'KudiTrack Team',
  from_email text NOT NULL DEFAULT 'news@kuditrack.online',
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaigns TO authenticated;
GRANT ALL ON public.email_campaigns TO service_role;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage campaigns"
  ON public.email_campaigns FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS email_campaigns_status_idx ON public.email_campaigns(status);
CREATE INDEX IF NOT EXISTS email_campaigns_scheduled_idx ON public.email_campaigns(scheduled_at) WHERE status = 'scheduled';

CREATE TRIGGER trg_email_campaigns_updated
  BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- email_campaign_recipients ----------
CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  email text NOT NULL,
  user_id uuid,
  merge_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending', -- pending | sent | delivered | bounced | failed | unsubscribed | skipped
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaign_recipients TO authenticated;
GRANT ALL ON public.email_campaign_recipients TO service_role;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage recipients"
  ON public.email_campaign_recipients FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS email_recipients_campaign_idx ON public.email_campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS email_recipients_email_idx ON public.email_campaign_recipients(email);

CREATE TRIGGER trg_email_recipients_updated
  BEFORE UPDATE ON public.email_campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- email_templates ----------
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage templates"
  ON public.email_templates FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_email_templates_updated
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- email_media_library ----------
CREATE TABLE IF NOT EXISTS public.email_media_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  kind text NOT NULL DEFAULT 'image', -- image | logo | gif | banner | pdf | video | other
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_media_library TO authenticated;
GRANT ALL ON public.email_media_library TO service_role;
ALTER TABLE public.email_media_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage media"
  ON public.email_media_library FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_email_media_updated
  BEFORE UPDATE ON public.email_media_library
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- email_marketing_unsubscribes ----------
CREATE TABLE IF NOT EXISTS public.email_marketing_unsubscribes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  user_id uuid,
  reason text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_marketing_unsubscribes TO authenticated;
GRANT SELECT, INSERT ON public.email_marketing_unsubscribes TO anon;
GRANT ALL ON public.email_marketing_unsubscribes TO service_role;
ALTER TABLE public.email_marketing_unsubscribes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins view unsubscribes"
  ON public.email_marketing_unsubscribes FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Anyone can add themselves to unsubscribe list"
  ON public.email_marketing_unsubscribes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Super admins can delete unsubscribes"
  ON public.email_marketing_unsubscribes FOR DELETE
  USING (public.has_role(auth.uid(), 'super_admin'));

-- ---------- email_audit_log ----------
CREATE TABLE IF NOT EXISTS public.email_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.email_audit_log TO authenticated;
GRANT ALL ON public.email_audit_log TO service_role;
ALTER TABLE public.email_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins view audit log"
  ON public.email_audit_log FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins add audit entries"
  ON public.email_audit_log FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ---------- Seed system templates ----------
INSERT INTO public.email_templates (name, description, category, subject, preview_text, body_html, is_system)
VALUES
 ('Blank', 'Start from scratch', 'blank', '', '', '<p>Hello {{first_name}},</p><p>Your message here.</p><p>— KudiTrack Team</p>', true),
 ('Product Announcement', 'Announce a new product or major update', 'announcement', '🚀 Introducing something new from KudiTrack', 'Big news for {{business_name}}', '<h1 style="color:#0f172a;">Something new just landed</h1><p>Hi {{first_name}},</p><p>We''re excited to share a new addition to KudiTrack designed to help <strong>{{business_name}}</strong> grow faster.</p><p><a href="https://kuditrack.online" style="display:inline-block;padding:12px 20px;background:#3B82F6;color:#fff;text-decoration:none;border-radius:8px;">See what''s new</a></p><p>— KudiTrack Team</p>', true),
 ('Feature Release', 'Highlight new capabilities', 'announcement', '✨ New in KudiTrack: features built for {{business_name}}', 'What''s new this week', '<h1>New in KudiTrack</h1><p>Hi {{first_name}},</p><ul><li>Feature one</li><li>Feature two</li><li>Feature three</li></ul><p><a href="https://kuditrack.online">Open your dashboard</a></p>', true),
 ('Maintenance Notice', 'Planned downtime notification', 'operational', '🛠️ Scheduled maintenance for KudiTrack', 'Brief downtime this weekend', '<h2>Scheduled maintenance</h2><p>Hi {{first_name}},</p><p>KudiTrack will be briefly unavailable on <strong>[DATE]</strong> from <strong>[TIME]</strong> for planned maintenance. Thanks for your patience.</p>', true),
 ('Promotion', 'Discount or offer', 'marketing', '🎁 A special offer for {{business_name}}', 'Save on your next renewal', '<h1 style="color:#3B82F6;">A special offer, just for you</h1><p>Hi {{first_name}},</p><p>Use code <strong>KUDI20</strong> to save 20% on your next KudiTrack renewal.</p><p><a href="https://kuditrack.online/billing" style="display:inline-block;padding:12px 20px;background:#3B82F6;color:#fff;text-decoration:none;border-radius:8px;">Claim offer</a></p>', true),
 ('Welcome Email', 'Onboard new sign-ups', 'lifecycle', 'Welcome to KudiTrack, {{first_name}} 👋', 'Let''s get {{business_name}} set up', '<h1>Welcome to KudiTrack!</h1><p>Hi {{first_name}},</p><p>We''re thrilled to have {{business_name}} on board. Here are three quick steps to get started:</p><ol><li>Add your first product</li><li>Record your first sale</li><li>Invite a teammate</li></ol><p><a href="https://kuditrack.online/dashboard">Go to your dashboard</a></p>', true),
 ('Subscription Reminder', 'Trial ending soon', 'lifecycle', 'Your KudiTrack plan expires on {{expiry_date}}', 'Keep your business running', '<h2>Your subscription is ending soon</h2><p>Hi {{first_name}},</p><p>Your <strong>{{subscription_plan}}</strong> plan for {{business_name}} expires on <strong>{{expiry_date}}</strong>. Renew today to avoid interruption.</p><p><a href="https://kuditrack.online/billing" style="padding:12px 20px;background:#3B82F6;color:#fff;text-decoration:none;border-radius:8px;">Renew now</a></p>', true),
 ('Payment Reminder', 'Payment due soon', 'billing', 'Payment due for your KudiTrack subscription', 'Complete your renewal', '<h2>Payment reminder</h2><p>Hi {{first_name}},</p><p>Your KudiTrack renewal for <strong>{{business_name}}</strong> is due. Complete payment to avoid any interruption to your service.</p><p><a href="https://kuditrack.online/billing">Pay now</a></p>', true),
 ('Renewal Reminder', 'Nudge to renew before expiry', 'billing', 'Renew KudiTrack before {{expiry_date}}', 'Don''t lose access', '<h2>Time to renew</h2><p>Hi {{first_name}},</p><p>Your {{subscription_plan}} plan expires on <strong>{{expiry_date}}</strong>. Renew now and keep everything running for {{business_name}}.</p>', true),
 ('Survey Invitation', 'Ask for feedback', 'engagement', 'We''d love your feedback, {{first_name}}', 'Quick 2-minute survey', '<h2>Help us improve KudiTrack</h2><p>Hi {{first_name}},</p><p>We''re shipping fast — and your feedback keeps us on the right path. Would you take 2 minutes to share your thoughts?</p><p><a href="https://kuditrack.online">Take the survey</a></p>', true),
 ('Monthly Newsletter', 'Recap of the month', 'newsletter', '📰 KudiTrack Monthly: what''s new', 'This month in KudiTrack', '<h1>KudiTrack Monthly</h1><p>Hi {{first_name}},</p><p>Here''s what shipped this month:</p><ul><li>New feature A</li><li>New feature B</li><li>New feature C</li></ul>', true),
 ('Holiday Greetings', 'Seasonal greeting', 'seasonal', '🎉 Season''s greetings from KudiTrack', 'From our team to yours', '<h1 style="text-align:center;">Season''s Greetings</h1><p>Hi {{first_name}},</p><p>From all of us at KudiTrack, thank you for a great year. Wishing you and {{business_name}} a wonderful season and a strong year ahead.</p>', true)
ON CONFLICT DO NOTHING;
