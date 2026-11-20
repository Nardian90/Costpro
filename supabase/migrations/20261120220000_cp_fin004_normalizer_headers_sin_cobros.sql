-- ============================================================================
-- CP-FIN-004 — M4: normalizador v2 — caso «header zelle SIN cobros»
-- (ventas CUP@680 de sustancia USD físico, patrón pre-corte del propietario).
--
-- MISIÓN: CP-FIN-ENERVIDA-CONTROLLED-ACCOUNTING-REBUILD-AND-CONFIGURATION-001
-- ANEXO VINCULANTE POS-BACKEND (CP-FIN-004, 2026-11-20).
--
-- CONTEXTO (hallazgo de la PRIMERA ejecución en producción, abortada
-- atómicamente por la post-condición fail-closed):
--   ERR_NORMALIZACION_INCOMPLETA: cobros zelle residuales=0, headers residuales=3
--
-- Los 3 headers residuales (universo EXACTO verificado en producción):
--   · c5965c77 FAC-004273-2026 (03/08) Cable Solar Negro 4mm ×5 @3.060 CUP = 15.300 CUP
--   · cb3052c3 FAC-004302-2026 (04/08) Conectores MC4 ×1 @4.760 CUP = 4.760 CUP
--   · 119a4f5e FAC-004311-2026 (04/08) Conectores MC4 ×1 @4.760 CUP = 4.760 CUP
-- Características: sale_currency=CUP · payment_method='zelle' (header) ·
-- zelle_amount = total en CUP · CERO filas en payment_transactions ·
-- números de factura reales (no importación masiva del 2026-10-04 — son
-- asientos pre-corte del propio propietario).
--
-- EVIDENCIA ECONÓMICA (sustancia USD físico, moneda registrada CUP@680):
--   15.300 ÷ 680 = 22,50 USD exactos = 5 × 4,50 USD (Cable Solar 4mm — el
--   MISMO precio unitario USD de la venta e2614f36 del 07-11) ·
--   4.760 ÷ 680 = 7,00 USD exactos. Patrón del bucket «USD físico → zelle
--   @680» (docs/audits/ENERVIDA-EXCEL-IMPORT.md decisión 2, ya usado en los
--   datos pre-corte del propietario). Conforme a la declaración del
-- propietario (anexo §4): TODA cobro en USD fue EFECTIVO salvo las 3 ventas
-- declaradas (que NO son estas: 330/330/210 USD Panel).
--
-- TRATAMIENTO (§5: solo medio y destino; PROHIBIDO tocar importes/moneda/
-- fecha/tasa; §6: NO se generan cobros ni movimientos nuevos):
--   header zelle → cash (efectivo) · pool zelle_amount → cash_amount ·
--   sin crear payment_transactions · contabilidad INVARIANTE (estas ventas
--   no tienen cobros: GEN-1 las registró como ING_VENTAS + ING_DESCUENTOS
--   (diferencia_cobro total) sin movimiento de destino; GEN-2 re-deriva lo
--   mismo). Queda documentado para veto/ajuste documental del propietario.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cp_fin004_normalize_enervida_payments(
  p_store_id uuid DEFAULT '5e6fe821-5465-48b1-b3f1-3aa3182edc38',
  p_exterior_sales uuid[] DEFAULT ARRAY[
    '9033864b-2c13-4aa3-b2b8-2fd645a190db',
    '3d19e5e7-2080-4eb1-8eca-cf7e391f30b9',
    '1a03c37f-3a9b-4c5a-912c-3958ebbaf91c']::uuid[],
  p_actor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_store_exists boolean;
  v_sale_id uuid;
  v_hdr_id uuid;
  v_method text;
  v_n_ext int := 0;
  v_n_cash int := 0;
  v_n_hdr int := 0;
  v_n_works int := 0;
  v_usd_ext numeric := 0;
  v_usd_cash numeric := 0;
  v_residual int;
  v_residual_hdr int;
  v_sale record;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) INTO v_store_exists;
  IF NOT v_store_exists THEN
    RETURN jsonb_build_object('status', 'SKIP_STORE_NOT_FOUND', 'store_id', p_store_id);
  END IF;

  -- Idempotencia global (auditoría de la normalización ya registrada)
  IF EXISTS (SELECT 1 FROM public.audit_logs
             WHERE action = 'CP_FIN004_NORMALIZE' AND record_id = p_store_id) THEN
    RETURN jsonb_build_object('status', 'YA_APLICADO', 'store_id', p_store_id);
  END IF;

  -- ── A. Las 3 ventas declaradas Transf. Exterior (Zelle): zelle → external_transfer ──
  FOREACH v_sale_id IN ARRAY p_exterior_sales LOOP
    IF EXISTS (SELECT 1 FROM public.transactions WHERE id = v_sale_id AND store_id = p_store_id) THEN
      UPDATE public.payment_transactions
        SET payment_method = 'external_transfer',
            notes = CASE WHEN coalesce(notes, '') = ''
                         THEN 'CP-FIN-004: rectificado zelle → external_transfer (Transf. Exterior — declaración del propietario)'
                         ELSE notes || ' · CP-FIN-004: rectificado zelle → external_transfer' END,
            updated_at = now()
        WHERE ref_type = 'sale' AND ref_id = v_sale_id
          AND payment_method = 'zelle' AND coalesce(direction, 'in') = 'in';

      UPDATE public.transactions
        SET external_transfer_amount = coalesce(external_transfer_amount, 0) + coalesce(zelle_amount, 0),
            zelle_amount = 0,
            updated_at = now()
        WHERE id = v_sale_id;

      SELECT CASE WHEN count(DISTINCT pt.payment_method) = 1 THEN min(pt.payment_method) ELSE 'mixed' END
        INTO v_method
      FROM public.payment_transactions pt
      WHERE pt.ref_type = 'sale' AND pt.ref_id = v_sale_id AND coalesce(pt.direction, 'in') = 'in';
      IF v_method IS NOT NULL AND v_method <> '' THEN
        UPDATE public.transactions
          SET payment_method = v_method::public.payment_method_enum, updated_at = now()
        WHERE id = v_sale_id;
      END IF;

      UPDATE public.transaction_items
        SET external_transfer_paid = coalesce(external_transfer_paid, 0) + coalesce(zelle_paid, 0),
            external_transfer_currency = coalesce(external_transfer_currency, zelle_currency),
            external_transfer_discount_type = coalesce(external_transfer_discount_type, zelle_discount_type),
            external_transfer_discount_value = coalesce(external_transfer_discount_value, zelle_discount_value),
            external_transfer_discount_currency = coalesce(external_transfer_discount_currency, zelle_discount_currency),
            zelle_paid = 0, zelle_currency = NULL,
            zelle_discount_type = NULL, zelle_discount_value = NULL, zelle_discount_currency = NULL
      WHERE transaction_id = v_sale_id AND coalesce(zelle_paid, 0) > 0;

      v_n_ext := v_n_ext + 1;
    END IF;
  END LOOP;

  -- ── B. Todas las demás ventas con cobros zelle → cash (efectivo USD) ──
  FOR v_sale IN
    SELECT DISTINCT pt.ref_id AS sale_id
    FROM public.payment_transactions pt
    WHERE pt.store_id = p_store_id AND pt.ref_type = 'sale'
      AND pt.payment_method = 'zelle' AND coalesce(pt.direction, 'in') = 'in'
      AND NOT (pt.ref_id = ANY (p_exterior_sales))
  LOOP
    -- CP-FIN-004: ACUMULA el nominal USD reclasificado por venta (el resumen
    -- final reporta la suma del universo, no la última venta procesada).
    SELECT v_usd_cash + coalesce(sum(pt.amount), 0) INTO v_usd_cash
    FROM public.payment_transactions pt
    WHERE pt.ref_id = v_sale.sale_id AND pt.payment_method = 'zelle'
      AND pt.ref_type = 'sale' AND coalesce(pt.direction, 'in') = 'in';

    UPDATE public.payment_transactions
      SET payment_method = 'cash',
          notes = CASE WHEN coalesce(notes, '') = ''
                       THEN 'CP-FIN-004: rectificado zelle → cash (efectivo USD — declaración del propietario)'
                       ELSE notes || ' · CP-FIN-004: rectificado zelle → cash (efectivo USD)' END,
          updated_at = now()
      WHERE ref_type = 'sale' AND ref_id = v_sale.sale_id
        AND payment_method = 'zelle' AND coalesce(direction, 'in') = 'in';

    UPDATE public.transactions
      SET cash_amount = coalesce(cash_amount, 0) + coalesce(zelle_amount, 0),
          zelle_amount = 0,
          updated_at = now()
      WHERE id = v_sale.sale_id;

    SELECT CASE WHEN count(DISTINCT pt.payment_method) = 1 THEN min(pt.payment_method) ELSE 'mixed' END
      INTO v_method
    FROM public.payment_transactions pt
    WHERE pt.ref_type = 'sale' AND pt.ref_id = v_sale.sale_id AND coalesce(pt.direction, 'in') = 'in';
    IF v_method IS NOT NULL AND v_method <> '' THEN
      UPDATE public.transactions
        SET payment_method = v_method::public.payment_method_enum, updated_at = now()
      WHERE id = v_sale.sale_id;
    END IF;

    UPDATE public.transaction_items
      SET cash_paid = coalesce(cash_paid, 0) + coalesce(zelle_paid, 0),
          cash_currency = coalesce(cash_currency, zelle_currency),
          zelle_paid = 0, zelle_currency = NULL
    WHERE transaction_id = v_sale.sale_id AND coalesce(zelle_paid, 0) > 0;

    v_n_cash := v_n_cash + 1;
  END LOOP;

  -- ── B2. Headers 'zelle' SIN cobros zelle (M4): ventas pre-corte con
  --        sustancia USD físico registradas CUP@680 en el bucket zelle.
  --        Sin filas de pago → el método del header NO es derivable de
  --        cobros: se fija a 'cash' (efectivo) conforme a la declaración
  --        del propietario (todo cobro USD fue efectivo salvo las 3
  --        declaradas). NO se crean payment_transactions (§5/§6: sin
  --        pagos ni movimientos nuevos; contabilidad invariante — sin
  --        cobros, la re-derivación mantiene ING_VENTAS + diferencia_cobro).
  --        Los pools heredados se mueven al canónico de efectivo. ──
  FOR v_hdr_id IN
    SELECT t.id
    FROM public.transactions t
    WHERE t.store_id = p_store_id
      AND t.payment_method = 'zelle'
      AND NOT (t.id = ANY (p_exterior_sales))
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_transactions pt
        WHERE pt.ref_type = 'sale' AND pt.ref_id = t.id
          AND pt.payment_method = 'zelle' AND coalesce(pt.direction, 'in') = 'in'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_transactions pt2
        WHERE pt2.ref_type = 'sale' AND pt2.ref_id = t.id
          AND pt2.payment_method = 'external_transfer'
          AND coalesce(pt2.direction, 'in') = 'in'
      )
  LOOP
    UPDATE public.transactions
      SET cash_amount = coalesce(cash_amount, 0) + coalesce(zelle_amount, 0),
          zelle_amount = 0,
          updated_at = now()
      WHERE id = v_hdr_id;

    -- Método del header: si la venta tuviera cobros de otro medio, se
    -- re-deriva de ellos; sin cobros → efectivo (declaración del propietario).
    SELECT CASE count(DISTINCT pt.payment_method)
             WHEN 1 THEN min(pt.payment_method)
             WHEN 0 THEN 'cash'
             ELSE 'mixed' END
      INTO v_method
    FROM public.payment_transactions pt
    WHERE pt.ref_type = 'sale' AND pt.ref_id = v_hdr_id AND coalesce(pt.direction, 'in') = 'in';

    UPDATE public.transactions
      SET payment_method = v_method::public.payment_method_enum, updated_at = now()
      WHERE id = v_hdr_id;

    UPDATE public.transaction_items
      SET cash_paid = coalesce(cash_paid, 0) + coalesce(zelle_paid, 0),
          cash_currency = coalesce(cash_currency, zelle_currency),
          zelle_paid = 0, zelle_currency = NULL
    WHERE transaction_id = v_hdr_id AND coalesce(zelle_paid, 0) > 0;

    v_n_hdr := v_n_hdr + 1;
  END LOOP;

  -- ── C. Cobros de trabajos (ref_type='work'): SOLO normalización de
  --      representación zelle → external_transfer (misma cuenta exterior;
  --      los works no generan asientos y están FUERA del alcance declarado,
  --      que cubre ventas). Sin cambio de clasificación contable. ──
  UPDATE public.payment_transactions
    SET payment_method = 'external_transfer',
        notes = CASE WHEN coalesce(notes, '') = ''
                     THEN 'CP-FIN-004: normalización de representación zelle → external_transfer (cobro de trabajo; no es venta)'
                     ELSE notes || ' · CP-FIN-004: representación normalizada a external_transfer' END,
        updated_at = now()
  WHERE store_id = p_store_id AND ref_type = 'work' AND payment_method = 'zelle';
  GET DIAGNOSTICS v_n_works = ROW_COUNT;

  -- ── D. Post-condición fail-closed: cero zelle residual en la tienda ──
  SELECT count(*) INTO v_residual
  FROM public.payment_transactions WHERE store_id = p_store_id AND payment_method = 'zelle';
  SELECT count(*) INTO v_residual_hdr
  FROM public.transactions WHERE store_id = p_store_id AND payment_method = 'zelle';
  IF v_residual > 0 OR v_residual_hdr > 0 THEN
    RAISE EXCEPTION 'ERR_NORMALIZACION_INCOMPLETA: cobros zelle residuales=%, headers residuales=%', v_residual, v_residual_hdr;
  END IF;

  -- ── E. Importes conciliados (nominales USD de la reclasificación) ──
  SELECT coalesce(sum(pt.amount), 0) INTO v_usd_ext
  FROM public.payment_transactions pt
  WHERE pt.store_id = p_store_id AND pt.ref_type = 'sale'
    AND pt.payment_method = 'external_transfer' AND pt.currency = 'USD'
    AND coalesce(pt.direction, 'in') = 'in';

  -- ── F. Auditoría ──
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CP_FIN004_NORMALIZE', 'payment_transactions', p_store_id, p_store_id, p_actor,
    jsonb_build_object(
      'mision', 'CP-FIN-004 (anexo vinculante POS-backend)',
      'evidencia', 'Declaración del propietario: las únicas 3 ventas Zelle identificadas; demás ventas USD en efectivo',
      'exterior_sales', p_exterior_sales,
      'n_ventas_exterior', v_n_ext,
      'n_ventas_efectivo', v_n_cash,
      'n_headers_efectivo_sin_cobros', v_n_hdr,
      'evidencia_headers_sin_cobros', 'headers pre-corte CUP@680 con sustancia USD físico (15.300=22,50 USD; 4.760=7,00 USD @680) — bucket «USD físico → zelle» del importador; sin filas de pago, contabilidad invariante',
      'n_works_representacion', v_n_works,
      'usd_exterior_final', round(v_usd_ext, 2),
      'usd_reclasificados_efectivo', round(v_usd_cash, 2),
      'residual_zelle', v_residual));

  RETURN jsonb_build_object(
    'status', 'OK', 'store_id', p_store_id,
    'n_ventas_exterior', v_n_ext,
    'n_ventas_efectivo', v_n_cash,
    'n_headers_efectivo_sin_cobros', v_n_hdr,
    'n_works_representacion', v_n_works,
    'usd_exterior_final', round(v_usd_ext, 2),
    'usd_reclasificados_efectivo', round(v_usd_cash, 2),
    'residual_zelle', v_residual);
END $function$;

-- ACL re-afirmada (CREATE OR REPLACE la preserva; re-afirmación defensiva e
-- idempotente para el replay de la BD aislada).
REVOKE ALL ON FUNCTION public.cp_fin004_normalize_enervida_payments(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_fin004_normalize_enervida_payments(uuid, uuid[], uuid) TO service_role;
