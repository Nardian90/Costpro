-- DECLARED FINAL STATE (Git) de check_idempotency
-- fuente: 20260810000012_v2_26_hotfix3_idempotency_registry.sql stmt#4

CREATE OR REPLACE FUNCTION public.check_idempotency(
  p_key text, p_operation text, p_record_id uuid, p_param_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE v_existing jsonb;
BEGIN
  IF p_key IS NULL THEN RETURN NULL; END IF;
  
  SELECT result INTO v_existing FROM idempotency_registry
  WHERE idempotency_key = p_key AND operation = p_operation LIMIT 1;
  
  IF v_existing IS NOT NULL THEN
    SELECT param_hash INTO v_existing FROM idempotency_registry
    WHERE idempotency_key = p_key AND operation = p_operation LIMIT 1;
    
    IF v_existing::text != p_param_hash THEN
      RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
    END IF;
    
    SELECT result INTO v_existing FROM idempotency_registry
    WHERE idempotency_key = p_key AND operation = p_operation LIMIT 1;
    RETURN v_existing;
  END IF;
  
  RETURN NULL;
END;
$$
