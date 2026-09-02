-- Some older tables use the shared set_updated_at trigger even though they
-- do not have an updated_at column. Foreign-key cleanup during Auth user
-- deletion updates sales.staff_id and expenses.recorded_by, so this trigger
-- must be safe on both old and new table shapes.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_jsonb(NEW) ? 'updated_at' THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('updated_at', now()));
  END IF;

  RETURN NEW;
END;
$$;
