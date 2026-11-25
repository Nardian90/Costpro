-- ============================================================================
-- CP-RECEPCIONES-CATALOGO-MAESTRO-001 (2026-11-25) — CIERRE DE CI DEL PR #1710
-- Retirada de la herramienta one-shot de renumeración (hallazgo del SQL
-- Security Gate, check 1 secdef_no_auth).
--
-- Contexto: cp_catmaestro001_renumber_auto_masters es una función
-- SECURITY DEFINER de UNA SOLA administración (fase 1) con ACL exclusiva
-- service_role, sin auth-check interno (por diseño: se invoca por Management
-- API/service_role, nunca por clientes). El gate la reporta:
--   ❌ secdef_no_auth: cp_catmaestro001_renumber_auto_masters(...)
--
-- Tras la renumeración de ENERVIDA completa (16 ítems de ENT-000005-2026 →
-- códigos 257..272 el 2026-11-25 ~13:35 UTC, y el «Cable para Ecoflow» de
-- ENT-000003-2026 → 273, misma sesión documentada en docs/audits), la
-- función NO tiene ningún uso futuro:
--   · El generador paralelo AUTO-*/OCR-* fue eliminado (fase 2) → no deben
--     existir nuevos SKU AUTO-*.
--   · Su firma contiene UUIDs hard-coded de producción (tenant/tienda/
--     recepción de la misión) → mantenerla es código muerto con defaults
--     sensibles.
--
-- Decisión (mejor postura de seguridad que una excepción en allowlist): se
-- RETIRA la función del estado vivo. La herramienta queda versionada en la
-- migración 20261125130000 (recreable con CREATE OR REPLACE si una futura
-- auditoría la necesitara) y su historial de aplicación vive en
-- master_change_log + audit_logs + docs/audits/.
--
-- Idempotente: DROP FUNCTION IF EXISTS; el guard verifica el estado final
-- y es fail-closed.
-- ============================================================================

DROP FUNCTION IF EXISTS public.cp_catmaestro001_renumber_auto_masters(
  boolean, uuid, uuid, uuid, uuid, jsonb);

-- ─────────────────────────────────────────────────────────────────────────
-- GUARD fail-closed post-migración: la herramienta one-shot ya no existe.
-- ─────────────────────────────────────────────────────────────────────────
DO $CP_CATMAESTRO001_DROP_GUARD$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cp_catmaestro001_renumber_auto_masters'
  ) THEN
    RAISE EXCEPTION 'CP-CATMAESTRO001-DROP-GUARD: la función one-shot sigue viva — DROP falló';
  END IF;
END
$CP_CATMAESTRO001_DROP_GUARD$;
