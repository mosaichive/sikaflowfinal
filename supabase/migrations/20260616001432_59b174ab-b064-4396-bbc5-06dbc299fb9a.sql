-- SMS notification preferences on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sms_notify_sale_thanks boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_notify_low_stock boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_notify_team_invite boolean NOT NULL DEFAULT true;

-- SMS notification log
CREATE TABLE IF NOT EXISTS public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_phone text NOT NULL,
  notification_type text NOT NULL CHECK (notification_type IN ('sale_thanks','low_stock','team_invite')),
  message_preview text,
  provider_response jsonb,
  status text NOT NULL CHECK (status IN ('sent','failed')),
  error_message text,
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sms_logs TO authenticated;
GRANT ALL ON public.sms_logs TO service_role;

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their SMS logs"
  ON public.sms_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = business_id);

CREATE INDEX IF NOT EXISTS sms_logs_business_type_created_idx
  ON public.sms_logs (business_id, notification_type, created_at DESC);

CREATE INDEX IF NOT EXISTS sms_logs_reference_idx
  ON public.sms_logs (reference_id, notification_type, created_at DESC);