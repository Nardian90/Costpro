-- ============================================================================
-- Migration: 20260809000001_v2_18_1_cash_closure_immutability.sql
-- Iteración 11.4 — Fix H-3
-- ============================================================================
-- Trigger que previene UPDATE o DELETE en cash_closures cuando status='cerrado'.
-- Excepción: variable de sesión app.bypass_closure_lock='true' (usada por
-- reopen_cash_shift RPC).
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_cash_closure_edit()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'cerrado' AND current_setting('app.bypass_closure_lock', true) <> 'true' THEN
    RAISE EXCEPTION 'ERR_CASH_CLOSURE_LOCKED: Cannot modify closed cash closure. Use reopen_cash_shift RPC.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prevent_cash_closure_edit ON public.cash_closures;
CREATE TRIGGER prevent_cash_closure_edit
  BEFORE UPDATE OR DELETE ON public.cash_closures
  FOR EACH ROW EXECUTE FUNCTION public.prevent_cash_closure_edit();

COMMENT ON FUNCTION public.prevent_cash_closure_edit() IS
  'Iteración 11.4 (H-3): Prevents modification of closed cash closures. Bypass via app.bypass_closure_lock session variable (used by reopen_cash_shift).';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS prevent_cash_closure_edit ON public.cash_closures;
-- DROP FUNCTION IF EXISTS public.prevent_cash_closure_edit();
-- ============================================================================
