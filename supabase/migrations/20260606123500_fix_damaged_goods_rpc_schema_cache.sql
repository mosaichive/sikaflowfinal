-- PostgREST resolves RPCs by exposed argument names in its schema cache.
-- Keep a stable v2 wrapper with the exact argument set used by the client,
-- then ask PostgREST to refresh its schema cache after creation.

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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.record_damaged_goods(
    _product_id,
    _quantity,
    _reason,
    _damage_date,
    _notes,
    _business_id,
    _recorded_by_name
  );
$$;

GRANT EXECUTE ON FUNCTION public.record_damaged_goods_v2(uuid, timestamptz, text, uuid, integer, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
