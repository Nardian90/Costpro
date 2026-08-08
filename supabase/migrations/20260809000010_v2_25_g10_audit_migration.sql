-- ══════════════════════════════════════════════════════════════════════
-- F-30 G10 — Audit migration: service_audit_log → audit_logs global
-- Resuelve: Iter 10 (6C+7A)
-- Los nuevos RPCs (G5-G9) escriben exclusivamente a audit_logs global.
-- service_audit_log se depreca (tabla conservada por compatibilidad).
-- ══════════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.service_audit_log IS
  'DEPRECATED v2.25.0: nuevos entries van a audit_logs global. Esta tabla se conserva por compatibilidad retroactiva. No escribir nuevos entries aqui.';

-- Action naming convention (UPPERCASE, consistente con F-02/F-20):
--   SERVICE_CREATED         — create_received_service_v2 (G5)
--   SERVICE_VOIDED          — void_received_service_with_reversal (G6)
--   SERVICE_STATUS_CHANGED  — set_received_service_status (G7)
--   SERVICE_DISTRIBUTED     — distribute_service_cost_v2 (G8)
--   SERVICE_LINKED          — link_receipts_to_service (G9)
