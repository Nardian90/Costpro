-- V2.10.1 — FIX CRÍTICO: permitir draft → in_progress en production_orders
--
-- BUG ENCONTRADO EN PRUEBAS LIVE:
-- La UI (ProductionOrdersView.tsx:755-760) muestra un dropdown con TODOS los
-- estados (draft, approved, in_progress, paused, completed, closed) permitiendo
-- al usuario cambiar directamente de draft a in_progress. Pero el trigger V2.3
-- fn_validate_document_transition solo permite draft → approved → in_progress.
--
-- Esto causa ERR_INVALID_TRANSITION cuando el usuario intenta iniciar una
-- orden sin pasar por "Aprobar" primero.
--
-- SOLUCIÓN: añadir 'in_progress' a las transiciones válidas desde 'draft'.
-- Esto es razonable porque:
--   1. La UI lo permite
--   2. Para órdenes simples, exigir "approved" es burocracia innecesaria
--   3. El flujo approved → in_progress sigue siendo válido para quienes
--      quieran usarlo

CREATE OR REPLACE FUNCTION public.fn_validate_document_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status TEXT := OLD.status::TEXT;
  v_new_status TEXT := NEW.status::TEXT;
  v_table_name TEXT := TG_ARGV[0];
  v_valid_transitions JSONB;
BEGIN
  IF v_old_status = v_new_status THEN
    RETURN NEW;
  END IF;

  v_valid_transitions := jsonb_build_object(
    'transactions', jsonb_build_object(
      'pending',     '["completed","voided","cancelled"]'::jsonb,
      'completed',   '["reversed","voided"]'::jsonb,
      'reversed',    '[]'::jsonb,
      'voided',      '[]'::jsonb,
      'failed',      '["pending","cancelled"]'::jsonb,
      'cancelled',   '[]'::jsonb,
      'compensated', '["completed","voided"]'::jsonb,
      'refunded',    '["reversed"]'::jsonb
    ),
    'receipts', jsonb_build_object(
      'pending',   '["confirmed","active","voided"]'::jsonb,
      'confirmed', '["active","reversed","voided"]'::jsonb,
      'active',    '["reversed","voided"]'::jsonb,
      'partial',   '["active","confirmed","reversed","voided"]'::jsonb,
      'reversed',  '[]'::jsonb,
      'voided',    '[]'::jsonb
    ),
    'transfers', jsonb_build_object(
      'PENDIENTE',  '["CONFIRMADA","CANCELADA"]'::jsonb,
      'CONFIRMADA', '["REVERSADA"]'::jsonb,
      'CANCELADA',  '[]'::jsonb,
      'REVERSADA',  '[]'::jsonb
    ),
    'devolutions', jsonb_build_object(
      'pending',   '["completed","voided"]'::jsonb,
      'completed', '["reversed","voided"]'::jsonb,
      'voided',    '[]'::jsonb,
      'reversed',  '[]'::jsonb
    ),
    'inventory_adjustments', jsonb_build_object(
      'pending',   '["confirmed","reversed"]'::jsonb,
      'confirmed', '["reversed"]'::jsonb,
      'reversed',  '[]'::jsonb
    ),
    'production_orders', jsonb_build_object(
      -- V2.10.1 FIX: draft puede ir directamente a in_progress (saltar approved)
      'draft',       '["approved","in_progress","voided"]'::jsonb,
      'approved',    '["in_progress","voided"]'::jsonb,
      'in_progress', '["paused","completed","voided","reversed"]'::jsonb,
      'paused',      '["in_progress","voided","reversed"]'::jsonb,
      'completed',   '["closed","reversed"]'::jsonb,
      'closed',      '["reversed"]'::jsonb,
      'voided',      '[]'::jsonb,
      'reversed',    '[]'::jsonb
    )
  );

  IF NOT (
    v_valid_transitions->v_table_name ? v_old_status
    AND (v_valid_transitions->v_table_name->v_old_status) ? v_new_status
  ) THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: % no puede pasar de % a %',
      v_table_name, v_old_status, v_new_status;
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_validate_document_transition() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validate_document_transition() TO service_role;

NOTIFY pgrst, 'reload schema';
