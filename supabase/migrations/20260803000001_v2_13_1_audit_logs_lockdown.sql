-- ============================================================================
-- Migration: 20260803000001_v2_13_1_audit_logs_lockdown.sql
-- Iteración 11.1 — Fix C-5
-- ============================================================================
-- PROBLEMA: La policy `audit_logs_insert_authenticated` permitía a cualquier
-- usuario autenticado INSERTar entradas falsas en audit_logs con
-- WITH CHECK (true), sin validar user_id = auth.uid(). Esto permitía
-- falsificación de auditoría atribuyendo acciones a otros usuarios.
--
-- SOLUCIÓN:
--   1. DROP la policy abierta WITH CHECK (true).
--   2. CREATE nueva policy que solo permite INSERT si user_id = auth.uid().
--   3. service_role bypassa RLS por defecto (no necesita policy) — puede
--      INSERTar cualquier fila (necesario para RPCs SECURITY DEFINER que
--      loguean acciones realizadas por el sistema o en nombre de otros users).
--
-- IMPACTO:
--   - auditService.* (client-side) usa getAdminClientSync() (service_role) →
--     no afectado.
--   - Si getAdminClientSync() retorna null (service role key no configurada),
--     auditService cae al cliente anónimo → solo puede loguear con
--     user_id = auth.uid() (comportamiento correcto).
--   - RPCs SECURITY DEFINER (create_sale, void_transaction, etc.) usan
--     auth.uid() internamente o service_role → no afectados.
--
-- UP:
--   DROP + CREATE policy restrictiva.
--
-- DOWN:
--   Restaurar policy abierta original (WITH CHECK (true)).
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- Eliminar la policy abierta que permitía INSERT con cualquier user_id
DROP POLICY IF EXISTS "audit_logs_insert_authenticated" ON public.audit_logs;

-- Nueva policy: authenticated solo puede INSERT si user_id = auth.uid()
-- Esto previene falsificación de auditoría (atribuir acciones a otros usuarios).
-- service_role bypassa RLS y puede INSERTar cualquier fila.
CREATE POLICY "audit_logs_insert_authenticated" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

COMMENT ON POLICY "audit_logs_insert_authenticated" ON public.audit_logs IS
  'Iteración 11.1 (C-5): Authenticated users can only INSERT audit logs where user_id = auth.uid(). service_role bypasses RLS for system-level logging.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Para revertir esta migración, ejecutar:
--
-- DROP POLICY IF EXISTS "audit_logs_insert_authenticated" ON public.audit_logs;
-- CREATE POLICY "audit_logs_insert_authenticated" ON public.audit_logs
--   FOR INSERT TO authenticated
--   WITH CHECK (true);
-- ============================================================================
