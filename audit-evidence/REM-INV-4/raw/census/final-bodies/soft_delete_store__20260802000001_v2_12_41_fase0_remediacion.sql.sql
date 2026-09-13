-- DECLARED FINAL STATE (Git) de soft_delete_store
-- fuente: 20260802000001_v2_12_41_fase0_remediacion.sql stmt#5

CREATE OR REPLACE FUNCTION public.soft_delete_store(
  p_store_id UUID,
  p_deleted_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_deleted_by, auth.uid()) ELSE auth.uid() END;
  v_result JSONB;
  v_validation JSONB;
  v_blockers TEXT;
BEGIN
  -- Anti-spoofing: verificar que el caller tiene acceso
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Verificar que la tienda existe y está activa
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = p_store_id AND is_active = true) THEN
    RAISE EXCEPTION 'Tienda no encontrada o ya inactiva';
  END IF;

  -- H-007/008/009: Validar dependencias empresariales antes de eliminar
  SELECT * INTO v_validation FROM public.validate_store_can_be_modified(p_store_id, 'soft_delete');

  IF NOT (v_validation->>'can_modify')::boolean THEN
    SELECT string_agg(blocker->>'message', '; ')
    INTO v_blockers
    FROM jsonb_array_elements(v_validation->'blockers') AS blocker;

    RAISE EXCEPTION 'ERR_STORE_HAS_DEPENDENCIES: %', COALESCE(v_blockers, 'Hay dependencias pendientes');
  END IF;

  -- 1. Soft-delete the store
  UPDATE stores SET is_active = false WHERE id = p_store_id;

  -- 2. Revoke all memberships
  UPDATE user_store_memberships
  SET status = 'revoked'
  WHERE store_id = p_store_id AND status = 'active';

  -- 3. Clear active_store_id references
  UPDATE profiles SET active_store_id = NULL WHERE active_store_id = p_store_id;

  -- 4. Log the deletion (usar v_caller_uid, no p_deleted_by)
  INSERT INTO audit_logs (action, table_name, record_id, store_id, metadata)
  VALUES (
    'store_soft_deleted', 'stores', p_store_id, p_store_id,
    jsonb_build_object(
      'deleted_by', v_caller_uid,
      'deleted_at', now(),
      'memberships_revoked', (SELECT count(*) FROM user_store_memberships WHERE store_id = p_store_id AND status = 'revoked')
    )
  );

  -- 5. Retornar resultado con count correcto (H-013 fix)
  SELECT jsonb_build_object(
    'store_id', p_store_id,
    'is_active', false,
    'memberships_revoked', (SELECT count(*) FROM user_store_memberships WHERE store_id = p_store_id AND status = 'revoked'),
    'profiles_cleared', (SELECT count(*) FROM profiles WHERE id IN (
      SELECT user_id FROM user_store_memberships WHERE store_id = p_store_id
    ) AND active_store_id IS NULL)
  ) INTO v_result;

  RETURN v_result;
END;
$$
