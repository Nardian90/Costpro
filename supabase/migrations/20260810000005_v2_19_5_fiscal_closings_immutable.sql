-- ============================================================================
-- Migration: 20260810000005_v2_19_5_fiscal_closings_immutable.sql
-- Iteración Fiscal — Fix F-H2
-- ============================================================================
-- Trigger que previene UPDATE o DELETE en fiscal_closings cuando status='locked'.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_fiscal_closing_edit()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'locked' AND current_setting('app.bypass_fiscal_lock', true) <> 'true' THEN
    RAISE EXCEPTION 'ERR_FISCAL_CLOSING_LOCKED: Cannot modify locked fiscal closing.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prevent_fiscal_closing_edit ON public.fiscal_closings;
CREATE TRIGGER prevent_fiscal_closing_edit
  BEFORE UPDATE OR DELETE ON public.fiscal_closings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_fiscal_closing_edit();

COMMENT ON FUNCTION public.prevent_fiscal_closing_edit() IS
  'Iteración Fiscal (F-H2): Prevents modification of locked fiscal closings. Bypass via app.bypass_fiscal_lock.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS prevent_fiscal_closing_edit ON public.fiscal_closings;
-- DROP FUNCTION IF EXISTS public.prevent_fiscal_closing_edit();
-- ============================================================================
