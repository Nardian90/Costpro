-- ============================================================================
-- Migration: 20260811000002_v2_20_2_rpc_trace_id.sql
-- Iteración 11.5 — Fix H-15 (trace_id propagation to audit_logs)
-- ============================================================================
-- Enfoque: en lugar de modificar 5 RPCs (riesgoso), usar una variable de
-- sesión `app.trace_id` que el API route setea antes de llamar al RPC,
-- y un trigger BEFORE INSERT en audit_logs que la lee y la inserta en
-- la columna trace_id.
--
-- Ventajas:
-- - No se modifica NINGÚN RPC existente (zero risk de break)
-- - Funciona para TODOS los audit_logs INSERTs (presentes y futuros)
-- - El API route solo necesita: SELECT set_config('app.trace_id', traceId, false)
--   antes de llamar al RPC
--
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- Trigger function que lee app.trace_id de la sesión y la inserta en audit_logs.trace_id
CREATE OR REPLACE FUNCTION public.set_audit_log_trace_id()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_trace_id text;
BEGIN
  v_trace_id := current_setting('app.trace_id', true);
  IF v_trace_id IS NOT NULL AND v_trace_id <> '' THEN
    NEW.trace_id := v_trace_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_audit_log_trace_id ON public.audit_logs;
CREATE TRIGGER trg_set_audit_log_trace_id
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_log_trace_id();

COMMENT ON FUNCTION public.set_audit_log_trace_id() IS
  'Iteración 11.5 (H-15): Reads app.trace_id session variable and sets it on audit_logs.trace_id. Set via SELECT set_config before RPC call.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_set_audit_log_trace_id ON public.audit_logs;
-- DROP FUNCTION IF EXISTS public.set_audit_log_trace_id();
-- ============================================================================
