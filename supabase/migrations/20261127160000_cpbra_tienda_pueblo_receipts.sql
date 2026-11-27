-- ============================================================================
-- Migration: 20261127160000_cpbra_tienda_pueblo_receipts.sql
-- Misión:    CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 — FASE 4 (§0.3 / §6)
-- Fecha:     2026-11-27
-- ============================================================================
-- DECISIÓN DEL PROPIETARIO (misión §0.3, vinculante): LAS TRES RECEPCIONES
--   HISTÓRICAS SIN PROVEEDOR (importe agregado 19,435) PERTENECEN AL
--   PROVEEDOR TIENDA PUEBLO. La confirmación del propietario es la fuente de
--   identificación (fuente registrada: OWNER_CONFIRMATION). NO se inventa
--   factura, NIT, teléfono, dirección ni documento externo alguno.
--
-- OPERACIÓN GOBERNADA (misma mecánica que SR_SUPPLIER_NORMALIZED,
--   20261126120100): corrección de la VINCULACIÓN HISTÓRICA — ÚNICAMENTE el
--   campo textual de proveedor de las 3 recepciones; intactos identificadores,
--   fechas, cantidades, importes, moneda, kardex, movimientos, referencias
--   históricas, estados y pagos. Sin borrado, sin recreación, sin pagos,
--   sin movimientos financieros adicionales, sin backfill.
--
-- GUARDS FAIL-CLOSED (§6.7 — detención automática):
--   G0  la lista CERRADA de 3 IDs existe íntegra y comparte UNA tienda.
--   G1  precondiciones por ID: status=active, total_cost EXACTO,
--       reference_doc EXACTO; el campo proveedor está o en '—' (pendiente)
--       o en 'Tienda Pueblo' (ya corregido). Estado PARCIAL (1-2 de 3) →
--       DETENCIÓN AUTOMÁTICA (no reprocesar a ciegas).
--   G2  cero pagos sobre las 3 recepciones.
--   G3  proveedor canónico «Tienda Pueblo» ÚNICO (nombre normalizado) y
--       activo en la tienda de las recepciones; sin candidato → no se inventa
--       alta; múltiples candidatos → no asociación arbitraria.
--   VERIFY  la corrección afecta EXACTAMENTE 3 filas (transacción atómica:
--       cualquier desviación → rollback completo).
--
-- REVERSIBILIDAD: UPDATE inverso documentado (rollback_hint en cada registro
--   de auditoría y en el expediente TIENDA-PUEBLO-REGULARIZATION.md).
-- Idempotente: en replays (BD aislada E2E) las recepciones no existen → G0
--   detiene; en producción re-aplicada → no-op con NOTICE (G1 rama ya-corregida).
-- ============================================================================

-- ─── UP ─────────────────────────────────────────────────────────────────────
BEGIN;

DO $tp_guard$
DECLARE
  v_cnt integer;
  v_rows integer;
  v_store uuid;
  v_canon_id uuid;
  v_canon_name text;
  v_r record;
  v_ids uuid[] := ARRAY[
    '0b026405-d090-46cc-9d68-60ff7cca3783',
    '79ffb3a9-9aa5-4258-b845-78049e06d814',
    'e564adca-c9b9-479b-bdbe-146033712085'
  ];
  v_totals numeric[] := ARRAY[19200.00, 35.00, 200.00];
  v_refs text[] := ARRAY['—', '0000', '0002'];
  v_i integer;
BEGIN
  -- G0: lista cerrada — tres estados válidos:
  --   (a) 0 de 3 existen → entorno SIN la excepción (replay aislado E2E,
  --       despliegue fresco) → no-op idempotente con NOTICE;
  --   (b) 3 de 3, íntegras y compartiendo UNA tienda → procede;
  --   (c) 1-2 de 3 → DETENCIÓN AUTOMÁTICA (lista cerrada corrupta).
  SELECT count(*) INTO v_cnt FROM public.receipts WHERE id = ANY(v_ids);
  IF v_cnt = 0 THEN
    RAISE NOTICE 'TP-APPLY: la excepción histórica no existe en este entorno (replay/despliegue fresco) — no-op idempotente.';
    RETURN;
  END IF;
  IF v_cnt <> 3 THEN
    RAISE EXCEPTION 'TP-GUARD-G0: la lista cerrada tiene % de 3 recepciones — abortando (estado inesperado)', v_cnt;
  END IF;
  IF (SELECT count(DISTINCT store_id) FROM public.receipts WHERE id = ANY(v_ids)) <> 1 THEN
    RAISE EXCEPTION 'TP-GUARD-G0b: las recepciones no comparten una única tienda';
  END IF;
  SELECT store_id INTO v_store FROM public.receipts WHERE id = ANY(v_ids) LIMIT 1;

  -- G1: precondiciones por ID (exactas) + estado del campo proveedor.
  v_cnt := 0;
  FOR v_i IN 1..3 LOOP
    SELECT status, total_cost, reference_doc, supplier INTO v_r
      FROM public.receipts WHERE id = v_ids[v_i];
    IF v_r.status <> 'active'
       OR v_r.total_cost <> v_totals[v_i]
       OR COALESCE(v_r.reference_doc, '') <> v_refs[v_i] THEN
      RAISE EXCEPTION 'TP-GUARD-G1: precondición alterada en % (status=%, total=%, ref=%) — abortando',
        v_ids[v_i], v_r.status, v_r.total_cost, v_r.reference_doc;
    END IF;
    IF btrim(COALESCE(v_r.supplier, '')) IN ('', '—') THEN
      v_cnt := v_cnt + 1;
    END IF;
  END LOOP;
  IF v_cnt NOT IN (0, 3) THEN
    RAISE EXCEPTION 'TP-GUARD-G1b: estado PARCIAL de corrección (% de 3) — abortando (no reprocesar a ciegas)', v_cnt;
  END IF;
  IF v_cnt = 0 THEN
    -- Ya corregidas (re-aplicación): verificar que quedaron bien y no-op.
    SELECT count(*) INTO v_cnt FROM public.receipts
     WHERE id = ANY(v_ids) AND supplier = 'Tienda Pueblo';
    IF v_cnt <> 3 THEN
      RAISE EXCEPTION 'TP-GUARD-G1c: sin pendientes pero el proveedor no quedó en «Tienda Pueblo» — abortando';
    END IF;
    RAISE NOTICE 'TP-APPLY: las 3 recepciones ya están vinculadas a «Tienda Pueblo» — no-op idempotente.';
    RETURN;
  END IF;

  -- G2: cero pagos sobre las 3 recepciones (§6.6: no se crean ni alteran pagos).
  SELECT count(*) INTO v_cnt FROM public.payment_transactions
   WHERE ref_type = 'receipt' AND ref_id = ANY(v_ids);
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'TP-GUARD-G2: hay % pago(s) sobre las recepciones de la lista — abortando', v_cnt;
  END IF;

  -- G3: proveedor canónico ÚNICO y activo en la tienda de las recepciones.
  SELECT count(*) INTO v_cnt FROM public.suppliers
   WHERE store_id = v_store AND is_active
     AND lower(regexp_replace(btrim(name), '\s', '', 'g')) = 'tiendapueblo';
  IF v_cnt = 0 THEN
    RAISE EXCEPTION 'TP-GUARD-G3: no existe proveedor canónico «Tienda Pueblo» en la tienda % — abortando (no se inventa alta)', v_store;
  END IF;
  IF v_cnt > 1 THEN
    RAISE EXCEPTION 'TP-GUARD-G3b: hay % candidatos «Tienda Pueblo» — abortando (no asociación arbitraria)', v_cnt;
  END IF;
  SELECT id, name INTO v_canon_id, v_canon_name FROM public.suppliers
   WHERE store_id = v_store AND is_active
     AND lower(regexp_replace(btrim(name), '\s', '', 'g')) = 'tiendapueblo';

  -- Corrección: SOLO el campo textual de proveedor (vinculación histórica).
  -- Intactos: id, fechas, cantidades, importes, moneda, kardex, movimientos,
  -- referencias históricas, estados, pagos, document_number, notes.
  UPDATE public.receipts
     SET supplier = v_canon_name,
         updated_at = now()
   WHERE id = ANY(v_ids) AND status = 'active'
     AND btrim(COALESCE(supplier, '')) IN ('', '—');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 3 THEN
    RAISE EXCEPTION 'TP-VERIFY: se corrigieron % de 3 filas — rollback atómico', v_rows;
  END IF;

  -- Trazabilidad (§6.5): una fila por recepción; fuente OWNER_CONFIRMATION;
  -- ausencia de documentación externa reflejada; actor técnico = migración.
  FOR v_i IN 1..3 LOOP
    INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
    VALUES (
      NULL,
      v_store,
      'RECEIPT_SUPPLIER_REGULARIZED',
      'receipts',
      v_ids[v_i],
      jsonb_build_object(
        'mission', 'CP-BRA-FINAL-COMPLIANCE-CLOSURE-001',
        'fase', 'FASE 4 — Regularización de las tres recepciones de Tienda Pueblo',
        'source', 'OWNER_CONFIRMATION',
        'owner_decision', '§0.3: LAS TRES RECEPCIONES PERTENECEN AL PROVEEDOR TIENDA PUEBLO (confirmación expresa del propietario, 2026-11-27) — no existe documentación externa',
        'receipt_id', v_ids[v_i],
        'reference_doc', v_refs[v_i],
        'total_cost', v_totals[v_i],
        'supplier_before', '—',
        'supplier_after', v_canon_name,
        'canonical_supplier_id', v_canon_id,
        'external_documentation', 'AUSENTE — sin factura/NIT/teléfono/dirección/documento; NO se inventó información complementaria (§0.3)',
        'scope_of_change', 'ÚNICAMENTE el campo textual supplier (vinculación histórica); importes, fechas, kardex, pagos y estados intactos',
        'reason', 'Vinculación histórica al proveedor confirmado por el propietario — patrón gobernado SR_SUPPLIER_NORMALIZED (20261126120100)',
        'reversible', true,
        'rollback_hint', 'UPDATE receipts SET supplier=''—'' WHERE id=<receipt_id> (valores antes/después en este registro y en el expediente)'
      )
    );
  END LOOP;

  RAISE NOTICE 'TP-APPLY: 3 recepciones regularizadas a «%» (canonical %) con auditoría OWNER_CONFIRMATION', v_canon_name, v_canon_id;
END;
$tp_guard$;

COMMIT;

-- ─── DOWN ───────────────────────────────────────────────────────────────────
-- La reversión restaura supplier='—' en las 3 recepciones y elimina las 3
-- filas de auditoría (o las conserva — decisión del expediente). NO se
-- automatiza: la política de reversiones del repo exige expediente explícito.
-- ============================================================================
