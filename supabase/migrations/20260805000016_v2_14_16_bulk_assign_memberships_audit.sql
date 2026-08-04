-- ============================================================================
-- Migration: 20260805000016_v2_14_16_bulk_assign_memberships_audit.sql
-- Iteración 12 — Fix H-2 (audit log en bulk_assign_memberships)
-- ============================================================================
-- Reescribe bulk_assign_memberships para añadir audit log atómico.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.bulk_assign_memberships;

CREATE OR REPLACE FUNCTION public.bulk_assign_memberships(
  p_user_id uuid,
  p_assignments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_assignment jsonb;
  v_affected int := 0;
  v_failed int := 0;
  v_store_id uuid;
  v_role public.user_role;
  v_status text;
  v_caller_uid uuid := auth.uid();
  v_changes jsonb := '[]'::jsonb;
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_assignments) LOOP
    BEGIN
      v_store_id := (v_assignment->>'store_id')::uuid;
      v_role := (v_assignment->>'role')::public.user_role;
      v_status := COALESCE(v_assignment->>'status', 'active');

      -- Validar caller tiene acceso al store
      IF NOT public.is_admin() AND NOT public.has_store_role(v_store_id, ARRAY['admin', 'manager']) THEN
        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
      VALUES (p_user_id, v_store_id, v_role, v_status)
      ON CONFLICT (user_id, store_id) DO UPDATE SET
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = now();

      v_changes := v_changes || jsonb_build_object(jsonb_build_object(
        'store_id', v_store_id,
        'role', v_role::text,
        'status', v_status
      ));

      v_affected := v_affected + 1;
    EXCEPTION
      WHEN foreign_key_violation THEN
        v_failed := v_failed + 1;
    END;
  END LOOP;

  -- Audit log atómico (solo si hubo cambios)
  IF v_affected > 0 THEN
    INSERT INTO public.user_audit_log (performed_by, target_user_id, action, new_values, metadata)
    VALUES (
      v_caller_uid, p_user_id, 'MEMBERSHIPS_BULK_ASSIGNED',
      jsonb_build_object('assignments', v_changes),
      jsonb_build_object('affected', v_affected, 'failed', v_failed)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'affected', v_affected,
    'failed', v_failed,
    'user_id', p_user_id
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.bulk_assign_memberships FROM anon;
GRANT EXECUTE ON FUNCTION public.bulk_assign_memberships TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_assign_memberships TO service_role;

COMMENT ON FUNCTION public.bulk_assign_memberships IS
  'Iteración 12 (H-2): Bulk assign memberships with atomic audit log. Validates caller has admin/manager role on each store.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Restaurar versión anterior sin audit log (de 20260616000001_create_bulk_assign_memberships_rpc.sql):
-- DROP FUNCTION IF EXISTS public.bulk_assign_memberships;
-- CREATE OR REPLACE FUNCTION public.bulk_assign_memberships(...) AS $function$
--   ... (body sin audit log) ...
-- $function$;
-- ============================================================================
