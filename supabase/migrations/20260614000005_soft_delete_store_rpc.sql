-- =============================================================================
-- Migration: Create atomic soft-delete RPC for stores
-- Date: 2026-06-14
-- Task: DI-1
--
-- Previously, soft-delete and membership cleanup were separate queries,
-- creating a window where the store is inactive but memberships remain active.
-- This RPC wraps all cleanup in a single transaction.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.soft_delete_store(
  p_store_id UUID,
  p_deleted_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Verify the store exists and is active
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = p_store_id AND is_active = true) THEN
    RAISE EXCEPTION 'Tienda no encontrada o ya inactiva';
  END IF;

  -- 1. Soft-delete the store
  UPDATE stores SET is_active = false WHERE id = p_store_id;

  -- 2. Revoke all memberships (same transaction — guaranteed atomic)
  UPDATE user_store_memberships
  SET status = 'revoked'
  WHERE store_id = p_store_id AND status = 'active';

  -- 3. Clear active_store_id references for all users pointing to this store
  UPDATE profiles
  SET active_store_id = NULL
  WHERE active_store_id = p_store_id;

  -- 4. Log the deletion
  INSERT INTO audit_logs (action, table_name, record_id, store_id, metadata)
  VALUES (
    'store_soft_deleted',
    'stores',
    p_store_id,
    p_store_id,
    jsonb_build_object(
      'deleted_by', p_deleted_by,
      'deleted_at', now()
    )
  );

  -- Return confirmation
  SELECT jsonb_build_object(
    'store_id', p_store_id,
    'is_active', false,
    'memberships_revoked', (SELECT count(*) FROM user_store_memberships WHERE store_id = p_store_id AND status = 'revoked'),
    'profiles_cleared', (SELECT count(*) FROM profiles WHERE active_store_id IS NULL AND id IN (
      SELECT user_id FROM user_store_memberships WHERE store_id = p_store_id
    ))
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.soft_delete_store IS
  'Atomic soft-delete of a store with membership cleanup and audit logging in a single transaction. SECURITY DEFINER allows service-role callers to perform all operations atomically.';

GRANT EXECUTE ON FUNCTION public.soft_delete_store TO authenticated;
REVOKE EXECUTE ON FUNCTION public.soft_delete_store FROM anon;
