
-- Feedback messages from public landing page
CREATE TABLE public.feedback_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  CONSTRAINT feedback_messages_status_check CHECK (status IN ('new','in_progress','resolved'))
);

GRANT INSERT ON public.feedback_messages TO anon;
GRANT INSERT ON public.feedback_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_messages TO service_role;

ALTER TABLE public.feedback_messages ENABLE ROW LEVEL SECURITY;

-- Anyone (anon or authenticated) can submit feedback
CREATE POLICY "Anyone can submit feedback"
  ON public.feedback_messages FOR INSERT
  WITH CHECK (true);

-- Only super admins can read/update/delete
CREATE POLICY "Super admins read feedback"
  ON public.feedback_messages FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins update feedback"
  ON public.feedback_messages FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins delete feedback"
  ON public.feedback_messages FOR DELETE
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Advertising applications from public landing page
CREATE TABLE public.ad_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  business_type TEXT,
  ad_goal TEXT,
  budget TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  CONSTRAINT ad_applications_status_check CHECK (status IN ('pending','approved','rejected','contacted'))
);

GRANT INSERT ON public.ad_applications TO anon;
GRANT INSERT ON public.ad_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_applications TO service_role;

ALTER TABLE public.ad_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit ad application"
  ON public.ad_applications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Super admins read ad applications"
  ON public.ad_applications FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins update ad applications"
  ON public.ad_applications FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins delete ad applications"
  ON public.ad_applications FOR DELETE
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_applications;
