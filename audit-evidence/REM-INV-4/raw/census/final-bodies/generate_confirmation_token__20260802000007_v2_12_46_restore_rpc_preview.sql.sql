-- DECLARED FINAL STATE (Git) de generate_confirmation_token
-- fuente: 20260802000007_v2_12_46_restore_rpc_preview.sql stmt#14

CREATE OR REPLACE FUNCTION public.generate_confirmation_token(
  p_session_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
  v_store_id UUID;
  v_preview_passed BOOLEAN;
BEGIN
  -- Verify session exists, is in DRY_RUN status, and preview passed
  SELECT store_id, preview_passed INTO v_store_id, v_preview_passed
  FROM public.restore_sessions
  WHERE id = p_session_id AND status = 'DRY_RUN';

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_SESSION_NOT_FOUND: Sesión % no existe o no está en estado DRY_RUN', p_session_id;
  END IF;

  IF NOT v_preview_passed THEN
    RAISE EXCEPTION 'ERR_PREVIEW_NOT_PASSED: Preview falló. Corrige los errores antes de generar el token.';
  END IF;

  -- Generate random token (using gen_random_uuid for cryptographic randomness)
  v_token := 'rst_' || replace(gen_random_uuid()::text, '-', '');

  UPDATE public.restore_sessions
  SET confirmation_token = v_token
  WHERE id = p_session_id;

  RETURN v_token;
END;
$$
