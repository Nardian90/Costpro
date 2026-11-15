-- ============================================================================
-- TEST PRIV-HARDENING — CP-FIN-T12-PRIVILEGE-HARDENING-001 (2026-11-16)
-- ============================================================================
-- Batería transaccional autocontenida (un único DO block). Runner oficial:
--   node scripts/e2e/run-sql-test-e2e.mjs supabase/tests/cp_fin_t12_privilege_hardening_test.sql
-- Ejecutar SOLO contra la BD E2E AISLADA (el runner impone el guard del
-- centinela e2e_is_isolated_db). Orquestador con evidencia JSON:
--   scripts/m055-fin-t12-privilege-e2e.mjs (aplica la migración correctiva,
--   ejecuta esta batería, pruebas REST reales y re-ejecuta la batería T12).
--
-- Requiere que la migración correctiva 20261116120000_cp_fin_t12_privilege_
-- hardening.sql esté aplicada (el orquestador la aplica antes).
--
-- Casos:
--   C1  Catálogo: authenticated/anon/PUBLIC sin EXECUTE; service_role y
--       owner con EXECUTE (estado post-migración esperado).
--   C2  Denegación REAL anon (SET LOCAL ROLE anon) → permission denied.
--   C3  Denegación REAL authenticated → permission denied.
--   C4  Denegación REAL rol sin ningún grant (prv_no_exec_role) → denied.
--   C5  service_role SÍ ejecuta el helper (capacidad server-side intacta).
--   C6  Owner (postgres) SÍ ejecuta el helper.
--   C7  Cadenas internas OPERATIVAS como service_role: motor contabiliza,
--       reversión parcial → trigger T12 bloquea (el helper se ejecuta dentro
--       de los SECURITY DEFINER pese a la revocación de cliente).
--   C8  Resultados contables intactos: patrón idéntico a la batería T12
--       (compensatorio único, original reversed, residual 2000/0, sin 2ª
--       compensación tras regularización).
--   C9  Limpieza total (el DO corre en transacción: falla = rollback total).
-- ============================================================================
DO $prv$
DECLARE
  v_fn regprocedure := to_regprocedure('public.fin_entry_reversal_residual(uuid)');
  v_store uuid := '7ec70007-0000-4000-8000-000000000002';
  v_prod  uuid := '7ec70007-0000-4000-8000-000000000101';
  v_ra uuid := '7ec70007-0000-4000-8000-000000000a01';  -- anulación ordinaria
  v_rb uuid := '7ec70007-0000-4000-8000-000000000b02';  -- reversión parcial
  v_parcial uuid := '7ec70007-0000-4000-8000-000000000b12';
  v_regula uuid := '7ec70007-0000-4000-8000-000000000b23';
  v_entry_a uuid; v_entry_b uuid;
  v_resid numeric; v_status text; v_n int;
  v_ia uuid := '7ec70007-0000-4000-8000-000000000a1f';
  v_ib uuid := '7ec70007-0000-4000-8000-000000000b1f';
BEGIN
  SET CONSTRAINTS fin_trg_receipts IMMEDIATE;

  -- ── C9.limpieza previa (re-ejecutable; patrón batería T12) ───────────────
  SET LOCAL session_replication_role = 'replica';
  DELETE FROM fin_movements WHERE store_id = v_store;
  DELETE FROM fin_entries WHERE store_id = v_store;
  DELETE FROM fin_posting_errors WHERE store_id = v_store OR document_id IN (v_ra, v_rb);
  DELETE FROM audit_logs WHERE store_id = v_store OR record_id::text IN (v_ra::text, v_rb::text);
  DELETE FROM receipt_items WHERE receipt_id IN (v_ra, v_rb);
  DELETE FROM receipts WHERE store_id = v_store;
  DELETE FROM products WHERE store_id = v_store;
  DELETE FROM stores WHERE id = v_store;
  SET LOCAL session_replication_role = 'origin';

  -- ── C1: catálogo ACL (estado post-migración) ──────────────────────────────
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'PRV-C1-FAIL: el helper no existe — ¿está aplicada la migración T12 + la correctiva?';
  END IF;
  IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRV-C1-FAIL: authenticated conserva EXECUTE (migración correctiva no aplicada)';
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRV-C1-FAIL: anon conserva EXECUTE';
  END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRV-C1-FAIL: PUBLIC conserva EXECUTE';
  END IF;
  IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRV-C1-FAIL: service_role perdió EXECUTE';
  END IF;
  IF NOT has_function_privilege('postgres', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRV-C1-FAIL: owner perdió EXECUTE';
  END IF;

  -- ── semillas ──────────────────────────────────────────────────────────────
  INSERT INTO stores (id, name, slug, is_active, created_at, backup_restore_protected)
    VALUES (v_store, 'PRV-SQLBAT', 'prv-sqlbat', true, '2026-11-16T00:00:00Z', false);
  INSERT INTO products (id, store_id, sku, name, price, cost_price, cost_average,
    stock_current, min_stock, unit_of_measure, category, supplier, price_currency, is_active,
    visible_en_tienda, operational_class, created_at, updated_at)
    VALUES (v_prod, v_store, 'T998', 'Producto PRIV SQL', 100, 10, 10, 0, 1, 'unidad', 'Test',
      'ProvTest', 'CUP', true, true, 'venta', '2026-11-16T00:00:00Z', '2026-11-16T00:00:00Z');
  INSERT INTO receipts (id, store_id, status, total_cost, reference_doc, supplier,
      reception_date, payment_status, paid_amount, created_at, notes)
    VALUES (v_ra, v_store, 'active', 1000, 'FAC-PRV-A', 'ProvTest', '2026-07-02', 'unpaid', 0, now(), 'PRV'),
           (v_rb, v_store, 'active', 5000, 'FAC-PRV-B', 'ProvTest', '2026-07-02', 'unpaid', 0, now(), 'PRV');
  INSERT INTO receipt_items (id, receipt_id, product_id, quantity, unit_cost,
      moneda_recepcion, tasa_cambio_recepcion, created_at, updated_at) VALUES
    (v_ia, v_ra, v_prod, 100, 10, 'CUP', 1, now(), now()),
    (v_ib, v_rb, v_prod, 100, 50, 'CUP', 1, now(), now());
  SELECT public.fin_post_document('RECEPCION', v_ra, 'reconocimiento') INTO v_entry_a;
  SELECT public.fin_post_document('RECEPCION', v_rb, 'reconocimiento') INTO v_entry_b;
  IF v_entry_a IS NULL OR v_entry_b IS NULL THEN
    RAISE EXCEPTION 'PRV-SETUP-FAIL: el motor no contabilizó las recepciones';
  END IF;

  -- ── C2: denegación REAL anon ──────────────────────────────────────────────
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.fin_entry_reversal_residual(gen_random_uuid());
    RAISE EXCEPTION 'PRV-C2-FAIL: anon invocó el helper (trampa viva)';
  EXCEPTION WHEN OTHERS THEN
    IF sqlerrm LIKE 'PRV-C2-FAIL%' THEN RAISE EXCEPTION '%', sqlerrm; END IF;
    IF NOT (sqlerrm ILIKE '%permission denied%' OR sqlerrm ILIKE '%could not find%function%' OR sqlerrm ILIKE '%insufficient_privilege%') THEN
      RAISE EXCEPTION 'PRV-C2-FAIL: excepción inesperada para anon: %', sqlerrm;
    END IF;
  END;
  RESET ROLE;

  -- ── C3: denegación REAL authenticated ─────────────────────────────────────
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.fin_entry_reversal_residual(gen_random_uuid());
    RAISE EXCEPTION 'PRV-C3-FAIL: authenticated invocó el helper (hallazgo vivo)';
  EXCEPTION WHEN OTHERS THEN
    IF sqlerrm LIKE 'PRV-C3-FAIL%' THEN RAISE EXCEPTION '%', sqlerrm; END IF;
    IF NOT (sqlerrm ILIKE '%permission denied%' OR sqlerrm ILIKE '%could not find%function%' OR sqlerrm ILIKE '%insufficient_privilege%') THEN
      RAISE EXCEPTION 'PRV-C3-FAIL: excepción inesperada para authenticated: %', sqlerrm;
    END IF;
  END;
  RESET ROLE;

  -- ── C4: denegación REAL de un rol sin NINGÚN grant ────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prv_no_exec_role') THEN
    CREATE ROLE prv_no_exec_role NOLOGIN;
  END IF;
  BEGIN
    SET LOCAL ROLE prv_no_exec_role;
    PERFORM public.fin_entry_reversal_residual(gen_random_uuid());
    RAISE EXCEPTION 'PRV-C4-FAIL: rol sin grants invocó el helper';
  EXCEPTION WHEN OTHERS THEN
    IF sqlerrm LIKE 'PRV-C4-FAIL%' THEN RAISE EXCEPTION '%', sqlerrm; END IF;
    IF NOT (sqlerrm ILIKE '%permission denied%' OR sqlerrm ILIKE '%could not find%function%' OR sqlerrm ILIKE '%insufficient_privilege%' OR sqlerrm ILIKE '%role%not%member%' OR sqlerrm ILIKE '%does not exist%') THEN
      RAISE EXCEPTION 'PRV-C4-FAIL: excepción inesperada para rol sin grants: %', sqlerrm;
    END IF;
  END;
  RESET ROLE;

  -- ── C5: service_role SÍ ejecuta ───────────────────────────────────────────
  SET LOCAL ROLE service_role;
  v_resid := public.fin_entry_reversal_residual(v_entry_a);
  RESET ROLE;
  IF v_resid IS NULL THEN RAISE EXCEPTION 'PRV-C5-FAIL: service_role obtuvo NULL'; END IF;

  -- ── C6: owner (postgres) SÍ ejecuta ───────────────────────────────────────
  v_resid := public.fin_entry_reversal_residual(v_entry_b);
  IF v_resid IS NULL THEN RAISE EXCEPTION 'PRV-C6-FAIL: owner obtuvo NULL'; END IF;

  -- ── C7+C8: cadenas internas operativas + resultados contables intactos ────
  -- (como service_role, el rol operativo server-side de los flujos financieros)
  SET LOCAL ROLE service_role;

  -- reversión parcial (patrón RECT-1) sobre RB → residual 2000
  INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number,
      event, reversal_of, economic_date, posted_at, status, description)
    VALUES (v_parcial, v_store, 'RECEPCION', v_rb, 'FAC-PRV-B', 'ajuste_manual', v_entry_b,
      '2026-07-02', now(), 'posted', 'PRV parcial 3000 de 5000');
  INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount,
      currency, exchange_rate, economic_date, description) VALUES
    (gen_random_uuid(), v_parcial, v_store, 'PAS_CXP_PROV', 'debito', 3000, 'CUP', 1, '2026-07-02', 'parcial'),
    (gen_random_uuid(), v_parcial, v_store, 'ACT_INVENTARIO', 'credito', 3000, 'CUP', 1, '2026-07-02', 'parcial');
  -- el helper se invoca AQUÍ a través del trigger/motor (rol efectivo owner)
  v_resid := public.fin_entry_reversal_residual(v_entry_b);
  IF abs(v_resid - 2000) > 0.01 THEN
    RAISE EXCEPTION 'PRV-C8-FAIL: residual % (esperado 2000)', v_resid;
  END IF;

  -- trigger T12 bloquea la anulación con residual pendiente
  BEGIN
    UPDATE receipts SET status = 'voided' WHERE id = v_rb;
    RAISE EXCEPTION 'PRV-C7-FAIL: el UPDATE no fue bloqueado (trampa viva)';
  EXCEPTION WHEN OTHERS THEN
    IF NOT sqlerrm LIKE 'ERR_PARTIAL_REVERSAL_PENDING:%' THEN
      RAISE EXCEPTION 'PRV-C7-FAIL: excepción inesperada: %', sqlerrm;
    END IF;
  END;
  SELECT status INTO v_status FROM receipts WHERE id = v_rb;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'PRV-C7-FAIL: B no quedó active (%)', v_status; END IF;

  -- regularización explícita → cauce ordinario rehabilitado
  INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number,
      event, reversal_of, economic_date, posted_at, status, description)
    VALUES (v_regula, v_store, 'RECEPCION', NULL, NULL, 'ajuste_manual', v_entry_b,
      '2026-07-02', now(), 'posted', 'PRV regularización residual 2000');
  INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount,
      currency, exchange_rate, economic_date, description) VALUES
    (gen_random_uuid(), v_regula, v_store, 'PAS_CXP_PROV', 'debito', 2000, 'CUP', 1, '2026-07-02', 'regula'),
    (gen_random_uuid(), v_regula, v_store, 'ACT_INVENTARIO', 'credito', 2000, 'CUP', 1, '2026-07-02', 'regula');
  v_resid := public.fin_entry_reversal_residual(v_entry_b);
  IF abs(v_resid) > 0.01 THEN RAISE EXCEPTION 'PRV-C8-FAIL: residual tras regularizar %', v_resid; END IF;
  UPDATE receipts SET status = 'voided' WHERE id = v_rb;  -- ahora pasa
  SELECT status INTO v_status FROM receipts WHERE id = v_rb;
  IF v_status <> 'voided' THEN RAISE EXCEPTION 'PRV-C8-FAIL: B quedó %', v_status; END IF;
  SELECT count(*) INTO v_n FROM fin_entries WHERE document_id = v_rb AND event = 'anulacion';
  IF v_n <> 0 THEN RAISE EXCEPTION 'PRV-C8-FAIL: compensatorio creado pese a cobertura externa total'; END IF;

  RESET ROLE;

  -- anulación ORDINARIA de RA (idempotencia intacta — patrón T12 C1)
  UPDATE receipts SET status = 'voided' WHERE id = v_ra;
  SELECT count(*) INTO v_n FROM fin_entries WHERE document_id = v_ra AND event = 'anulacion' AND reversal_of = v_entry_a;
  IF v_n <> 1 THEN RAISE EXCEPTION 'PRV-C8-FAIL: compensatorio enlazado ausente (entradas=%)', v_n; END IF;
  SELECT status INTO v_status FROM fin_entries WHERE id = v_entry_a;
  IF v_status <> 'reversed' THEN RAISE EXCEPTION 'PRV-C8-FAIL: original A no quedó reversed (%)', v_status; END IF;
  SELECT count(*) INTO v_n FROM fin_entries WHERE document_id = v_ra AND event = 'anulacion';
  IF v_n <> 1 THEN RAISE EXCEPTION 'PRV-C8-FAIL: segunda compensación (idempotencia rota)'; END IF;

  -- ── C9: limpieza total ────────────────────────────────────────────────────
  SET LOCAL session_replication_role = 'replica';
  DELETE FROM fin_movements WHERE store_id = v_store;
  DELETE FROM fin_entries WHERE store_id = v_store;
  DELETE FROM fin_posting_errors WHERE store_id = v_store OR document_id IN (v_ra, v_rb);
  DELETE FROM audit_logs WHERE store_id = v_store OR record_id::text IN (v_ra::text, v_rb::text);
  DELETE FROM receipt_items WHERE receipt_id IN (v_ra, v_rb);
  DELETE FROM receipts WHERE store_id = v_store;
  DELETE FROM products WHERE store_id = v_store;
  DELETE FROM stores WHERE id = v_store;
  SET LOCAL session_replication_role = 'origin';

  RAISE NOTICE 'PRV-BATTERY: TODAS PASS (C1 catálogo, C2 anon, C3 authenticated, C4 sin-grants, C5 service_role, C6 owner, C7 bloqueo T12, C8 contable intacto, C9 limpieza)';
END $prv$;
