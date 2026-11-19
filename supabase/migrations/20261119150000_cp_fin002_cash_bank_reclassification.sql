-- ============================================================================
-- CP-FIN-ENERVIDA-CASH-BANK-CLASSIFICATION-AND-BALANCE-RECONCILIATION-001
-- Clasificación efectivo/bancos de la población completa de ENERVIDA y
-- corrección del desequilibrio del Estado de Situación (causa contable real).
-- Fecha: 2026-11-19 · Autor: misión CP-FIN-002 (mandato expreso del
-- propietario §1: «No solicites nuevas autorizaciones intermedias»).
--
-- Esta migración COMPLETA a 20261119130000 (rectificador CP-FIN-001) y
-- contiene:
--
--   1. fin_get_dashboard v2: la ecuación del desequilibrio del Estado de
--      Situación OMITE la clase gasto (solo resta pasivo+patrimonio+ingreso),
--      por lo que reporta −(gastos netos) como «desequilibrio»: para
--      ENERVIDA mostraba −2,425,986.00 CUP mientras el libro está PERFECTO
--      (A − P − Patrimonio − (Ingresos − Gastos) = 0.00, verificado LIVE
--      2026-11-19: A 36,369,905.10 = P 2,961,795.90 + I 35,834,094.99 −
--      G 2,425,985.79; Σ débitos 480,745,318.72 = Σ créditos 480,745,318.72).
--      Se sustituye por la identidad pura de partida doble
--      Σ débitos − Σ créditos = 0 (A + G − P − Patrimonio − I, con activo y
--      gasto débito-normal). NO se crea ajuste artificial alguno: el
--      indicador a cero es el resultado de calcular la identidad contable
--      sobre los mismos movimientos.
--
--   2. fin_reclassify_sale_payment_currency: escritor canónico GENÉRICO de
--      reclasificación de la MONEDA de un cobro ya contabilizado
--      (p. ej. cash/USD → cash/CUP cuando el POS registró el nominal USD
--      equivalente de una venta cobrada en CUP). Complementa a
--      fin_rectify_sale_payment_method (que cambia el MÉTODO y conserva la
--      moneda; este cambia la MONEDA y conserva el método). Patrón RECT-015 /
--      RECT-FIN-E2614F36: asiento RECTIFICACION_FIN compensatorio + corrección
--      de los datos de la operación (payment_transactions + transaction_items)
--      + idempotencia determinista + fail-closed.
--
--   3. ACLs: el nuevo escritor es service_role/postgres exclusivamente.
--
-- Reglas de la misión respetadas: no se alteran ingresos, COGS, inventario,
-- precios, cantidades, saldos ni importes contables históricos; la
-- reclasificación conserva el valor económico total (solo mueve el débito
-- entre cuentas de activo por la moneda REAL del cobro); las migraciones
-- aplicadas son inmutables (esta es una migración NUEVA).
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. fin_get_dashboard v2 — ecuación del desequilibrio con la clase gasto.
--    Cuerpo base = definición LIVE verificada byte-a-byte 2026-11-19
--    (scripts/cpfin002-data/live-fin_get_dashboard.sql, sha256 6356a0fe…).
--    ÚNICA edición: el bloque «v_desbalance» añade el término gasto; el
--    comentario explica la ecuación contable completa.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fin_get_dashboard(p_store_id uuid, p_from date, p_to date, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_ings numeric := 0; v_costo numeric := 0; v_gastos numeric := 0;
  v_efectivo_cup numeric := 0; v_efectivo_usd numeric := 0; v_bancos numeric := 0;
  v_cxc numeric := 0; v_cxp numeric := 0; v_nomina numeric := 0; v_retenc numeric := 0;
  v_inv numeric := 0; v_series jsonb; v_top jsonb;
  v_sin_cfg int; v_errores int; v_desbalance numeric;
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Resultado del período
  SELECT
    coalesce(sum(CASE WHEN c.clase = 'ingreso'
      THEN CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN c.grupo = 'costo_venta'
      THEN CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN c.clase = 'gasto' AND c.grupo <> 'costo_venta'
      THEN CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0)
    INTO v_ings, v_costo, v_gastos
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  JOIN public.fin_categories c ON c.code = m.category_code
  WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to;

  -- Saldos de balance a la fecha final
  SELECT
    coalesce(sum(CASE WHEN m.category_code = 'ACT_EFECTIVO_CUP' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_EFECTIVO_USD' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_BANCOS' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_CXC' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code IN ('PAS_CXP_PROV', 'PAS_SERV_PEND') THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'PAS_NOMINA_PEND' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'PAS_RETENCIONES' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0)
    INTO v_efectivo_cup, v_efectivo_usd, v_bancos, v_cxc, v_cxp, v_nomina, v_retenc
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.economic_date <= p_to;

  -- Valor de inventario (en vivo, del motor de valoración real)
  SELECT coalesce(round(sum(p.stock_current * coalesce(p.cost_average, 0)), 2), 0) INTO v_inv
  FROM public.products p WHERE p.store_id = p_store_id;

  -- Series mensuales
  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.mes), '[]'::jsonb) INTO v_series
  FROM (
    SELECT to_char(date_trunc('month', m.economic_date), 'YYYY-MM') AS mes,
           round(sum(CASE WHEN c.clase = 'ingreso' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2) AS ingresos,
           round(sum(CASE WHEN c.clase = 'gasto' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2) AS gastos
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
    GROUP BY 1
  ) s;

  -- Top gastos
  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.total DESC), '[]'::jsonb) INTO v_top
  FROM (
    SELECT c.code, c.name, round(sum(m.amount_cup), 2) AS total
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
      AND c.clase = 'gasto' AND m.sense = 'debito'
    GROUP BY c.code, c.name
    HAVING sum(m.amount_cup) > 0
    LIMIT 8
  ) s;

  SELECT count(*) INTO v_sin_cfg
  FROM public.fin_document_types dt
  WHERE dt.is_postable AND dt.is_active AND NOT EXISTS (
    SELECT 1 FROM public.fin_rule_versions rv
    WHERE rv.document_type = dt.code AND rv.status = 'active'
      AND (rv.store_id = p_store_id OR rv.store_id IS NULL));
  SELECT count(*) INTO v_errores
  FROM public.fin_posting_errors WHERE store_id = p_store_id AND resolved_at IS NULL;

  -- CP-FIN-002: ecuación contable COMPLETA del libro sin cerrar. La
  -- identidad A + Gastos − (Pasivo + Patrimonio + Ingresos) = 0 colapsa, por
  -- la naturaleza débito-normal de activo y gasto, en la verificación PURA de
  -- partida doble: Σ débitos − Σ créditos = 0 (el resultado acumulado I − G
  -- forma parte del patrimonio). La versión anterior OMITÍA la clase gasto
  -- del lado débito-normal, por lo que el indicador mostraba −(gastos netos)
  -- como «desequilibrio» (ENERVIDA: −2,425,986.00 CUP con el libro PERFECTO:
  -- Σ débitos 480,745,318.72 = Σ créditos 480,745,318.72 — verificación LIVE
  -- 2026-11-19 en el expediente de la misión, §7 del mandato).
  -- NO se crea ajuste artificial alguno: el indicador a cero es el resultado
  -- de calcular la identidad completa sobre los mismos movimientos.
  SELECT coalesce(round(sum(
    CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END), 0), 0)
    INTO v_desbalance
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.economic_date <= p_to;

  RETURN jsonb_build_object(
    'desde', p_from, 'hasta', p_to,
    'kpis', jsonb_build_object(
      'ingresos', round(v_ings, 2), 'costo_ventas', round(v_costo, 2),
      'gastos', round(v_gastos, 2),
      'utilidad_bruta', round(v_ings - v_costo, 2),
      'resultado_neto', round(v_ings - v_costo - v_gastos, 2),
      'efectivo_cup', round(v_efectivo_cup, 2), 'efectivo_usd', round(v_efectivo_usd, 2),
      'bancos', round(v_bancos, 2),
      'cuentas_por_cobrar', round(v_cxc, 2), 'cuentas_por_pagar', round(v_cxp, 2),
      'nomina_pendiente', round(v_nomina, 2), 'retenciones_pendientes', round(v_retenc, 2),
      'inventario_valor', v_inv),
    'series_mensuales', v_series,
    'top_gastos', v_top,
    'alertas', jsonb_build_object(
      'gastos_mayores_que_ingresos', v_gastos + v_costo > v_ings AND v_ings > 0,
      'desequilibrio_balance', abs(v_desbalance) > 0.01,
      'desequilibrio_monto', round(v_desbalance, 2),
      'tipos_sin_configurar', v_sin_cfg,
      'errores_contabilizacion', v_errores));
END $function$
;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. fin_reclassify_sale_payment_currency — escritor canónico de
--    RECLASIFICACIÓN DE MONEDA de un cobro ya contabilizado.
--
--    Caso de uso autorizado por el propietario (mandato §3 y §16): ventas
--    CUP-dominadas cuyo cobro el POS registró como nominal USD equivalente
--    («Efectivo + USD» con el valor convertido); el dinero entregado fue CUP
--    y la cuenta financiera correcta es Efectivo en caja CUP. La moneda del
--    registro NO puede sustituir al hecho físico: la venta fue facturada en
--    CUP (sale_currency='CUP', total en CUP) y el propietario confirma que el
--    medio fue efectivo CUP.
--
--    Efectos (en UNA transacción, patrón RECT-015):
--      a) Asiento RECTIFICACION_FIN compensatorio y equilibrado:
--         crédito a la categoría origen (p. ej. ACT_EFECTIVO_USD) y débito a
--         la categoría destino (p. ej. ACT_EFECTIVO_CUP) por el MISMO importe
--         contable CUP — el valor económico total se conserva.
--      b) Corrección de los datos de la operación (Historial de Ventas y
--         futuras re-publicaciones del motor):
--           · payment_transactions: currency = moneda real; para CUP
--             exchange_rate=1 y amount=amount_cup (el importe REAL entregado).
--           · transaction_items: nominales <metodo>_paid convertidos a la
--             moneda real con la tasa DOCUMENTAL reconstruida SOLO desde
--             evidencia (tasa registrada del pago o v_cup/nominal del propio
--             documento); sin invención de tasas (mandato §12/§7.4).
--      c) Traza completa: asiento y movimiento originales, tasas, causa,
--         misión; amount_origin/currency_origin explícitos en ambos lados.
--
--    Idempotencia determinista por (venta, método, moneda_origen): una segunda
--    ejecución devuelve YA_APLICADO y no crea otro asiento.
--
--    Fail-closed: exige venta completed, EXACTAMENTE un débito del cobro en la
--    categoría origen del reconocimiento VENTA, coherencia exacta con los
--    pagos registrados (o el caso documentado «asiento obsoleto» con el pago
--    ya en la moneda destino), categorías existentes y monedas soportadas.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fin_reclassify_sale_payment_currency(
  p_sale_id uuid,
  p_metodo text,
  p_moneda_desde text,
  p_moneda_hacia text,
  p_actor uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_sale public.transactions%ROWTYPE;
  v_from_cat text; v_to_cat text;
  v_metodo text := lower(btrim(coalesce(p_metodo, '')));
  v_cur_from text := upper(btrim(coalesce(p_moneda_desde, '')));
  v_cur_to   text := upper(btrim(coalesce(p_moneda_hacia, '')));
  v_cup numeric := 0;
  v_nom numeric := NULL;            -- nominal registrado en la moneda origen (evidencia de pagos)
  v_rate_reg numeric := NULL;       -- tasa REGISTRADA en los pagos origen
  v_nom_items numeric := 0;         -- Σ nominales de ítems en la moneda origen
  v_cup_pagos_to numeric := 0;      -- Σ amount_cup de pagos del método ya en la moneda destino
  v_r_doc numeric := NULL;          -- tasa documental reconstruida (evidencia)
  v_orig_entry_id uuid;
  v_orig_mov_id uuid;
  v_new_entry_id uuid;
  v_date date;
  v_docnum text;
  v_count int;
  v_col_paid text; v_col_cur text;
  v_stale boolean := false;
BEGIN
  -- a) Validaciones de entrada (fail-closed; monedas de caja soportadas por
  --    el plan contable REAL: ACT_EFECTIVO_CUP y ACT_EFECTIVO_USD).
  IF v_metodo NOT IN ('cash', 'transfer', 'zelle') THEN
    RAISE EXCEPTION 'ERR_METHOD_NOT_SUPPORTED: % (cash/transfer/zelle)', v_metodo;
  END IF;
  IF v_cur_from NOT IN ('CUP', 'USD') OR v_cur_to NOT IN ('CUP', 'USD') THEN
    RAISE EXCEPTION 'ERR_CURRENCY_NOT_SUPPORTED: % → % (solo CUP/USD; el plan contable no define cajas EUR/MLC)', v_cur_from, v_cur_to;
  END IF;
  IF v_cur_from = v_cur_to THEN
    RAISE EXCEPTION 'ERR_SAME_CURRENCY: %', v_cur_from;
  END IF;

  v_from_cat := CASE
    WHEN v_metodo = 'cash' AND v_cur_from = 'CUP' THEN 'ACT_EFECTIVO_CUP'
    WHEN v_metodo = 'cash' AND v_cur_from = 'USD' THEN 'ACT_EFECTIVO_USD'
    WHEN v_metodo IN ('transfer', 'zelle')        THEN 'ACT_BANCOS'
  END;
  v_to_cat := CASE
    WHEN v_metodo = 'cash' AND v_cur_to = 'CUP' THEN 'ACT_EFECTIVO_CUP'
    WHEN v_metodo = 'cash' AND v_cur_to = 'USD' THEN 'ACT_EFECTIVO_USD'
    WHEN v_metodo IN ('transfer', 'zelle')      THEN 'ACT_BANCOS'
  END;
  IF v_from_cat IS NULL OR v_to_cat IS NULL THEN
    RAISE EXCEPTION 'ERR_CATEGORY_UNMAPPED: % % → %', v_metodo, v_cur_from, v_cur_to;
  END IF;
  IF v_from_cat = v_to_cat THEN
    RAISE EXCEPTION 'ERR_SAME_FINANCIAL_CATEGORY: % % → % ambas imputan % (sin efecto contable que rectificar)', v_metodo, v_cur_from, v_cur_to, v_to_cat;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_categories
                 WHERE code = v_to_cat AND is_active) THEN
    RAISE EXCEPTION 'ERR_TARGET_CATEGORY_MISSING: % no existe/activa en el catálogo', v_to_cat;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('fin:reclassmon:' || p_sale_id::text));

  -- b) Idempotencia determinista por (venta, método, moneda_origen).
  IF EXISTS (
    SELECT 1
    FROM public.fin_entries e
    JOIN public.fin_movements m ON m.entry_id = e.id
    WHERE e.document_type = 'RECTIFICACION_FIN'
      AND e.document_id = p_sale_id
      AND e.status = 'posted'
      AND m.traza ->> 'origen' = 'reclasificacion_moneda_cobro'
      AND m.traza ->> 'metodo' = v_metodo
      AND m.traza ->> 'moneda_desde' = v_cur_from
  ) THEN
    RETURN jsonb_build_object('status', 'YA_APLICADO', 'sale_id', p_sale_id,
      'metodo', v_metodo, 'moneda_desde', v_cur_from, 'moneda_hacia', v_cur_to);
  END IF;

  SELECT * INTO v_sale FROM public.transactions WHERE id = p_sale_id;
  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'ERR_SALE_NOT_FOUND: %', p_sale_id;
  END IF;
  IF v_sale.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_SALE_NOT_COMPLETED: status=% (solo ventas completed son rectificables)', v_sale.status;
  END IF;

  -- c) Movimiento ORIGINAL del cobro: EXACTAMENTE un débito en la categoría
  --    origen dentro del reconocimiento VENTA posted de la venta.
  SELECT count(*) INTO v_count
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE e.document_type = 'VENTA' AND e.document_id = p_sale_id
    AND e.event = 'reconocimiento' AND e.status = 'posted'
    AND m.category_code = v_from_cat AND m.sense = 'debito';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'ERR_COB_MOVEMENT_NOT_FOUND: sin débito % en el reconocimiento de % (¿ya rectificado con otra moneda?)', v_from_cat, p_sale_id;
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION 'ERR_AMBIGUOUS_COB_MOVEMENT: % débitos % en el reconocimiento de % (no desambiguable)', v_count, v_from_cat, p_sale_id;
  END IF;
  SELECT m.entry_id, m.id, m.amount_cup INTO v_orig_entry_id, v_orig_mov_id, v_cup
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE e.document_type = 'VENTA' AND e.document_id = p_sale_id
    AND e.event = 'reconocimiento' AND e.status = 'posted'
    AND m.category_code = v_from_cat AND m.sense = 'debito';
  IF coalesce(v_cup, 0) <= 0 THEN
    RAISE EXCEPTION 'ERR_ZERO_AMOUNT: débito original = % CUP', v_cup;
  END IF;

  -- d) Coherencia con los pagos registrados (fuente primaria del cobro).
  SELECT count(*), coalesce(sum(amount), 0), min(exchange_rate)
    INTO v_count, v_nom, v_rate_reg
  FROM public.payment_transactions
  WHERE ref_type = 'sale' AND ref_id = p_sale_id
    AND payment_method = v_metodo AND currency = v_cur_from
    AND coalesce(direction, 'in') = 'in';
  IF v_count > 0 THEN
    -- Pagos en la moneda origen: su Σ amount_cup debe explicar EXACTAMENTE el
    -- débito contable a reclasificar (±0.01).
    IF abs(coalesce((SELECT sum(amount_cup) FROM public.payment_transactions
                     WHERE ref_type = 'sale' AND ref_id = p_sale_id
                       AND payment_method = v_metodo AND currency = v_cur_from
                       AND coalesce(direction, 'in') = 'in'), 0) - v_cup) > 0.01 THEN
      RAISE EXCEPTION 'ERR_INCOHERENT_PAGOS: Σ amount_cup pagos %/% (%) ≠ débito contable (%)', v_metodo, v_cur_from,
        (SELECT sum(amount_cup) FROM public.payment_transactions
         WHERE ref_type = 'sale' AND ref_id = p_sale_id
           AND payment_method = v_metodo AND currency = v_cur_from
           AND coalesce(direction, 'in') = 'in'), v_cup;
    END IF;
    IF coalesce(v_nom, 0) > 0 THEN
      v_r_doc := round(v_cup / v_nom, 6);  -- tasa documental desde evidencia (pago registrado)
    END IF;
  ELSE
    -- Caso «asiento obsoleto» (p. ej. 28e94349: el asiento fue publicado por
    -- una versión anterior del motor con reparto por ítems y el pago ya está
    -- registrado en la moneda destino): se exige que exista cobro del método
    -- en la moneda destino y que el débito origen sea explicable por los
    -- nominales de los ítems (tasa documental = débito / Σ nominales).
    v_stale := true;
    SELECT coalesce(sum(amount_cup), 0) INTO v_cup_pagos_to
    FROM public.payment_transactions
    WHERE ref_type = 'sale' AND ref_id = p_sale_id
      AND payment_method = v_metodo AND currency = v_cur_to
      AND coalesce(direction, 'in') = 'in';
    IF v_cup_pagos_to <= 0 THEN
      RAISE EXCEPTION 'ERR_STALE_WITHOUT_TARGET_PAYMENT: sin pagos %/% ni %/% para %', v_metodo, v_cur_from, v_metodo, v_cur_to, p_sale_id;
    END IF;
    v_nom := NULL;
  END IF;

  -- Nominales de ítems en la moneda origen (para normalización de datos).
  v_col_paid := v_metodo || '_paid';
  v_col_cur  := v_metodo || '_currency';
  EXECUTE format(
    'SELECT coalesce(sum(%I), 0) FROM public.transaction_items WHERE transaction_id = $1 AND %I = $2 AND coalesce(%I, 0) > 0',
    v_col_paid, v_col_cur, v_col_paid)
  INTO v_nom_items
  USING p_sale_id, v_cur_from;

  IF v_stale THEN
    IF v_nom_items <= 0 THEN
      RAISE EXCEPTION 'ERR_STALE_WITHOUT_ITEM_NOMINALS: caso asiento obsoleto sin nominales de ítems % en % (no reconstruible)', v_metodo, v_cur_from;
    END IF;
    v_r_doc := round(v_cup / v_nom_items, 6);
  END IF;

  -- e) Documento de rectificación (determinista por venta+método+moneda).
  v_date   := v_sale.created_at::date;
  v_docnum := 'RECT-MON-' || upper(substr(p_sale_id::text, 1, 8)) || '-' || v_metodo || '-' || v_cur_from;

  INSERT INTO public.fin_entries (
    store_id, document_type, document_id, document_number, event, payment_ref,
    economic_date, posted_at, rule_version_id, movements_snapshot, description, created_by, status)
  VALUES (
    v_sale.store_id, 'RECTIFICACION_FIN', p_sale_id, v_docnum, 'ajuste_manual', NULL,
    v_date, now(), NULL, NULL,
    v_docnum || ': reclasificación de la MONEDA del cobro de la venta ' || substr(p_sale_id::text, 1, 8)
      || ' — registrado ' || v_metodo || '/' || v_cur_from || ', moneda real ' || v_cur_to
      || ' · venta facturada en ' || coalesce(v_sale.sale_currency, 'CUP')
      || coalesce(' · cobro contable ' || trim(to_char(v_cup, 'FM999999999999990.00')) || ' CUP', '')
      || coalesce(' · tasa documental ' || trim(to_char(v_r_doc, 'FM999999999999990.000000')), '')
      || ' (moneda real del cobro según evidencia primaria y mandato del propietario).'
      || ' Ref asiento original ' || v_orig_entry_id::text || ' · movimiento ' || v_orig_mov_id::text
      || coalesce(' · causa: ' || p_reason, '')
      || ' · expediente CP-FIN-ENERVIDA-CASH-BANK-CLASSIFICATION-AND-BALANCE-RECONCILIATION-001.',
    coalesce(p_actor, v_sale.seller_id), 'posted')
  RETURNING id INTO v_new_entry_id;

  -- f) Movimientos compensatorios (equilibrados; valor económico íntegro).
  INSERT INTO public.fin_movements (
    entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
    economic_date, document_number, description, traza,
    currency_origin, amount_origin)
  VALUES (
    v_new_entry_id, v_sale.store_id, v_from_cat, 'credito', round(v_cup, 2), 'CUP', 1,
    v_date, v_docnum,
    'Contrapartida: retiro del cobro clasificado en ' || v_from_cat || ' (' || v_metodo || '/' || v_cur_from || ')',
    jsonb_build_object(
      'rect', v_docnum, 'mision', 'CP-FIN-002',
      'origen', 'reclasificacion_moneda_cobro',
      'metodo', v_metodo, 'moneda_desde', v_cur_from, 'moneda_hacia', v_cur_to,
      'tasa_documental', v_r_doc, 'caso', CASE WHEN v_stale THEN 'asiento_obsoleto' ELSE 'pagos_registrados' END,
      'ref_entry', v_orig_entry_id, 'ref_mov', v_orig_mov_id,
      'reason', p_reason),
    v_cur_from, v_nom);

  INSERT INTO public.fin_movements (
    entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
    economic_date, document_number, description, traza,
    currency_origin, amount_origin)
  VALUES (
    v_new_entry_id, v_sale.store_id, v_to_cat, 'debito', round(v_cup, 2), 'CUP', 1,
    v_date, v_docnum,
    'Cobro real en ' || v_to_cat || ' (' || v_metodo || ') reclasificado a ' || v_to_cat
      || ' (venta ' || substr(p_sale_id::text, 1, 8) || ')',
    jsonb_build_object(
      'rect', v_docnum, 'mision', 'CP-FIN-002',
      'origen', 'reclasificacion_moneda_cobro',
      'metodo', v_metodo, 'moneda_desde', v_cur_from, 'moneda_hacia', v_cur_to,
      'tasa_documental', v_r_doc, 'caso', CASE WHEN v_stale THEN 'asiento_obsoleto' ELSE 'pagos_registrados' END,
      'ref_entry', v_orig_entry_id, 'ref_mov', v_orig_mov_id,
      'reason', p_reason),
    v_cur_to,
    CASE WHEN v_cur_to = 'CUP' THEN round(v_cup, 2)
         WHEN v_r_doc IS NOT NULL AND v_r_doc > 0 THEN round(v_cup / v_r_doc, 2)
         ELSE NULL END);

  -- g) Corrección de los datos de la operación (Historial de Ventas y motor).
  IF v_count > 0 THEN
    UPDATE public.payment_transactions
    SET currency = v_cur_to,
        exchange_rate = CASE WHEN v_cur_to = 'CUP' THEN 1.0 ELSE exchange_rate END,
        amount = CASE WHEN v_cur_to = 'CUP' THEN round(amount_cup, 2) ELSE amount END,
        notes = CASE WHEN coalesce(notes, '') = ''
                     THEN 'Rectificado ' || v_metodo || '/' || v_cur_from || ' → ' || v_cur_to
                     ELSE notes || ' · Rectificado ' || v_metodo || '/' || v_cur_from || ' → ' || v_cur_to END,
        updated_at = now()
    WHERE ref_type = 'sale' AND ref_id = p_sale_id
      AND payment_method = v_metodo AND currency = v_cur_from
      AND coalesce(direction, 'in') = 'in';
  END IF;

  IF v_r_doc IS NOT NULL AND v_r_doc > 0 AND v_nom_items > 0 THEN
    EXECUTE format(
      'UPDATE public.transaction_items SET %I = round(%I * $2, 2), %I = $3 WHERE transaction_id = $1 AND %I = $4 AND coalesce(%I, 0) > 0',
      v_col_paid, v_col_paid, v_col_cur, v_col_cur, v_col_paid)
    USING p_sale_id, v_r_doc, v_cur_to, v_cur_from;
  END IF;

  RETURN jsonb_build_object(
    'status', 'OK', 'sale_id', p_sale_id, 'entry_id', v_new_entry_id,
    'docnum', v_docnum, 'importe_cup', round(v_cup, 2),
    'metodo', v_metodo, 'moneda_desde', v_cur_from, 'moneda_hacia', v_cur_to,
    'tasa_documental', v_r_doc, 'caso', CASE WHEN v_stale THEN 'asiento_obsoleto' ELSE 'pagos_registrados' END,
    'from_category', v_from_cat, 'to_category', v_to_cat,
    'nominal_items_normalizados', v_nom_items);
END $function$
;

REVOKE EXECUTE ON FUNCTION public.fin_reclassify_sale_payment_currency(uuid, text, text, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fin_reclassify_sale_payment_currency(uuid, text, text, text, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_reclassify_sale_payment_currency(uuid, text, text, text, uuid, text) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Guardas de cuerpo (fail-closed al aplicar).
-- ═══════════════════════════════════════════════════════════════════════════
DO $guard$
DECLARE
  v_n int := 0;
  v_pat_gasto text := 'CASE WHEN m.sense=' || chr(39) || 'debito' || chr(39) || ' THEN m.amount_cup ELSE -m.amount_cup END), 0), 0)';
BEGIN
  -- fin_get_dashboard: la ecuación debe CONTENER la identidad pura de
  -- partida doble (Σ débitos − Σ créditos) sobre TODAS las clases.
  SELECT count(*) INTO v_n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fin_get_dashboard'
    AND pg_get_functiondef(p.oid) LIKE '%' || v_pat_gasto || '%';
  IF v_n < 1 THEN RAISE EXCEPTION 'CP-FIN-002-GUARD: fin_get_dashboard sin la identidad pura de partida doble'; END IF;

  -- fin_reclassify_sale_payment_currency: existe con traza e idempotencia.
  SELECT count(*) INTO v_n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fin_reclassify_sale_payment_currency'
    AND pg_get_functiondef(p.oid) LIKE '%reclasificacion_moneda_cobro%'
    AND pg_get_functiondef(p.oid) LIKE '%YA_APLICADO%'
    AND pg_get_functiondef(p.oid) LIKE '%ERR_INCOHERENT_PAGOS%';
  IF v_n < 1 THEN RAISE EXCEPTION 'CP-FIN-002-GUARD: fin_reclassify_sale_payment_currency incompleto'; END IF;

  -- ACL: el escritor NO debe ser ejecutable por anon ni authenticated.
  SELECT count(*) INTO v_n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fin_reclassify_sale_payment_currency'
    AND (p.proacl IS NULL OR 'anon' = ANY(p.proacl::text[]) OR 'authenticated' = ANY(p.proacl::text[]));
  IF v_n > 0 THEN RAISE EXCEPTION 'CP-FIN-002-GUARD: ACL del escritor de reclasificación no restringido a service_role'; END IF;
END
$guard$;
