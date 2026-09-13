-- DECLARED FINAL STATE (Git) de generate_bulk_override_token
-- fuente: 20260818000002_bulk_delete_functions_versioned.sql stmt#7

CREATE OR REPLACE FUNCTION public.generate_bulk_override_token(p_confirmation_token text, p_override_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_original RECORD;
  v_override_token TEXT;
  v_override_user_role TEXT;
BEGIN
  -- AUTH CHECK: Solo admin, y debe ser auth.uid() == p_override_user_id
  IF auth.uid() IS NOT NULL THEN
    IF auth.uid() != p_override_user_id THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: p_override_user_id debe coincidir con el usuario autenticado';
    END IF;

    SELECT role INTO v_override_user_role FROM public.profiles WHERE id = p_override_user_id;
    IF v_override_user_role IS NULL OR v_override_user_role != 'admin' THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: Solo admin puede generar override';
    END IF;
  END IF;

  SELECT * INTO v_original
  FROM public.bulk_confirmation_tokens
  WHERE token = p_confirmation_token
    AND consumed_at IS NULL
    AND expires_at > NOW()
    AND is_override = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_INVALID_OR_EXPIRED_TOKEN';
  END IF;

  IF v_original.created_by = p_override_user_id THEN
    RAISE EXCEPTION 'ERR_SAME_USER_OVERRIDE';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.bulk_confirmation_tokens
    WHERE override_for = p_confirmation_token
      AND consumed_at IS NULL AND expires_at > NOW()
  ) THEN
    RAISE EXCEPTION 'ERR_OVERRIDE_ALREADY_EXISTS';
  END IF;

  v_override_token := 'bot_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.bulk_confirmation_tokens (
    token, store_ids, action, created_by, expires_at,
    is_override, override_for, metadata
  ) VALUES (
    v_override_token, v_original.store_ids, v_original.action, p_override_user_id,
    NOW() + INTERVAL '10 minutes', true, p_confirmation_token,
    jsonb_build_object('override_reason', p_reason,
      'original_created_by', v_original.created_by,
      'override_created_by', p_override_user_id)
  );

  INSERT INTO public.audit_logs (action, table_name, record_id, metadata)
  VALUES (
    'bulk_override_token_generated', 'stores', NULL,
    jsonb_build_object('confirmation_token', p_confirmation_token,
      'store_ids', v_original.store_ids,
      'override_by', p_override_user_id,
      'original_by', v_original.created_by, 'reason', p_reason)
  );

  RETURN v_override_token;
END;
$function$


 
REVOKE EXECUTE ON FUNCTION public.generate_bulk_override_token FROM PUBLIC, anon, authenticated
