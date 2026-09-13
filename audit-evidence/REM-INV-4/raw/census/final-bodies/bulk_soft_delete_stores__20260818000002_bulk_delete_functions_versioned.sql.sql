-- DECLARED FINAL STATE (Git) de bulk_soft_delete_stores
-- fuente: 20260818000002_bulk_delete_functions_versioned.sql stmt#1

CREATE OR REPLACE FUNCTION public.bulk_soft_delete_stores(p_store_ids uuid[], p_deleted_by uuid, p_confirmation_token text, p_override_token text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id UUID;
  v_validation JSONB;
  v_blockers JSONB;
  v_errors JSONB[] := '{}'::jsonb[];
  v_processed INTEGER := 0;
  v_token_valid BOOLEAN;
  v_has_protected BOOLEAN;
  v_override_valid BOOLEAN;
  v_confirmation_record RECORD;
  v_override_record RECORD;
  v_caller_role TEXT;
BEGIN
  -- ============================================================
  -- AUTH CHECK: Solo admin puede ejecutar esta función
  -- ============================================================
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: Solo admin puede ejecutar bulk_soft_delete_stores';
    END IF;
  END IF;
  -- Si auth.uid() IS NULL, es service_role — permitir

  -- ============================================================
  -- 1. VALIDATE confirmation_token
  -- ============================================================
  SELECT * INTO v_confirmation_record
  FROM public.bulk_confirmation_tokens
  WHERE token = p_confirmation_token
    AND action = 'delete'
    AND expires_at > NOW()
    AND consumed_at IS NULL
    AND is_override = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_INVALID_CONFIRMATION_TOKEN';
  END IF;

  IF v_confirmation_record.store_ids != p_store_ids THEN
    RAISE EXCEPTION 'ERR_STORE_IDS_MISMATCH';
  END IF;

  -- ============================================================
  -- 2. VALIDATE tiendas protegidas requieren override_token
  -- ============================================================
  SELECT EXISTS(
    SELECT 1 FROM public.stores
    WHERE id = ANY(p_store_ids) AND backup_restore_protected = true
  ) INTO v_has_protected;

  IF v_has_protected THEN
    IF p_override_token IS NULL THEN
      RAISE EXCEPTION 'ERR_OVERRIDE_REQUIRED';
    END IF;

    SELECT * INTO v_override_record
    FROM public.bulk_confirmation_tokens
    WHERE token = p_override_token
      AND is_override = true
      AND override_for = p_confirmation_token
      AND expires_at > NOW()
      AND consumed_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_INVALID_OVERRIDE_TOKEN';
    END IF;

    IF v_override_record.store_ids != v_confirmation_record.store_ids THEN
      RAISE EXCEPTION 'ERR_OVERRIDE_STORE_IDS_MISMATCH';
    END IF;

    IF v_override_record.created_by = v_confirmation_record.created_by THEN
      RAISE EXCEPTION 'ERR_SAME_USER_OVERRIDE';
    END IF;

    UPDATE public.bulk_confirmation_tokens SET consumed_at = NOW()
    WHERE token = p_override_token;
  END IF;

  UPDATE public.bulk_confirmation_tokens SET consumed_at = NOW()
  WHERE token = p_confirmation_token;

  -- ============================================================
  -- 3. VALIDATE todas las tiendas
  -- ============================================================
  FOREACH v_store_id IN ARRAY p_store_ids LOOP
    IF NOT EXISTS(SELECT 1 FROM public.stores WHERE id = v_store_id AND is_active = true) THEN
      v_errors := array_append(v_errors, jsonb_build_object(
        'store_id', v_store_id, 'reason', 'STORE_NOT_FOUND_OR_INACTIVE'
      ));
      CONTINUE;
    END IF;

    SELECT public.validate_store_can_be_modified(v_store_id, 'soft_delete') INTO v_validation;
    v_blockers := v_validation->'blockers';

    IF v_validation->>'can_modify' != 'true' THEN
      v_errors := array_append(v_errors, jsonb_build_object(
        'store_id', v_store_id, 'reason', 'HAS_BLOCKING_DEPENDENCIES', 'blockers', v_blockers
      ));
    END IF;
  END LOOP;

  IF array_length(v_errors, 1) IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'FAILED', 'processed', 0,
      'total_requested', array_length(p_store_ids, 1),
      'errors', to_jsonb(v_errors), 'reason', p_reason
    );
  END IF;

  -- ============================================================
  -- 4. EXECUTE
  -- ============================================================
  FOREACH v_store_id IN ARRAY p_store_ids LOOP
    PERFORM public.soft_delete_store(v_store_id, p_deleted_by);
    v_processed := v_processed + 1;
  END LOOP;

  INSERT INTO public.audit_logs (action, table_name, record_id, metadata)
  VALUES (
    'bulk_store_deleted', 'stores', NULL,
    jsonb_build_object(
      'store_ids', p_store_ids, 'deleted_by', p_deleted_by,
      'reason', p_reason, 'processed', v_processed,
      'had_protected_stores', v_has_protected,
      'override_used', p_override_token IS NOT NULL, 'deleted_at', NOW()
    )
  );

  RETURN jsonb_build_object(
    'status', 'COMPLETED', 'processed', v_processed,
    'total_requested', array_length(p_store_ids, 1),
    'errors', '[]'::jsonb, 'reason', p_reason
  );
END;
$function$


 
REVOKE EXECUTE ON FUNCTION public.bulk_soft_delete_stores FROM PUBLIC, anon, authenticated
