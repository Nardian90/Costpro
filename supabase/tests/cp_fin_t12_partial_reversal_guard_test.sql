-- ============================================================================
-- TEST T12 — CP-FIN-FINAL-CLOSE-005 · Salvaguarda de reversión parcial
-- (migración 20261115100000_cp_fin_t12_partial_reversal_guard.sql)
-- ============================================================================
-- Batería transaccional autocontenida (un único DO block). Runner oficial:
--   node scripts/e2e/run-sql-test-e2e.mjs supabase/tests/cp_fin_t12_partial_reversal_guard_test.sql
-- Ejecutar SOLO contra la BD E2E AISLADA (el runner impone el guard del
-- centinela e2e_is_isolated_db). Versión enriquecida con evidencia JSON:
--   scripts/m052-t12-guard-regression.mjs (mismo contrato, más pasos).
--
-- Casos (resumen del equivalente m052):
--   1. Anulación ordinaria sin reversión → compensatorio completo (intacta).
--   2. Reversión parcial (patrón RECT-1) → residual > 0.
--   3. UPDATE receipts → voided con residual → BLOQUEADA (trigger BEFORE)
--      + motor _safe → 0 compensatorios + auditoría en fin_posting_errors.
--   4. Anulación completa ordinaria respetada (skip sin error, sin 2ª compensación).
--   5. Regularización del residual (asiento manual por reversal_of) →
--      la anulación vuelve al cauce ordinario.
--   6. Limpieza total (el DO corre en transacción: falla = rollback total).
-- ============================================================================
DO $t12$
DECLARE
  v_store uuid := '7ec70006-0000-4000-8000-000000000002';
  v_prod uuid := '7ec70006-0000-4000-8000-000000000101';
  v_ra uuid := '7ec70006-0000-4000-8000-000000000a01';  -- anulación ordinaria
  v_rb uuid := '7ec70006-0000-4000-8000-000000000b02';  -- reversión parcial
  v_rc uuid := '7ec70006-0000-4000-8000-000000000c03';  -- reversión completa
  v_parcial uuid := '7ec70006-0000-4000-8000-000000000b12';
  v_completa uuid := '7ec70006-0000-4000-8000-000000000c13';
  v_regula uuid := '7ec70006-0000-4000-8000-000000000b23';
  v_entry_a uuid; v_entry_b uuid; v_entry_c uuid;
  v_resid numeric; v_count int; v_status text; v_n int;
  v_ia uuid := '7ec70006-0000-4000-8000-000000000a1f';
  v_ib uuid := '7ec70006-0000-4000-8000-000000000b1f';
  v_ic uuid := '7ec70006-0000-4000-8000-000000000c1f';
BEGIN
  -- fin_trg_receipts es CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED
  -- (dispara al COMMIT, no al final de la sentencia). Para poder verificar los
  -- efectos de la anulación DENTRO de la misma transacción del DO, se fuerza
  -- inmediato (hallazgo m052d; sin esto, C1 no vería el compensatorio).
  SET CONSTRAINTS fin_trg_receipts IMMEDIATE;

  -- ── limpieza previa (re-ejecutable; hard-delete gobernado con el patrón
  -- m049/m050d: session_replication_role=replica evita el trigger de auditoría
  -- de stores; se restaura a 'origin' ANTES de las semillas — el disparo de
  -- triggers queda plenamente rehabilitado, como demostró m052d)
  SET LOCAL session_replication_role = 'replica';
  DELETE FROM fin_movements WHERE store_id = v_store;
  DELETE FROM fin_entries WHERE store_id = v_store;
  DELETE FROM fin_posting_errors WHERE store_id = v_store OR document_id IN (v_ra, v_rb, v_rc);
  DELETE FROM audit_logs WHERE store_id = v_store OR record_id::text IN (v_ra::text, v_rb::text, v_rc::text);
  DELETE FROM receipt_items WHERE receipt_id IN (v_ra, v_rb, v_rc);
  DELETE FROM receipts WHERE store_id = v_store;
  DELETE FROM products WHERE store_id = v_store;
  DELETE FROM stores WHERE id = v_store;
  SET LOCAL session_replication_role = 'origin';

  -- ── semillas ──────────────────────────────────────────────────────────────
  INSERT INTO stores (id, name, slug, is_active, created_at, backup_restore_protected)
    VALUES (v_store, 'T12-SQLBAT', 't12-sqlbat', true, '2026-11-15T00:00:00Z', false);
  INSERT INTO products (id, store_id, sku, name, price, cost_price, cost_average,
    stock_current, min_stock, unit_of_measure, category, supplier, price_currency, is_active,
    visible_en_tienda, operational_class, created_at, updated_at)
    VALUES (v_prod, v_store, 'T997', 'Producto T12 SQL', 100, 10, 10, 0, 1, 'unidad', 'Test',
      'ProvTest', 'CUP', true, true, 'venta', '2026-11-15T00:00:00Z', '2026-11-15T00:00:00Z');
  INSERT INTO receipts (id, store_id, status, total_cost, reference_doc, supplier,
      reception_date, payment_status, paid_amount, created_at, notes)
    VALUES (v_ra, v_store, 'active', 1000, 'FAC-T12-A', 'ProvTest', '2026-07-02', 'unpaid', 0, now(), 'T12'),
           (v_rb, v_store, 'active', 5000, 'FAC-T12-B', 'ProvTest', '2026-07-02', 'unpaid', 0, now(), 'T12'),
           (v_rc, v_store, 'active', 2000, 'FAC-T12-C', 'ProvTest', '2026-07-02', 'unpaid', 0, now(), 'T12');
  INSERT INTO receipt_items (id, receipt_id, product_id, quantity, unit_cost,
      moneda_recepcion, tasa_cambio_recepcion, created_at, updated_at) VALUES
    (v_ia, v_ra, v_prod, 100, 10, 'CUP', 1, now(), now()),
    (v_ib, v_rb, v_prod, 100, 50, 'CUP', 1, now(), now()),
    (v_ic, v_rc, v_prod, 100, 20, 'CUP', 1, now(), now());
  SELECT public.fin_post_document('RECEPCION', v_ra, 'reconocimiento') INTO v_entry_a;
  SELECT public.fin_post_document('RECEPCION', v_rb, 'reconocimiento') INTO v_entry_b;
  SELECT public.fin_post_document('RECEPCION', v_rc, 'reconocimiento') INTO v_entry_c;
  IF v_entry_a IS NULL OR v_entry_b IS NULL OR v_entry_c IS NULL THEN
    RAISE EXCEPTION 'T12-SETUP-FAIL: el motor no contabilizó las 3 recepciones';
  END IF;

  -- ── 1. anulación ordinaria intacta ────────────────────────────────────────
  UPDATE receipts SET status = 'voided' WHERE id = v_ra;
  SELECT count(*) INTO v_n FROM fin_entries WHERE document_id = v_ra AND event = 'anulacion' AND reversal_of = v_entry_a;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T12-C1-FAIL: compensatorio enlazado ausente (entradas=%)', v_n; END IF;
  SELECT status INTO v_status FROM fin_entries WHERE id = v_entry_a;
  IF v_status <> 'reversed' THEN RAISE EXCEPTION 'T12-C1-FAIL: original A no quedó reversed (%)', v_status; END IF;

  -- ── 2. reversión parcial (patrón RECT-1) → residual ───────────────────────
  INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number,
      event, reversal_of, economic_date, posted_at, status, description)
    VALUES (v_parcial, v_store, 'RECEPCION', v_rb, 'FAC-T12-B', 'ajuste_manual', v_entry_b,
      '2026-07-02', now(), 'posted', 'T12 parcial 3000 de 5000');
  INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount,
      currency, exchange_rate, economic_date, description) VALUES
    (gen_random_uuid(), v_parcial, v_store, 'PAS_CXP_PROV', 'debito', 3000, 'CUP', 1, '2026-07-02', 'parcial'),
    (gen_random_uuid(), v_parcial, v_store, 'ACT_INVENTARIO', 'credito', 3000, 'CUP', 1, '2026-07-02', 'parcial');
  v_resid := public.fin_entry_reversal_residual(v_entry_b);
  IF abs(v_resid - 2000) > 0.01 THEN RAISE EXCEPTION 'T12-C2-FAIL: residual % (esperado 2000)', v_resid; END IF;

  -- ── 3. bloqueo de negocio (trigger BEFORE) con residual pendiente ─────────
  BEGIN
    UPDATE receipts SET status = 'voided' WHERE id = v_rb;
    RAISE EXCEPTION 'T12-C3-FAIL: el UPDATE no fue bloqueado (trampa viva)';
  EXCEPTION WHEN OTHERS THEN
    IF NOT sqlerrm LIKE 'ERR_PARTIAL_REVERSAL_PENDING:%' THEN
      RAISE EXCEPTION 'T12-C3-FAIL: excepción inesperada: %', sqlerrm;
    END IF;
  END;
  -- (la excepción del UPDATE revierte su propia sentencia; el DO continúa)
  SELECT status INTO v_status FROM receipts WHERE id = v_rb;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'T12-C3-FAIL: B no quedó active (%)', v_status; END IF;
  SELECT count(*) INTO v_n FROM fin_entries WHERE document_id = v_rb AND event = 'anulacion';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T12-C3-FAIL: se creó compensatorio pese al bloqueo'; END IF;
  -- motor: canal _safe → 0 compensatorios + auditoría fin_posting_errors
  SELECT public.fin_post_annulment_safe('RECEPCION', v_rb) INTO v_count;
  IF v_count <> 0 THEN RAISE EXCEPTION 'T12-C3-FAIL: _safe devolvió %', v_count; END IF;
  SELECT count(*) INTO v_n FROM fin_posting_errors WHERE document_id = v_rb
    AND error_code LIKE 'ERR_PARTIAL_REVERSAL_PENDING%';
  IF v_n < 1 THEN RAISE EXCEPTION 'T12-C3-FAIL: sin auditoría en fin_posting_errors'; END IF;

  -- ── 4. reversión completa ordinaria respetada ─────────────────────────────
  INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number,
      event, reversal_of, economic_date, posted_at, status, description)
    VALUES (v_completa, v_store, 'RECEPCION', v_rc, 'FAC-T12-C', 'ajuste_manual', v_entry_c,
      '2026-07-02', now(), 'posted', 'T12 completa 2000 de 2000');
  INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount,
      currency, exchange_rate, economic_date, description) VALUES
    (gen_random_uuid(), v_completa, v_store, 'PAS_CXP_PROV', 'debito', 2000, 'CUP', 1, '2026-07-02', 'completa'),
    (gen_random_uuid(), v_completa, v_store, 'ACT_INVENTARIO', 'credito', 2000, 'CUP', 1, '2026-07-02', 'completa');
  v_resid := public.fin_entry_reversal_residual(v_entry_c);
  IF abs(v_resid) > 0.01 THEN RAISE EXCEPTION 'T12-C4-FAIL: residual C % (esperado 0)', v_resid; END IF;
  UPDATE receipts SET status = 'voided' WHERE id = v_rc;  -- debe pasar sin error
  SELECT count(*) INTO v_n FROM fin_entries WHERE document_id = v_rc AND event = 'anulacion';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T12-C4-FAIL: 2ª compensación (rompe idempotencia de reversión completa)'; END IF;

  -- ── 5. regularización explícita → cauce ordinario rehabilitado ────────────
  INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number,
      event, reversal_of, economic_date, posted_at, status, description)
    VALUES (v_regula, v_store, 'RECEPCION', NULL, NULL, 'ajuste_manual', v_entry_b,
      '2026-07-02', now(), 'posted', 'T12 regularización residual 2000 (asiento manual por reversal_of)');
  INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount,
      currency, exchange_rate, economic_date, description) VALUES
    (gen_random_uuid(), v_regula, v_store, 'PAS_CXP_PROV', 'debito', 2000, 'CUP', 1, '2026-07-02', 'regula'),
    (gen_random_uuid(), v_regula, v_store, 'ACT_INVENTARIO', 'credito', 2000, 'CUP', 1, '2026-07-02', 'regula');
  v_resid := public.fin_entry_reversal_residual(v_entry_b);
  IF abs(v_resid) > 0.01 THEN RAISE EXCEPTION 'T12-C5-FAIL: residual tras regularizar %', v_resid; END IF;
  UPDATE receipts SET status = 'voided' WHERE id = v_rb;  -- ahora debe pasar
  SELECT status INTO v_status FROM receipts WHERE id = v_rb;
  IF v_status <> 'voided' THEN RAISE EXCEPTION 'T12-C5-FAIL: B quedó %', v_status; END IF;
  SELECT count(*) INTO v_n FROM fin_entries WHERE document_id = v_rb AND event = 'anulacion';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T12-C5-FAIL: compensatorio creado pese a cobertura externa total'; END IF;

  -- ── 6. limpieza total (hard-delete gobernado; el DO corre en transacción:
  -- falla = rollback total y sin residuos)
  SET LOCAL session_replication_role = 'replica';
  DELETE FROM fin_movements WHERE store_id = v_store;
  DELETE FROM fin_entries WHERE store_id = v_store;
  DELETE FROM fin_posting_errors WHERE store_id = v_store OR document_id IN (v_ra, v_rb, v_rc);
  DELETE FROM audit_logs WHERE store_id = v_store OR record_id::text IN (v_ra::text, v_rb::text, v_rc::text);
  DELETE FROM receipt_items WHERE receipt_id IN (v_ra, v_rb, v_rc);
  DELETE FROM receipts WHERE store_id = v_store;
  DELETE FROM products WHERE store_id = v_store;
  DELETE FROM stores WHERE id = v_store;
  SET LOCAL session_replication_role = 'origin';
  RAISE NOTICE 'T12-BATTERY: TODAS PASS (C1 ordinaria, C2 residual, C3 bloqueo+auditoría, C4 completa, C5 regularización)';
END $t12$;
