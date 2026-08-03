-- ============================================================================
-- Migration: 20260803000009_v2_13_9_transfer_status_reversada.sql
-- Iteración 11.1 — Fix M-16
-- ============================================================================
-- PROBLEMA: El enum transfer_status se creó con 3 valores:
--   ('PENDIENTE', 'CONFIRMADA', 'CANCELADA')
-- Pero reverse_transfer hace UPDATE status = 'REVERSADA', lo que falla con
-- "invalid input value for enum" a menos que se haya hecho ALTER TYPE
-- out-of-band.
--
-- SOLUCIÓN: ALTER TYPE transfer_status ADD VALUE IF NOT EXISTS 'REVERSADA'.
--
-- NOTA: ADD VALUE no puede ejecutarse dentro de una transacción en PG < 12.
-- En PG 12+ (Supabase default), ADD VALUE IF NOT EXISTS es safe.
--
-- UP:
--   ALTER TYPE ADD VALUE.
--
-- DOWN:
--   No se puede REMOVE VALUE de un enum en Postgres. Para rollback, dejar
--   el valor sin usar (no causa problemas funcionales).
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

ALTER TYPE public.transfer_status ADD VALUE IF NOT EXISTS 'REVERSADA';

COMMENT ON TYPE public.transfer_status IS
  'Iteración 11.1 (M-16): Added REVERSADA value for reverse_transfer RPC. Values: PENDIENTE, CONFIRMADA, CANCELADA, REVERSADA.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Postgres no soporta REMOVE VALUE de enums. El valor 'REVERSADA' puede
-- quedarse sin usar sin impacto funcional. Para un rollback completo, se
-- requeriría recrear el tipo (DROP TYPE + CREATE TYPE + re-CREATE TABLE),
-- lo cual es destructivo y no se recomienda.
-- ============================================================================
