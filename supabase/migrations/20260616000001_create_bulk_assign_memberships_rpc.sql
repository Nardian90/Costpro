-- Migration: bulk_assign_memberships RPC transaccional
-- F4-T02 deuda: reemplaza Promise.allSettled (mejor esfuerzo) por una operación
-- atómica que hace upsert por cada asignación.
--
-- IMPORTANTE: La validación de permisos (admin/manager) se hace en la ruta HTTP
-- /api/users/[id]/memberships/bulk ANTES de invocar este RPC. El RPC confía en
-- que el caller ya está validado (SECURITY DEFINER + service_role).
--
-- Firma: bulk_assign_memberships(p_user_id UUID, p_assignments JSONB)
-- p_assignments: [{ store_id, role, status }, ...]
--
-- Retorna: { affected INT, failed INT }
-- Fallas individuales (FK violation) se cuentan como failed pero no rompen la transacción.

CREATE OR REPLACE FUNCTION public.bulk_assign_memberships(
  p_user_id UUID,
  p_assignments JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assignment JSONB;
  v_affected INT := 0;
  v_failed INT := 0;
  v_store_id UUID;
  v_role TEXT;
  v_status TEXT;
BEGIN
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_assignments)
  LOOP
    v_store_id := v_assignment->>'store_id';
    v_role := v_assignment->>'role';
    v_status := COALESCE(v_assignment->>'status', 'active');

    BEGIN
      -- Upsert atómico: si ya existe la membership (user_id, store_id), actualiza;
      -- si no, inserta. ON CONFLICT requiere constraint unique en (user_id, store_id).
      INSERT INTO public.user_store_memberships (user_id, store_id, role, status, created_at, updated_at)
      VALUES (p_user_id, v_store_id, v_role, v_status, now(), now())
      ON CONFLICT (user_id, store_id)
      DO UPDATE SET
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = now();

      v_affected := v_affected + 1;
    EXCEPTION WHEN foreign_key_violation THEN
      -- store_id o user_id no existen — contar como failed y continuar
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('affected', v_affected, 'failed', v_failed);
END;
$$;

-- Permisos: authenticated (vía ruta HTTP que valida admin/manager) + service_role (bypass RLS)
REVOKE ALL ON FUNCTION public.bulk_assign_memberships(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_assign_memberships(UUID, JSONB) TO authenticated, service_role;

-- Comentario documentacional
COMMENT ON FUNCTION public.bulk_assign_memberships(UUID, JSONB) IS
  'F4-T02: Asigna un usuario a múltiples tiendas en una operación atómica. Cada asignación hace upsert (ON CONFLICT user_id,store_id). Fallas individuales (FK) se cuentan como failed pero no rompen la transacción. La validación de admin/manager se hace en la ruta HTTP antes de invocar este RPC.';
