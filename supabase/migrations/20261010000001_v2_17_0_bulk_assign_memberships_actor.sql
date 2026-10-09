-- ============================================================================
-- Migration: 20261010000001_v2_17_0_bulk_assign_memberships_actor.sql
-- Fix: bulk_assign_memberships siempre falla con ERR_UNAUTHORIZED
-- ============================================================================
-- CAUSA RAÍZ (bug de asignación masiva):
--   1) La RPC (20260805000016) resuelve al llamador SOLO vía auth.uid() y
--      lanza ERR_UNAUTHORIZED si es NULL.
--   2) El ACL (20260916000002) quedó certificado service_role-only.
--   3) La ruta /api/users/[id]/memberships/bulk invoca la RPC con el cliente
--      service_role (sin JWT de usuario) → auth.uid() = NULL → la RPC falla
--      el 100% de las veces y la asignación masiva de la UI está muerta.
--
-- PATRÓN DE LA APP (doctrina ya establecida):
--   create_sale_v2 (20261004130000 §3.1) resuelve:
--     v_uid := CASE WHEN auth.role() = 'service_role'
--                   THEN COALESCE(p_user_id, auth.uid())
--                   ELSE auth.uid() END;
--   El actor llega como parámetro EXPLÍCITO derivado server-side de la sesión
--   verificada (nunca del body del cliente) — H0-R §4/§10.
--
-- FIX:
--   - Nueva firma (p_user_id, p_assignments, p_actor_id DEFAULT NULL).
--   - El actor se resuelve con el patrón create_sale_v2.
--   - La re-validación por tienda del ACTOR usa has_store_role_as()
--      (20260807000002: bypass admin/superadmin + membership activa), que no
--      depende de auth.uid() y es safe con NULL.
--   - Audit log performed_by = actor real (antes quedaba NULL bajo service_role).
--   - ACL: service_role-only (re-certifica el contrato 20260916000002, que es
--      el único llamador: la ruta de API).
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.bulk_assign_memberships(uuid, jsonb);
DROP FUNCTION IF EXISTS public.bulk_assign_memberships;

CREATE OR REPLACE FUNCTION public.bulk_assign_memberships(
  p_user_id uuid,
  p_assignments jsonb,
  p_actor_id uuid DEFAULT NULL
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
  v_actor uuid;
  v_changes jsonb := '[]'::jsonb;
BEGIN
  -- Actor: patrón create_sale_v2 (20261004130000 §3.1). Bajo service_role el
  -- actor llega EXPLÍCITO por parámetro (la ruta lo deriva de la sesión
  -- verificada); bajo JWT de usuario manda auth.uid() y el parámetro se ignora
  -- (anti-spoofing, doctrina 20260820000001).
  v_actor := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_actor_id, auth.uid())
    ELSE auth.uid()
  END;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- El objetivo de la asignación debe existir (fail-closed, antes del bucle).
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND';
  END IF;

  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_assignments) LOOP
    BEGIN
      v_store_id := (v_assignment->>'store_id')::uuid;
      v_role := (v_assignment->>'role')::public.user_role;
      v_status := COALESCE(v_assignment->>'status', 'active');

      -- Autorización del ACTOR sobre la tienda objetivo (no del rol JWT):
      -- has_store_role_as = bypass admin/superadmin global + membership activa
      -- con rol de gestión en la tienda (20260807000002).
      IF NOT public.has_store_role_as(v_actor, v_store_id, ARRAY['admin', 'manager']::text[]) THEN
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

  -- Audit log atómico (solo si hubo cambios). performed_by = actor real.
  IF v_affected > 0 THEN
    INSERT INTO public.user_audit_log (performed_by, target_user_id, action, new_values, metadata)
    VALUES (
      v_actor, p_user_id, 'MEMBERSHIPS_BULK_ASSIGNED',
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

REVOKE EXECUTE ON FUNCTION public.bulk_assign_memberships(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_assign_memberships(uuid, jsonb, uuid) TO service_role;

COMMENT ON FUNCTION public.bulk_assign_memberships(uuid, jsonb, uuid) IS
  'v2.17.0: bulk assign memberships with atomic audit log. Actor resolved with the create_sale_v2 doctrine (p_actor_id under service_role, auth.uid() otherwise). Per-store authorization of the ACTOR via has_store_role_as. Certified EXECUTE: service_role (API route).';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Restaurar la versión 20260805000016 (auth.uid()-only, firma 2 args):
--   DROP FUNCTION IF EXISTS public.bulk_assign_memberships(uuid, jsonb, uuid);
--   y recrear con el cuerpo de 20260805000016_v2_14_16_bulk_assign_memberships_audit.sql
--   + GRANT service_role (20260916000002).
