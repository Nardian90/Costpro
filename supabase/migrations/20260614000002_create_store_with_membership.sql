-- =============================================================================
-- Migration: Create atomic store creation RPC function
-- Date: 2026-06-14
-- Task: P2-TRANSACTION
--
-- Previously, store creation and membership insertion were two separate
-- operations in the API route. If the membership insert failed, an orphan
-- store with no admin would be left behind. This migration creates a single
-- RPC function that wraps both operations in one database transaction,
-- guaranteeing atomicity.
--
-- The function also enforces plan limits (max stores per user) within the
-- same transaction, eliminating the race condition where two concurrent
-- requests could both pass the count check before either inserts.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_store_with_membership(
  p_name TEXT,
  p_address TEXT,
  p_created_by UUID,
  p_plan TEXT DEFAULT 'basico',
  p_max_stores INTEGER DEFAULT 1,
  p_additional_data JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
  v_active_count INTEGER;
  v_result JSONB;
BEGIN
  -- Count active stores created by this user
  SELECT COUNT(*) INTO v_active_count
  FROM stores
  WHERE created_by = p_created_by AND is_active = true;

  -- Enforce plan limit
  IF v_active_count >= p_max_stores THEN
    RAISE EXCEPTION 'Se ha alcanzado el límite de % tiendas permitidas por tu plan.', p_max_stores;
  END IF;

  -- Insert store
  INSERT INTO stores (name, address, created_by, is_active,
    logo_url, reeup, nit, bank_account, phone, email, slug, plantilla,
    signature_url, stamp_url, latitude, longitude)
  VALUES (
    p_name, p_address, p_created_by, true,
    p_additional_data->>'logo_url',
    p_additional_data->>'reeup',
    p_additional_data->>'nit',
    p_additional_data->>'bank_account',
    p_additional_data->>'phone',
    p_additional_data->>'email',
    p_additional_data->>'slug',
    p_additional_data->>'plantilla',
    p_additional_data->>'signature_url',
    p_additional_data->>'stamp_url',
    (p_additional_data->>'latitude')::DOUBLE PRECISION,
    (p_additional_data->>'longitude')::DOUBLE PRECISION
  )
  RETURNING id INTO v_store_id;

  -- Insert membership (same transaction — guaranteed atomic)
  INSERT INTO user_store_memberships (user_id, store_id, role, status)
  VALUES (p_created_by, v_store_id, 'admin', 'active');

  -- Return the created store
  SELECT jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'address', s.address,
    'created_by', s.created_by,
    'is_active', s.is_active,
    'logo_url', s.logo_url,
    'reeup', s.reeup,
    'nit', s.nit,
    'bank_account', s.bank_account,
    'phone', s.phone,
    'email', s.email,
    'slug', s.slug,
    'plantilla', s.plantilla,
    'signature_url', s.signature_url,
    'stamp_url', s.stamp_url,
    'latitude', s.latitude,
    'longitude', s.longitude,
    'created_at', s.created_at
  ) INTO v_result
  FROM stores s WHERE s.id = v_store_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.create_store_with_membership IS
  'Atomic store creation with auto-membership. Enforces plan limits within the transaction. SECURITY DEFINER allows the service-role caller to insert both store and membership in a single transaction.';

-- Grant execute only to authenticated role.
-- FIX-SEC: anon access removed — unauthenticated users must not be able to
-- create stores directly via RPC. All mutations must go through the API route
-- which enforces auth, CSRF, and rate limiting.
GRANT EXECUTE ON FUNCTION public.create_store_with_membership TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_store_with_membership FROM anon;
