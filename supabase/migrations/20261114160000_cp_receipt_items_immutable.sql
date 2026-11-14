-- ============================================================================
-- CP-RECEIPT-INTEGRITY-001 (2026-11-14)
-- Inmutabilidad económica de receipt_items tras confirmar la recepción.
--
-- Contexto forense (FAC-VITALLCONS-001 / fd9d6c88):
--   * RLS ya niega UPDATE/DELETE de receipt_items a `authenticated`
--     (20260807000014_v2_23_0_receipts_hardening), PERO service_role y las
--     rutas API que lo usan (PATCH .../items/[itemId], backfill-tasas)
--     bypaseaban RLS y mutaban líneas de recepciones ACTIVE/VOIDED/REVERSED
--     sin recalcular receipts.total_cost ni WAC/kardex/CP-FIN → divergencia
--     económica de 3 vías (demostrada: edición 2026-11-14T12:15:56Z sobre la
--     recepción 'active' fd9d6c88).
--   * Este trigger convierte la regla de diseño en invariante de BD:
--     una recepción definitivamente confirmada no acepta cambios silenciosos
--     en sus datos económicos (modificación UPDATE).
--
-- ALCANCE (decisión de diseño, v2 del hallazgo de la propia corrida E2E):
--   * GUARD sobre UPDATE únicamente (columns económicas o no: toda mutación
--     de una línea confirmada es sospechosa; el no-op de `updated_at` también
--     se bloquea — un documento terminado no se toca).
--   * El DELETE NO se bloquea a nivel de fila: el borrado del DOCUMENTO
--     completo es una operación gobernada en la capa de receipts (transiciones
--     validadas por trg_validate_receipt_transition, delete_pending_reception,
--     hard-delete con session_replication_role) y los DELETE en cascada de
--     la FK (receipt_id ON DELETE CASCADE) dispararían el guard de fila en
--     cada hijo y romperían la cadena (defecto reproducido en la corrida
--     E2E aislada: los cleanups REST de items activos quedaban atascados).
--     RLS (receipt_items_delete_denied) sigue negando el DELETE a usuarios
--     autenticados; el borrado por service_role queda en la capa gobernada.
--
-- Procedimiento autorizado para correcciones de historia confirmada:
--   SET LOCAL app.allow_receipt_item_edit = 'on'  -- corrección gobernada
-- La sesión que lo active debe registrar el motivo/valores en auditoría
-- (patrón GATE16/wac_correction del expediente de la misión). Las vías
-- de negocio preferidas siguen siendo: reversión/anulación controlada
-- (reverse_receipt_v2 / void_pending_reception) + recepción correctiva.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_fn_receipt_items_economic_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_receipt_id uuid;
  v_status text;
  v_authorized boolean;
BEGIN
  -- Guard SOLO para UPDATE (ver nota de alcance arriba).
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW; -- teóricamente inalcanzable con el trigger actual
  END IF;

  -- Escape hatch explícito para correcciones gobernadas y trazadas.
  -- (current_setting con missing_ok para no fallar cuando no está definido)
  v_authorized := coalesce(current_setting('app.allow_receipt_item_edit', true), 'off') = 'on';

  v_receipt_id := NEW.receipt_id;

  IF v_receipt_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.status INTO v_status
  FROM public.receipts r
  WHERE r.id = v_receipt_id;

  -- Padre ya eliminado (defensa ante orfandad): no bloquear.
  IF v_status IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_status <> 'pending' AND NOT v_authorized THEN
    RAISE EXCEPTION 'ERR_RECEIPT_ITEM_IMMUTABLE: la recepción % está "%" — los datos económicos de sus líneas son inmutables. Procedimiento autorizado: reversión/anulación controlada + recepción correctiva, o corrección gobernada con SET LOCAL app.allow_receipt_item_edit = ''on''.', v_receipt_id, v_status;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_receipt_items_economic_immutable ON public.receipt_items;

CREATE TRIGGER trg_receipt_items_economic_immutable
  BEFORE UPDATE ON public.receipt_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_receipt_items_economic_immutable();

-- Nota de compatibilidad verificada con los flujos canónicos vigentes:
--   * register_reception: INSERT de líneas (no UPDATE) → no afectado.
--   * update_receipt_item_tasa / update_reception_items: exigen status='pending'
--     → compatible.
--   * confirm_pending_reception: actualiza receipts, no receipt_items → compatible.
--   * delete_pending_reception: borra receipts 'pending' (sus items via CASCADE,
--     DELETE sin guard) → compatible.
--   * reverse_receipt_v2: no muta receipt_items → compatible.
--   * Limpieza/hard-delete de tiendas E2E: borran receipts→items por CASCADE
--     (DELETE sin guard) → compatible (fue el defecto de la v1 del trigger,
--     corregido en esta v2).
--   * Backfills históricos masivos (estilo PR-2): deben usar el escape hatch
--     documentado — exactamente el procedimiento autorizado que exige la misión.
