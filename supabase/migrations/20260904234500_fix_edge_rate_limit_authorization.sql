-- The function is callable only by service_role. Do not also depend on the
-- legacy request.jwt.claim.role setting, which is absent in current PostgREST.
CREATE OR REPLACE FUNCTION public.consume_edge_rate_limit(
  p_action text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
BEGIN
  IF p_action IS NULL OR length(p_action) NOT BETWEEN 1 AND 80
     OR p_key_hash IS NULL OR length(p_key_hash) <> 64
     OR p_limit NOT BETWEEN 1 AND 10000
     OR p_window_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'invalid rate limit input' USING ERRCODE = '22023';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.edge_rate_limits (action, key_hash, window_start, request_count, updated_at)
  VALUES (p_action, p_key_hash, v_window_start, 1, now())
  ON CONFLICT (action, key_hash, window_start)
  DO UPDATE SET
    request_count = public.edge_rate_limits.request_count + 1,
    updated_at = now()
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_edge_rate_limit(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_edge_rate_limit(text, text, integer, integer)
  TO service_role;
