-- DECLARED FINAL STATE (Git) de register_idempotency
-- fuente: 20260810000012_v2_26_hotfix3_idempotency_registry.sql stmt#5

CREATE OR REPLACE FUNCTION public.register_idempotency(
  p_key text, p_operation text, p_record_id uuid, p_param_hash text, p_result jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF p_key IS NULL THEN RETURN; END IF;
  INSERT INTO idempotency_registry (idempotency_key, operation, record_id, param_hash, result)
  VALUES (p_key, p_operation, p_record_id, p_param_hash, p_result)
  ON CONFLICT (idempotency_key, operation) DO NOTHING;
END;
$$
