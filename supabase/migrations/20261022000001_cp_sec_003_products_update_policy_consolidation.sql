-- ═══════════════════════════════════════════════════════════════════════════
-- CP-SEC-003 — Consolidación de policies de UPDATE en public.products
-- Misión Continua de Resolución del Inventario · 2026-10-22
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA (audit_v3 §2.5, confirmado por censo de la Misión Continua):
--   PostgreSQL OR-ea todas las policies permissive del mismo comando. En
--   products convivían DOS policies de UPDATE:
--     · products_update_rls (20260619000006, v2.19): USING = membresía
--       activa en la tienda del producto — SIN check de tenant, y es la
--       que gana el OR (la más débil anula a la estricta).
--     · products_tenant_update (20260827000005, F3-P0): tenant_id =
--       current_user_tenant_id() AND (is_admin() OR store ∈
--       current_user_store_ids()) — la policy estricta de aislamiento.
--   Resultado: cualquier usuario con membresía de tienda podía actualizar
--   filas SIN verificación de tenant (incluidas filas legacy con
--   tenant_id NULL), anulando el endurecimiento F3-P0.
--
--   Las antiguas *_store_access y deny_client_writes YA fueron eliminadas
--   (20260527094858 y 20260807000012_v2_21_5_rls_drop_old_policies); esta
--   migración completa la consolidación eliminando la última supersa viva.
--
-- PRE-CONDICIÓN (verificada por el guard fail-closed de abajo, que ABORTA
-- la aplicación si no se cumple):
--   0 filas de public.products con tenant_id IS NULL. Si existen, requieren
--   backfill autorizado por el propietario ANTES de esta consolidación
--   (de lo contrario, esas filas quedarían sin ruta de UPDATE para clientes).
--   Query de verificación manual previa (solo lectura):
--     SELECT count(*) FROM public.products WHERE tenant_id IS NULL;
--
-- DESPUÉS de aplicar: products_tenant_update queda como ÚNICA policy
-- permissive de UPDATE en products. SELECT queda en products_select_rls +
-- products_public_read_anon (catálogo público SELECT-only, CP-SEC-027
-- certificado en #1424/#1426). INSERT: products_tenant_insert. DELETE:
-- products_delete_rls (membresía de tienda — coherente; sin gemela estricta;
-- los hard-deletes operativos van por RPC service-role de higiene E2E).
--
-- REVERSIBILIDAD: recrear la policy eliminada con el texto exacto de
-- 20260619000006_rls_policies_versioned.sql (USING por membresía activa).
-- El DROP es la única sentencia destructiva de este archivo.
-- ═══════════════════════════════════════════════════════════════════════════

DO $cp_sec_003_guard$
DECLARE
    v_null_tenant bigint;
BEGIN
    SELECT count(*) INTO v_null_tenant
    FROM public.products
    WHERE tenant_id IS NULL;

    IF v_null_tenant > 0 THEN
        RAISE EXCEPTION
            'CP-SEC-003 PRE-CONDICIÓN NO CUMPLIDA: existen % producto(s) con tenant_id NULL. Requieren backfill autorizado por el propietario antes de consolidar las policies de UPDATE (de lo contrario quedarían sin ruta de actualización para clientes). Ejecutar primero el backfill y reintentar.',
            v_null_tenant
            USING HINT = 'SELECT count(*) FROM public.products WHERE tenant_id IS NULL; — debe retornar 0';
    END IF;
END
$cp_sec_003_guard$;

-- Consolidación: la policy débil de membresía queda supersada por la
-- estricta de tenant (misma población objetivo + verificación de tenant).
DROP POLICY IF EXISTS "products_update_rls" ON public.products;
