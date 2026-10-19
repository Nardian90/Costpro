-- ===========================================================================
-- T-0 — LÍNEA BASE DE SOLO LECTURA — CP-SEC-027 (captura previa a la Fase A)
-- Proyecto: COSTPRO 4 Multitienda · BD viva: Supabase wthkddeleylijmonclxg
-- Fecha de la captura de referencia: 2026-10-19T11:07:28Z (ya archivada en
--   download/diagnostico-recuperacion-20261019/raw_estado_produccion_readonly.json
--   y docs/audits/evidence/20261019-cp-sec-027-publico/raw/ en main).
--
-- NATURALEZA: EXCLUSIVAMENTE SELECT (solo lectura). Cero escrituras, cero
-- DDL, cero DCL, cero NOTIFY. Ejecutar por el propietario (o por el agente
-- con autorización) ANTES de ejecutar la Fase A, dentro de la ventana
-- autorizada. Guardar la salida completa como evidencia T-0.
--
-- PARA QUÉ SIRVE:
--   1. Confirmar que el estado vivo sigue siendo el documentado hoy
--      (vistas inexistentes, 3 policies anon vivas, grants vivos).
--   2. Congelar los predicados EXACTOS de las policies vivas, que son la
--      materia prima del rollback de la Fase C (fase_c_rollback.sql).
--   3. Detectar cualquier deriva desde la captura de las 11:07Z antes de
--      tocar nada: si cualquier valor difiere de lo esperado, ABORTAR la
--      ventana y re-diagnosticar antes de ejecutar.
--
-- DÓNDE EJECUTAR: SQL editor de Supabase (dashboard) o Management API
--   (POST /v1/projects/wthkddeleylijmonclxg/database/query con token de
--   acceso). El script oficial diag_estado_produccion_costpro.js produce
--   un JSON equivalente y automatizado con las mismas verificaciones.
-- ===========================================================================

-- 1. POLICIES VIVAS SOBRE LAS 3 TABLAS DE LA SUPERFICIE PÚBLICA
--    ESPERADO HOY (T-0): exactamente 3 filas —
--    products.products_public_read_anon            [anon]            qual: (is_active = true) AND (visible_en_tienda = true)
--    stores.stores_select_anon                    [anon]            qual: is_active = true
--    product_variants.Variantes públicas - lectura [anon,authenticated] qual: EXISTS(... visible_en_tienda = true)
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('products', 'stores', 'product_variants')
ORDER BY tablename, policyname;

-- 2. PRIVILEGIOS SELECT VIGENTES SOBRE LAS 3 TABLAS
--    ESPERADO HOY (T-0): anon tiene SELECT en products, stores y
--    product_variants (3 filas para grantee='anon'), y cero filas para
--    grantee='anon' con table_name LIKE 'public_%_v'.
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND table_name IN ('products', 'stores', 'product_variants',
                     'public_catalog_v', 'public_storefronts_v', 'public_variants_v')
ORDER BY grantee, table_name, privilege_type;

-- 3. EXISTENCIA DE LAS VISTAS PÚBLICAS
--    ESPERADO HOY (T-0): CERO filas (las vistas no existen hasta la Fase A).
SELECT view_schema, view_name
FROM information_schema.views
WHERE view_schema = 'public'
  AND view_name IN ('public_catalog_v', 'public_storefronts_v', 'public_variants_v');

-- 4. RLS HABILITADO EN LAS TABLAS DE LA SUPERFICIE PÚBLICA
--    ESPERADO HOY (T-0): relrowsecurity = true en las 3 (así debe seguir).
SELECT c.relname, c.relrowsecurity AS rls_activo, c.relforcerowsecurity AS rls_forzado
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN ('products', 'stores', 'product_variants')
ORDER BY c.relname;

-- 5. REGISTRO DE MIGRACIONES (últimos asientos)
--    ESPERADO HOY (T-0): NINGUNA de las dos migraciones de hoy figura;
--    el último asiento sigue siendo 20260615000003 (junio de 2026).
SELECT version
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 12;

-- 6. CONTEO DE LA EXPOSICIÓN ACTUAL (sin imprimir valores de costos)
--    ESPERADO HOY (T-0): 103 filas públicas, 103 con cost_average <> 0;
--    10 tiendas activas. (Conteos, jamás valores sensibles.)
SELECT
  (SELECT count(*) FROM public.products WHERE is_active = true AND visible_en_tienda = true) AS productos_publicos,
  (SELECT count(*) FROM public.products WHERE is_active = true AND visible_en_tienda = true AND cost_average IS NOT NULL AND cost_average <> 0) AS con_costo_real,
  (SELECT count(*) FROM public.stores WHERE is_active = true) AS tiendas_activas;

-- 7. FRENTE EMPÍRICO (fuera de este SQL): re-ejecutar con la clave
--    publishable el script oficial de 18 checks:
--      SUPABASE_ANON_KEY=<publishable> SUPABASE_ACCESS_TOKEN=<token> \
--        node scripts/cpsec027_post_migration_verify.js
--    ESPERADO HOY (T-0): 18/18 FALLOS (exactamente el estado pre-fix
--    documentado en docs/audits/evidence/20261019-cp-sec-027-publico/raw/
--    10_verificacion_pre_migracion.txt). Un resultado distinto de 18/18
--    en el T-0 significa que la BD cambió desde las 11:07Z: ABORTAR y
--    re-diagnosticar.
