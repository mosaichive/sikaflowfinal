
CREATE TABLE public.marketing_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  business_name TEXT,
  testimonial TEXT NOT NULL DEFAULT '',
  rating INT NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  media_url TEXT,
  media_type TEXT CHECK (media_type IN ('image','video')),
  avatar_url TEXT,
  visible BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.marketing_reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.marketing_reviews TO authenticated;
GRANT ALL ON public.marketing_reviews TO service_role;

ALTER TABLE public.marketing_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_reviews public read visible"
  ON public.marketing_reviews FOR SELECT
  USING (visible = true);

CREATE POLICY "marketing_reviews super admin all"
  ON public.marketing_reviews FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.tg_marketing_reviews_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_marketing_reviews_updated_at
  BEFORE UPDATE ON public.marketing_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_marketing_reviews_set_updated_at();
