
ALTER TABLE public.surveys ADD COLUMN IF NOT EXISTS enabled_at timestamptz;

-- Backfill: for currently enabled surveys, use updated_at (or created_at) as the enable time
UPDATE public.surveys SET enabled_at = COALESCE(updated_at, created_at) WHERE enabled = true AND enabled_at IS NULL;

CREATE OR REPLACE FUNCTION public.tg_surveys_set_enabled_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.enabled = true AND (TG_OP = 'INSERT' OR OLD.enabled = false OR OLD.enabled IS NULL) THEN
    NEW.enabled_at := now();
  ELSIF NEW.enabled = false THEN
    -- keep last enabled_at as historical marker; or clear it. Keep it for eligibility comparisons.
    NEW.enabled_at := NEW.enabled_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS surveys_set_enabled_at ON public.surveys;
CREATE TRIGGER surveys_set_enabled_at
BEFORE INSERT OR UPDATE OF enabled ON public.surveys
FOR EACH ROW EXECUTE FUNCTION public.tg_surveys_set_enabled_at();
