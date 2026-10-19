-- =====================================================================
-- 20261020000005_legal_incidents_index.sql — Decisión D ratificada (2026-10-20)
-- Índice PARCIAL que sostiene el GET admin-only de /api/legal/incidents,
-- que lee el legajo desde audit_logs WHERE action='legal_incident'
-- (paginación created_at DESC). Índice mínimo: no indexa el resto del
-- voluminoso audit_logs (índice parcial, ~0 filas hoy).
-- Idempotente (IF NOT EXISTS).
-- =====================================================================
BEGIN;

CREATE INDEX IF NOT EXISTS idx_audit_logs_legal_incident_created_at
  ON public.audit_logs (created_at DESC)
  WHERE action = 'legal_incident';

COMMIT;
