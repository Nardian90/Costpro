-- ============================================================================
-- REVERSION DE LA FASE A - CP-SEC-027 (devuelve la BD al estado pre-Fase A)
--
-- Origen VERBATIM: supabase/migrations/20261019000001_cp_sec_027_catalogo_publico.sql (main 98e0d31e, PR #1424, fusionado 2026-10-19T10:51:49Z)
-- Extraccion mecanica de lineas exactas del archivo fusionado; cero SQL
-- reescrito ni alternativo. La division en fases es la que recomienda el
-- propio encabezado de la migracion (despliegue en tres fases, ventana
-- corta, cero interrupcion).
--
-- Solo aplicable si la Fase B no esta desplegada (o tras revertir B):
-- el codigo fusionado consulta estas vistas, por lo que con B desplegada
-- este rollback rompe la vitrina y la API. Verbatim del bloque
-- PROCEDIMIENTO DE REVERSION de la propia migracion. Idempotente.
-- Riesgo: ninguno sobre datos (DDL puro); vuelve al estado pre-A exacto.
-- NO EJECUTAR sin autorizacion expresa del propietario.
-- ============================================================================

REVOKE SELECT ON public.public_catalog_v FROM anon;
REVOKE SELECT ON public.public_storefronts_v FROM anon;
REVOKE SELECT ON public.public_variants_v FROM anon;
DROP VIEW IF EXISTS public.public_variants_v;
DROP VIEW IF EXISTS public.public_storefronts_v;
DROP VIEW IF EXISTS public.public_catalog_v;
