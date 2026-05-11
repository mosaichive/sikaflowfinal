
-- platform_ads
CREATE TABLE IF NOT EXISTS public.platform_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  cta_text text,
  cta_url text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_ads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ads readable by signed-in" ON public.platform_ads;
CREATE POLICY "ads readable by signed-in" ON public.platform_ads FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "ads managed by super admin" ON public.platform_ads;
CREATE POLICY "ads managed by super admin" ON public.platform_ads FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
DROP TRIGGER IF EXISTS trg_platform_ads_updated ON public.platform_ads;
CREATE TRIGGER trg_platform_ads_updated BEFORE UPDATE ON public.platform_ads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- platform_support_settings (singleton)
CREATE TABLE IF NOT EXISTS public.platform_support_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_key text NOT NULL UNIQUE DEFAULT 'default',
  support_email text NOT NULL DEFAULT '',
  phone_number text NOT NULL DEFAULT '',
  whatsapp_number text NOT NULL DEFAULT '',
  whatsapp_link text NOT NULL DEFAULT '',
  office_address text NOT NULL DEFAULT '',
  show_email boolean NOT NULL DEFAULT true,
  show_phone boolean NOT NULL DEFAULT true,
  show_whatsapp boolean NOT NULL DEFAULT true,
  show_office_address boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_support_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "support settings readable by signed-in" ON public.platform_support_settings;
CREATE POLICY "support settings readable by signed-in" ON public.platform_support_settings FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "support settings managed by super admin" ON public.platform_support_settings;
CREATE POLICY "support settings managed by super admin" ON public.platform_support_settings FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
DROP TRIGGER IF EXISTS trg_platform_support_settings_updated ON public.platform_support_settings;
CREATE TRIGGER trg_platform_support_settings_updated BEFORE UPDATE ON public.platform_support_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.platform_support_settings (singleton_key) VALUES ('default') ON CONFLICT DO NOTHING;

-- support_messages
CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  sender_name text NOT NULL DEFAULT '',
  sender_contact text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "support messages user insert" ON public.support_messages;
CREATE POLICY "support messages user insert" ON public.support_messages FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "support messages super admin read" ON public.support_messages;
CREATE POLICY "support messages super admin read" ON public.support_messages FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin') OR auth.uid() = user_id);
DROP POLICY IF EXISTS "support messages super admin update" ON public.support_messages;
CREATE POLICY "support messages super admin update" ON public.support_messages FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "support messages super admin delete" ON public.support_messages;
CREATE POLICY "support messages super admin delete" ON public.support_messages FOR DELETE
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Storage bucket for ads
INSERT INTO storage.buckets (id, name, public) VALUES ('platform-ads', 'platform-ads', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "platform-ads public read" ON storage.objects;
CREATE POLICY "platform-ads public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'platform-ads');
DROP POLICY IF EXISTS "platform-ads super admin write" ON storage.objects;
CREATE POLICY "platform-ads super admin write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'platform-ads' AND public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "platform-ads super admin update" ON storage.objects;
CREATE POLICY "platform-ads super admin update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'platform-ads' AND public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "platform-ads super admin delete" ON storage.objects;
CREATE POLICY "platform-ads super admin delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'platform-ads' AND public.has_role(auth.uid(), 'super_admin'));
