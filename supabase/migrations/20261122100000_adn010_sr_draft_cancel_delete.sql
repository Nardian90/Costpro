-- ============================================================================
-- ADN-010 · Servicios Recibidos: ELIMINACIÓN FÍSICA DE BORRADORES
-- ============================================================================
-- Misión integral (2026-11-22), §2.4: los borradores de Servicios Recibidos
-- necesitaban acciones de gestión. La cancelación (draft→cancelled) ya la
-- provee set_received_service_status (ADN-008 §5); faltaba la eliminación.
--
-- DECISIÓN DE DISEÑO (misión §2.4): eliminación FÍSICA por RPC transaccional,
-- no eliminación lógica:
--   · La tabla recibió el estado 'cancelled' por hotfix (20260809000013):
--     reutilizarlo como "eliminado" confundiría dos operaciones distintas y
--     dejaría registros muertos en todos los listados.
--   · Un borrador NO genera asientos contables (fin_trg_received_services
--     solo actúa en draft→active y →voided, 20261113120100 §triggers), por lo
--     que no hay integridad contable que preservar en la fila.
--   · La trazabilidad se conserva: la auditoría se escribe ANTES del DELETE en
--     audit_logs (tabla genérica, sin FK al documento) con snapshot jsonb de
--     la fila completa; service_audit_log.service_id es UUID sin FK y sus
--     filas también sobreviven al borrado del documento.
--   · Los vínculos subordinados (service_reception_links,
--     service_production_order_links) tienen ON DELETE CASCADE (20260625000001
--     y 20261010000002) — se eliminan solos, jamás tocan las recepciones ni
--     las órdenes de producción origen.
--
-- GUARDAS (misión §2.5):
--   · SOLO status='draft' (fail-closed: activos se anulan, nunca se borran).
--   · Aborta con error explícito si existen payment_transactions del servicio,
--     distribuciones de costo ya calculadas o asientos fin_entries (defensa
--     contable; en un borrador sano no debe existir ninguno).
--   · Autorización por el mismo patrón ADN-009: can_manage_store_as sobre la
--     tienda REAL del documento (clerk/warehouse/usuario NO gestionan).
--   · Advisory lock por documento: idempotencia ante doble clic/reintento.
--   · ACL idéntica a set_received_service_status: solo service_role (la API
--     revalida el usuario con canManageStore antes de invocar).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_received_service_draft(
  p_service_id uuid,
  p_user_id uuid DEFAULT NULL::uuid,
  p_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id uuid;
  v_status text;
  v_service_number text;
  v_supplier text;
  v_total numeric;
  v_currency text;
  v_snapshot jsonb;
  v_payments integer;
  v_distributions integer;
  v_posted integer;
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT store_id, status, service_number, supplier, total_amount, currency
  INTO v_store_id, v_status, v_service_number, v_supplier, v_total, v_currency
  FROM received_services WHERE id = p_service_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND'; END IF;

  -- Autorización del ACTOR sobre la tienda REAL del documento (patrón ADN-009).
  IF v_caller_uid IS NULL OR NOT public.can_manage_store_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Solo borradores: los documentos activos se ANULAN (con asiento de
  -- reversión), jamás se eliminan físicamente.
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'ERR_NOT_DRAFT: solo los documentos en Borrador pueden eliminarse (estado actual: %)', v_status;
  END IF;

  -- Dependencias incompatibles con el borrado físico.
  SELECT COUNT(*) INTO v_payments
    FROM payment_transactions
   WHERE ref_type = 'service' AND ref_id = p_service_id;
  IF v_payments > 0 THEN
    RAISE EXCEPTION 'ERR_HAS_PAYMENTS: el borrador tiene % pago(s) registrado(s); cáncelalo en su lugar', v_payments;
  END IF;

  SELECT COUNT(*) INTO v_distributions
    FROM service_cost_distributions
   WHERE service_id = p_service_id;
  IF v_distributions > 0 THEN
    RAISE EXCEPTION 'ERR_HAS_DISTRIBUTIONS: el borrador tiene distribuciones de costo calculadas; cáncelalo en su lugar';
  END IF;

  -- Defensa contable (en un borrador sano no existen asientos).
  SELECT COUNT(*) INTO v_posted
    FROM fin_entries
   WHERE document_type = 'SERVICIO_RECIBIDO' AND document_id = p_service_id;
  IF v_posted > 0 THEN
    RAISE EXCEPTION 'ERR_ALREADY_POSTED: el documento tiene asientos contables; anúlalo en su lugar';
  END IF;

  -- Trazabilidad PRIMERO (sobrevive al DELETE del documento).
  SELECT to_jsonb(rs.*) INTO v_snapshot
    FROM received_services rs WHERE rs.id = p_service_id;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'SERVICE_DRAFT_DELETED', 'received_services', p_service_id,
    jsonb_build_object(
      'service_number', v_service_number,
      'supplier', v_supplier,
      'total_amount', v_total,
      'currency', v_currency,
      'reason', p_reason,
      'snapshot', v_snapshot
    ));

  DELETE FROM received_services WHERE id = p_service_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'deleted', true,
    'service_number', v_service_number
  );
END;
$function$;

-- ACL idéntica a la vigente para set_received_service_status (patrón repo).
REVOKE EXECUTE ON FUNCTION public.delete_received_service_draft(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_received_service_draft(uuid, uuid, text) TO service_role;
