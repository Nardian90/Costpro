-- ============================================================================
-- CP-SEC-027 (seguimiento): las vistas públicas son de SOLO LECTURA
-- Migration: 20261019000002_cp_sec_027_vistas_solo_select.sql
--
-- Contexto: la migración 20261019000001_cp_sec_027_catalogo_publico.sql crea
-- las vistas public_catalog_v / public_storefronts_v / public_variants_v
-- (security_barrier, columnas de presentación sin costos) y concede SELECT a
-- anon. En Supabase, los ALTER DEFAULT PRIVILEGES del starter otorgan ALL
-- (INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) sobre objetos nuevos del
-- schema public a anon/authenticated. Como esas vistas son auto-actualizables
-- (is_updatable=YES) y su owner (postgres) tiene BYPASSRLS, la concesión
-- residual abría una vía de ESCRITURA que esquiva el RLS de
-- products/stores/product_variants: cualquiera con la clave publishable
-- podía PATCH/DELETE el catálogo público a través de la vista.
--
-- Hallazgo P0 detectado con sondeo read-only durante la ventana de ejecución
-- del 2026-10-19 y cerrado EN VIVO con este mismo REVOKE (ver
-- docs/audits/evidence/20261019-cp-sec-027-ejecucion/, en particular
-- raw/sondeo_escritura_vistas_readonly.json y raw/hardening_vistas_solo_select.json).
--
-- Este asiento hace el cierre durable para cualquier entorno desplegado desde
-- el stream de migraciones. anon y authenticated conservan SELECT (la
-- intención declarada de la Fase A: "conceder SELECT SOLO a anon";
-- authenticated puede leer las tablas por RLS de todos modos). service_role
-- no se toca: es el rol de servidor confiable y ningún consumidor legítimo
-- escribe a través de estas vistas.
--
-- Idempotente: REVOKE de privilegios ya revocados es un no-op seguro.
-- ============================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON public.public_catalog_v, public.public_storefronts_v, public.public_variants_v
    FROM anon, authenticated;
