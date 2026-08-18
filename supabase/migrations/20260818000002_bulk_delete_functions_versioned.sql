-- ============================================================================
-- BULK DELETE FUNCTIONS — Versioning (H3 fix)
-- ============================================================================

-- Table: bulk_confirmation_tokens
CREATE TABLE IF NOT EXISTS public.bulk_confirmation_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  token text NOT NULL,
  store_ids ARRAY NOT NULL,
  action text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  metadata jsonb,
  is_override boolean DEFAULT false NOT NULL,
  override_for text
);

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


-- Security: restrict bulk_soft_delete_stores to service_role only
REVOKE EXECUTE ON FUNCTION public.bulk_soft_delete_stores FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_soft_delete_stores TO service_role;

CREATE OR REPLACE FUNCTION public.check_bulk_ops_hourly_limit(p_user_id uuid, p_plan text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
BEGIN
  v_limit := CASE p_plan
    WHEN 'free' THEN 1
    WHEN 'pro' THEN 20
    WHEN 'enterprise' THEN 999999
    ELSE 1
  END;

  SELECT COUNT(*) INTO v_used
  FROM public.bulk_ops_log
  WHERE user_id = p_user_id
    AND initiated_at > NOW() - INTERVAL '1 hour';

  RETURN jsonb_build_object(
    'allowed', v_used < v_limit,
    'used', v_used,
    'limit', v_limit,
    'remaining', GREATEST(0, v_limit - v_used)
  );
END;
$function$


-- Security: restrict check_bulk_ops_hourly_limit to service_role only
REVOKE EXECUTE ON FUNCTION public.check_bulk_ops_hourly_limit FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_bulk_ops_hourly_limit TO service_role;

CREATE OR REPLACE FUNCTION public.generate_bulk_confirmation_token(p_store_ids uuid[], p_action text, p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token TEXT;
  v_has_protected BOOLEAN;
  v_caller_role TEXT;
BEGIN
  -- AUTH CHECK: Solo admin
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: Solo admin puede generar tokens bulk';
    END IF;
    -- Verificar que p_user_id coincide con auth.uid()
    IF p_user_id != auth.uid() THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: p_user_id debe coincidir con el usuario autenticado';
    END IF;
  END IF;

  IF p_action NOT IN ('delete', 'archive') THEN
    RAISE EXCEPTION 'ERR_NON_DESTRUCTIVE_ACTION';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.stores
    WHERE id = ANY(p_store_ids) AND backup_restore_protected = true
  ) INTO v_has_protected;

  v_token := 'bct_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.bulk_confirmation_tokens (
    token, store_ids, action, created_by, expires_at, metadata
  ) VALUES (
    v_token, p_store_ids, p_action, p_user_id,
    NOW() + INTERVAL '10 minutes',
    jsonb_build_object('has_protected_stores', v_has_protected)
  );

  RETURN v_token;
END;
$function$


-- Security: restrict generate_bulk_confirmation_token to service_role only
REVOKE EXECUTE ON FUNCTION public.generate_bulk_confirmation_token FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_bulk_confirmation_token TO service_role;

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


-- Security: restrict generate_bulk_override_token to service_role only
REVOKE EXECUTE ON FUNCTION public.generate_bulk_override_token FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_bulk_override_token TO service_role;

