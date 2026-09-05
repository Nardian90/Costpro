-- B-10b-OBS-1 · GATE 13 — Verificación atómica read-only (sin mutación)
-- Cada assertion falla → EXCEPTION → el lote completo aborta (HTTP != 201).
DO $$
DECLARE
  v_dev RECORD;
  v_n int;
  v_b boolean;
  v_num numeric;
BEGIN
  -- A1: la devolución revertida existe con estado/campos esperados
  SELECT * INTO v_dev FROM public.devolutions WHERE id='0b7213e9-344a-4aa0-876d-316be9c6ff2e';
  IF v_dev IS NULL THEN RAISE EXCEPTION 'A1 FAIL: devolucion no encontrada'; END IF;
  IF v_dev.status <> 'reversed' THEN RAISE EXCEPTION 'A1b FAIL: status=%', v_dev.status; END IF;
  IF v_dev.reversed_at IS NULL OR v_dev.reversed_by IS NULL OR v_dev.reversal_reason IS NULL THEN
    RAISE EXCEPTION 'A1c FAIL: campos de reversion incompletos'; END IF;
  IF v_dev.reversed_by <> 'a1111111-1111-1111-1111-111111111111' THEN
    RAISE EXCEPTION 'A1d FAIL: actor inesperado %', v_dev.reversed_by; END IF;

  -- A2: sin fila de inventory para (producto, tienda) del par → nada que reconciliar
  SELECT NOT EXISTS(SELECT 1 FROM public.inventory
    WHERE product_id='da1c4090-3e10-4120-a2bc-24da53cffe16'
      AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') INTO v_b;
  IF NOT v_b THEN RAISE EXCEPTION 'A2 FAIL: fila de inventory existe'; END IF;

  -- A3: 0 mismatches products==inventory global (Caso A vivo = 0)
  SELECT count(*) INTO v_n FROM public.products p
    JOIN public.inventory i ON i.product_id=p.id AND i.store_id=p.store_id
    WHERE p.stock_current <> i.quantity;
  IF v_n <> 0 THEN RAISE EXCEPTION 'A3 FAIL: % mismatches products/inventory', v_n; END IF;

  -- A4: 0 movements de devolución (return / devolution_reverse / ref a devoluciones)
  SELECT count(*) INTO v_n FROM public.stock_movements
    WHERE movement_type IN ('return','devolution_reverse')
       OR reference_id::text IN (SELECT id::text FROM public.devolutions);
  IF v_n <> 0 THEN RAISE EXCEPTION 'A4 FAIL: % movements de devolucion', v_n; END IF;

  -- A5: 0 kardex refiriendo devoluciones o reversiones legacy cost0
  SELECT count(*) INTO v_n FROM public.kardex_entries
    WHERE reference_id::text IN (SELECT id::text FROM public.devolutions)
       OR (movement_type='out' AND reference_type='reversal' AND unit_cost=0);
  IF v_n <> 0 THEN RAISE EXCEPTION 'A5 FAIL: % kardex de devolucion', v_n; END IF;

  -- A6: WAC invariante (valor congelado en evidencia PRE)
  SELECT cost_average INTO v_num FROM public.products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16';
  IF v_num IS DISTINCT FROM 11.919422583856775 THEN
    RAISE EXCEPTION 'A6 FAIL: WAC=%', v_num; END IF;

  -- A7: finanzas intactas — 0 payment_transactions ligadas a devoluciones
  SELECT count(*) INTO v_n FROM public.payment_transactions
    WHERE ref_id IN (SELECT id FROM public.devolutions)
       OR transaction_id IN (SELECT id FROM public.devolutions);
  IF v_n <> 0 THEN RAISE EXCEPTION 'A7 FAIL: % payments de devolucion', v_n; END IF;

  -- A8: estado del producto sin cambios de updated_at (ninguna escritura en esta fase)
  SELECT (updated_at = '2026-08-16T22:01:13.103154+00:00'::timestamptz) INTO v_b
    FROM public.products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16';
  IF NOT v_b THEN RAISE EXCEPTION 'A8 FAIL: updated_at del producto cambio'; END IF;
END $$;

-- Solo se alcanza si el DO completo pasó (atomicidad del lote)
SELECT jsonb_build_object(
  'assertions', 'A1..A8',
  'result', 'ALL PASS',
  'mode', 'READ-ONLY (0 escrituras)',
  'at', now()
) AS verification;
