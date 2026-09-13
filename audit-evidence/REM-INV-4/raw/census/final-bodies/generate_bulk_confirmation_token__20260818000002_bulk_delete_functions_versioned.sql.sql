-- DECLARED FINAL STATE (Git) de generate_bulk_confirmation_token
-- fuente: 20260818000002_bulk_delete_functions_versioned.sql stmt#5

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


 
REVOKE EXECUTE ON FUNCTION public.generate_bulk_confirmation_token FROM PUBLIC, anon, authenticated
