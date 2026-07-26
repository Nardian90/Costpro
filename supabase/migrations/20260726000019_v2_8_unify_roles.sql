-- ════════════════════════════════════════════════════════════════════════
-- V2.8 — Unificación profiles.role vs role_id (deuda técnica)
--
-- PROBLEMA (auditoría):
-- profiles tiene 2 columnas paralelas para el rol global:
--   - role (enum user_role: admin, encargado, manager, usuario, warehouse, ...)
--   - role_id (FK a tabla roles con names: Admin, Encargado, Cajero, Almacenero, costo)
-- Coexisten sin sincronización — algunos perfiles tienen role='admin' con
-- role_id apuntando a 'costo', causando bugs de autorización.
--
-- SOLUCIÓN:
-- 1. Sincronizar role_id → role (dar prioridad a role_id, fuente de verdad)
-- 2. Crear trigger que mantenga role_id sincronizado cuando se actualiza role
-- 3. Crear vista v_profiles_unified con rol canónico
-- 4. Marcar role_id como preferido en comentarios (role queda como derivado)
-- ════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Mapa name→enum: tabla roles usa 'Admin', 'Encargado', etc.
--    profiles.role enum usa 'admin', 'encargado', etc.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.role_name_to_enum(p_role_name text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN LOWER(p_role_name) = 'admin' THEN 'admin'
    WHEN LOWER(p_role_name) = 'encargado' THEN 'encargado'
    WHEN LOWER(p_role_name) = 'cajero' THEN 'clerk'
    WHEN LOWER(p_role_name) = 'almacenero' THEN 'warehouse'
    WHEN LOWER(p_role_name) = 'costo' THEN 'costo'
    WHEN LOWER(p_role_name) = 'manager' THEN 'manager'
    WHEN LOWER(p_role_name) = 'usuario' THEN 'usuario'
    ELSE 'usuario'  -- default seguro
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.role_name_to_enum(text) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Sincronizar: donde role_id existe y role no coincide, actualizar role
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.profiles p
SET role = public.role_name_to_enum(r.name)::user_role
FROM public.roles r
WHERE p.role_id = r.id
  AND (p.role IS NULL OR p.role::text != public.role_name_to_enum(r.name));

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Trigger: mantener role sincronizado cuando se actualiza role_id
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sync_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role_enum text;
BEGIN
  -- Si role_id cambió, derivar role desde role_id
  IF NEW.role_id IS NOT NULL AND NEW.role_id IS DISTINCT FROM OLD.role_id THEN
    SELECT public.role_name_to_enum(r.name) INTO v_role_enum
    FROM public.roles r WHERE r.id = NEW.role_id;
    NEW.role := v_role_enum::user_role;
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_sync_profile_role() TO authenticated;

DROP TRIGGER IF EXISTS trg_sync_profile_role ON public.profiles;
CREATE TRIGGER trg_sync_profile_role
  BEFORE INSERT OR UPDATE OF role_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_profile_role();

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Vista v_profiles_unified — fuente canónica para lectura
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_profiles_unified AS
SELECT
  p.id,
  p.email,
  p.full_name,
  p.role_id,
  r.name AS role_name,
  p.role AS role_enum,
  p.active_store_id,
  p.store_id,
  p.is_active,
  p.logo_url,
  p.created_at,
  p.updated_at
FROM public.profiles p
LEFT JOIN public.roles r ON r.id = p.role_id;

COMMENT ON VIEW public.v_profiles_unified IS
'V2.8: Vista canónica de perfiles. role_enum siempre derivado de role_id via trigger.';

GRANT SELECT ON public.v_profiles_unified TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. Comentarios
-- ──────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.profiles.role_id IS 'V2.8: fuente de verdad para el rol global. Sincroniza profiles.role automáticamente.';
COMMENT ON COLUMN public.profiles.role IS 'V2.8: derivado de role_id via trigger trg_sync_profile_role. No editar directamente.';

NOTIFY pgrst, 'reload schema';
