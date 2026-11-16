-- =====================================================================================
-- READONLY_SQL_QUERIES · CP-FIN-POST-RECTIFICATION-INDEPENDENT-CERTIFICATION-012
-- Auditoría independiente post-RECT-011 de FAC-VITALLCONS-001 (receipt_id fd9d6c88-…-8bc96cc93e63)
--
-- · TODAS las consultas son SELECT/WITH puros: NINGUNA escritura (guard CP-INFRA-020 por consulta).
-- · Canal: Management API /database/query contra producción wthkddeleylijmonclxg con ALLOW_PROD=read-only.
-- · Guards: CP-INFRA-019 (assert-not-production, modo read), guard de ref de proyecto, guard anti-escritura.
-- · Ejecutadas 2026-11-16 21:27–21:40 UTC · 67 consultas · producción INTACTA (ver m077 --verify 18/18 y snapshot).
-- · Sustituir :FVC / :STORE por los literales si se re-ejecutan a mano (ya vienen interpolados abajo).
-- =====================================================================================

-- ─────────────────────────────────────────────────────────────────────────────────────
-- M080 · Extracción integral (53 consultas RO)  (m080-cert-012-extract.mjs)
-- ─────────────────────────────────────────────────────────────────────────────────────

-- [tiempo]
SELECT now() AT TIME ZONE 'UTC' AS utc, current_setting('TimeZone') AS tz,
    now() AS server_now, to_char(now() AT TIME ZONE 'America/Havana','YYYY-MM-DD HH24:MI:SS') AS havana

-- [receipt]
SELECT row_to_json(r) AS fila FROM public.receipts r WHERE r.id='${FVC}'

-- [lineas_101]
SELECT ri.id AS line_id, ri.product_id, p.sku, p.name, ri.quantity,
    ri.unit_cost, ri.moneda_recepcion, ri.tasa_cambio_recepcion,
    (ri.unit_cost*ri.tasa_cambio_recepcion*ri.quantity) AS subtotal_cup,
    p.price AS precio_venta, p.cost_average AS wac_actual, p.stock_current AS stock_actual, p.is_service,
    ri.created_at, ri.updated_at
  FROM public.receipt_items ri JOIN public.products p ON p.id=ri.product_id
  WHERE ri.receipt_id='${FVC}' ORDER BY NULLIF(regexp_replace(p.sku,'\\D','','g'),'')::bigint NULLS LAST, p.sku

-- [capas_fvc]
SELECT sm.id AS capa_id, sm.product_id, p.sku, sm.quantity_change, sm.unit_cost,
    sm.created_at, sm.movement_date, sm.store_id
  FROM public.stock_movements sm JOIN public.products p ON p.id=sm.product_id
  WHERE sm.reference_id='${FVC}' AND sm.movement_type='purchase' ORDER BY sm.id

-- [capas_duplicadas]
SELECT product_id, count(*)::int AS n
  FROM public.stock_movements WHERE reference_id='${FVC}' AND movement_type='purchase'
  GROUP BY product_id HAVING count(*)>1

-- [movs_fvc_no_compra]
SELECT id, product_id, movement_type, quantity_change, unit_cost, created_at
  FROM public.stock_movements WHERE reference_id='${FVC}' AND movement_type<>'purchase'

-- [movs_fvc_tipos]
SELECT movement_type, count(*)::int AS n,
    coalesce(sum(quantity_change*unit_cost),0) AS valor
  FROM public.stock_movements WHERE reference_id='${FVC}' GROUP BY 1 ORDER BY 1

-- [sku999]
SELECT p.id AS product_id, p.sku, p.name, p.is_service, p.operational_class, p.cost_average AS wac,
    p.stock_current AS stock,
    (SELECT count(*)::int FROM public.stock_movements sm WHERE sm.product_id=p.id AND sm.reference_id='${FVC}') AS capas_fvc,
    (SELECT coalesce(sum(sm.quantity_change),0) FROM public.stock_movements sm WHERE sm.product_id=p.id) AS saldo_kardex,
    (SELECT count(*)::int FROM public.stock_movements sm WHERE sm.product_id=p.id AND sm.movement_type<>'purchase') AS movs_no_compra
  FROM public.products p WHERE p.sku='999'

-- [kardex_101]
SELECT sm.id, sm.product_id, sm.movement_type, sm.quantity_change, sm.unit_cost,
    sm.created_at, sm.reference_id, sm.store_id
  FROM public.stock_movements sm
  WHERE sm.product_id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')
  ORDER BY sm.created_at, sm.id

-- [kardex_hash]
SELECT md5(string_agg(sm.id || '|' || sm.unit_cost, ',' ORDER BY sm.id)) AS h,
    count(*)::int AS n FROM public.stock_movements sm
  WHERE sm.product_id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')

-- [valoracion_101]
SELECT sm.product_id, p.sku,
    coalesce(sum(sm.quantity_change),0) AS qty_actual,
    coalesce(sum(sm.quantity_change*sm.unit_cost),0) AS valor_actual,
    CASE WHEN coalesce(sum(sm.quantity_change),0)<>0
      THEN coalesce(sum(sm.quantity_change*sm.unit_cost),0)/sum(sm.quantity_change) END AS wac_recalculado,
    p.cost_average AS wac_registrado, p.stock_current AS stock_campo
  FROM public.stock_movements sm JOIN public.products p ON p.id=sm.product_id
  WHERE sm.product_id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')
  GROUP BY sm.product_id, p.sku, p.cost_average, p.stock_current ORDER BY p.sku

-- [capas_otras_25]
SELECT sm.product_id, p.sku, sm.reference_id, r.reference_doc,
    sm.quantity_change, sm.unit_cost, sm.created_at
  FROM public.stock_movements sm
  JOIN public.products p ON p.id=sm.product_id
  LEFT JOIN public.receipts r ON r.id::text=sm.reference_id
  WHERE sm.movement_type='purchase' AND sm.reference_id<>'${FVC}'
    AND sm.product_id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')
  ORDER BY p.sku, sm.created_at

-- [capas_uc_ne1]
SELECT count(*)::int AS n,
    coalesce(sum(quantity_change*unit_cost),0) AS valor,
    count(*) FILTER (WHERE reference_id='${FVC}')::int AS del_fvc
  FROM public.stock_movements WHERE movement_type='purchase' AND unit_cost<>1

-- [wac_log_mision]
SELECT id, product_id, wac_before, wac_after, source_ref, changed_by, created_at
  FROM public.wac_change_log WHERE id::text LIKE '7ec9000b-%' ORDER BY created_at

-- [wac_log_otros]
SELECT count(*)::int AS n FROM public.wac_change_log
  WHERE created_at > '${WIN_START}' AND id::text NOT LIKE '7ec9000b-%'

-- [asientos_fvc]
SELECT id, store_id, document_type, document_id, document_number, event,
    payment_ref, status, reversal_of, posted_at, economic_date, created_by, description
  FROM public.fin_entries WHERE document_id='${FVC}' ORDER BY posted_at

-- [movs_asientos_fvc]
SELECT fm.id, fm.entry_id, fm.category_code, fm.sense,
    fm.amount, fm.amount_cup, fm.currency_origin, fm.description, fm.document_number,
    fm.economic_date, fm.created_at, fm.store_id
  FROM public.fin_movements fm WHERE fm.entry_id IN (SELECT id FROM public.fin_entries WHERE document_id='${FVC}')
  ORDER BY fm.entry_id, fm.category_code, fm.sense

-- [balance_asientos]
SELECT e.id, e.event, e.status, count(fm.id)::int AS movs,
    coalesce(sum(CASE WHEN fm.sense='debito' THEN fm.amount_cup ELSE -fm.amount_cup END),0) AS diff_cup,
    coalesce(sum(CASE WHEN fm.sense='debito' THEN fm.amount ELSE -fm.amount END),0) AS diff_moneda
  FROM public.fin_entries e LEFT JOIN public.fin_movements fm ON fm.entry_id=e.id
  WHERE e.document_id='${FVC}' GROUP BY e.id, e.event, e.status ORDER BY min(e.posted_at)

-- [reversal_of]
SELECT id, event, reversal_of, status FROM public.fin_entries
  WHERE reversal_of IN ('${ORIG}','${RECT1}','${RECT2}','${E011}') OR id IN ('${ORIG}','${RECT1}','${RECT2}','${E011}')
  ORDER BY posted_at

-- [anulaciones]
SELECT id, event, document_id, reversal_of, status, posted_at
  FROM public.fin_entries WHERE document_id='${FVC}'
    AND (event ILIKE '%anul%' OR event ILIKE '%reverse%' OR event ILIKE '%cancel%')

-- [auditoria_rect]
SELECT action, trace_id, count(*)::int AS n,
    min(created_at) AS primera, max(created_at) AS ultima
  FROM public.audit_logs WHERE action LIKE 'SYSTEM_RECT%' GROUP BY 1,2 ORDER BY 1,2

-- [auditoria_asientos]
SELECT count(*)::int AS n FROM public.audit_logs
  WHERE (old_data::text LIKE '%${E011}%' OR new_data::text LIKE '%${E011}%')

-- [categorias]
SELECT code, name, clase, grupo, sort_order FROM public.fin_categories ORDER BY sort_order

-- [saldos_categorias]
SELECT c.code, c.name, c.clase, c.grupo,
    count(DISTINCT m.entry_id)::int AS movimientos,
    round(CASE WHEN c.clase IN ('activo','gasto')
      THEN coalesce(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),0)
      ELSE coalesce(sum(CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END),0) END, 2) AS saldo
  FROM public.fin_categories c
  LEFT JOIN public.fin_movements m ON m.category_code=c.code AND m.store_id='${STORE}'
  GROUP BY c.code, c.name, c.clase, c.grupo, c.sort_order ORDER BY c.sort_order

-- [libro_mayor]
SELECT m.id, m.entry_id, e.event, e.document_type, e.document_id,
    e.status, m.category_code, m.sense, m.amount, m.amount_cup, m.economic_date, e.posted_at, m.created_at
  FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
  WHERE m.store_id='${STORE}' AND m.category_code IN
    ('ACT_INVENTARIO','PAS_CXP_PROV','GAS_COSTO_VENTAS','GAS_VALES','GAS_PERDIDA_INV')
  ORDER BY m.created_at, m.id`, 0) || [];

// Paginación defensiva si el libro mayor es enorme (no esperado, pero RO seguro)
if (out.libro_mayor_cuentas.length >= 4900) {
  let offset = out.libro_mayor_cuentas.length;
  for (let i = 0; i < 10; i++) {
    const more = await run(`libro_mayor_pag${i}`, `SELECT m.id, m.entry_id, e.event, e.document_type, e.document_id,
      e.status, m.category_code, m.sense, m.amount, m.amount_cup, m.economic_date, e.posted_at, m.created_at
      FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
      WHERE m.store_id='${STORE}' AND m.category_code IN
        ('ACT_INVENTARIO','PAS_CXP_PROV','GAS_COSTO_VENTAS','GAS_VALES','GAS_PERDIDA_INV')
      ORDER BY m.created_at, m.id LIMIT 2000 OFFSET ${offset}

-- [cxp_por_doc]
SELECT e.document_id, e.document_type, e.event,
    coalesce(sum(CASE WHEN fm.sense='credito' THEN fm.amount_cup ELSE -fm.amount_cup END),0) AS neto_cxp,
    count(*)::int AS movs
  FROM public.fin_movements fm JOIN public.fin_entries e ON e.id=fm.entry_id
  WHERE fm.store_id='${STORE}' AND fm.category_code='PAS_CXP_PROV'
  GROUP BY e.document_id, e.document_type, e.event ORDER BY neto_cxp DESC

-- [asientos_desde_ventana]
SELECT id, event, document_type, document_id, store_id,
    status, posted_at
  FROM public.fin_entries WHERE posted_at > '${WIN_START}' ORDER BY posted_at

-- [acceso_tienda]
SELECT user_id, role FROM public.user_store_memberships
  WHERE store_id='${STORE}' ORDER BY role LIMIT 10

-- [rpc_balance]
SELECT public.fin_get_balance_sheet('${STORE}','2026-11-17','${owner.user_id}') AS bs

-- [rpc_income]
SELECT public.fin_get_income_statement('${STORE}','2026-11-01','2026-11-17','${owner.user_id}') AS inc

-- [rpc_ledger_inv]
SELECT public.fin_get_category_detail('${STORE}','ACT_INVENTARIO','2026-11-01','2026-11-17',500,0,'${owner.user_id}') AS led

-- [rpc_ledger_cxp]
SELECT public.fin_get_category_detail('${STORE}','PAS_CXP_PROV','2026-11-01','2026-11-17',500,0,'${owner.user_id}') AS led

-- [valoracion_tienda]
SELECT count(*)::int AS productos_con_stock,
    coalesce(sum(p.stock_current*p.cost_average),0) AS valor_campo,
    coalesce(sum(v.qty*v.val),0) AS valor_kardex
  FROM public.products p
  LEFT JOIN (SELECT product_id, sum(quantity_change) AS qty, sum(quantity_change*unit_cost) AS val
             FROM public.stock_movements GROUP BY product_id) v ON v.product_id=p.id
  WHERE p.store_id='${STORE}' AND p.is_service=false AND coalesce(p.stock_current,0)<>0

-- [post_movs_101]
SELECT sm.id, sm.product_id, p.sku, sm.movement_type,
    sm.quantity_change, sm.unit_cost, sm.created_at, sm.reference_id
  FROM public.stock_movements sm JOIN public.products p ON p.id=sm.product_id
  WHERE sm.product_id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')
    AND sm.created_at > '${EXEC_END}'
  ORDER BY sm.created_at

-- [post_tx_items]
SELECT ti.id, ti.product_id, p.sku, ti.quantity,
    ti.cost_at_sale AS costo_registrado, ti.price_at_sale, ti.price_at_sale_cup, ti.created_at,
    t.id AS tx_id, t.created_at AS tx_fecha, t.status
  FROM public.transaction_items ti
  JOIN public.products p ON p.id=ti.product_id
  LEFT JOIN public.transactions t ON t.id=ti.transaction_id
  WHERE ti.product_id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')
    AND ti.created_at > '${EXEC_END}' ORDER BY ti.created_at

-- [post_vales]
SELECT isi.id, isi.product_id, p.sku, isi.quantity, isi.unit_cost,
    isi.created_at, is2.id AS vale_id, is2.slip_number, is2.created_at AS vale_fecha, is2.status
  FROM public.issue_slip_items isi
  JOIN public.products p ON p.id=isi.product_id
  LEFT JOIN public.issue_slips is2 ON is2.id=isi.slip_id
  WHERE isi.product_id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')
    AND isi.created_at > '${EXEC_END}' ORDER BY isi.created_at

-- [updated_at_lineas]
SELECT min(updated_at) AS primera, max(updated_at) AS ultima,
    count(*)::int AS n, count(*) FILTER (WHERE updated_at BETWEEN '${EXEC_START}' AND '${EXEC_END}')::int AS en_ventana,
    count(*) FILTER (WHERE updated_at < '${EXEC_START}')::int AS antes,
    count(*) FILTER (WHERE updated_at > '${EXEC_END}')::int AS despues
  FROM public.receipt_items WHERE receipt_id='${FVC}'

-- [capas_creadas_post]
SELECT count(*)::int AS n,
    count(*) FILTER (WHERE created_at BETWEEN '${EXEC_START}' AND '${EXEC_END}')::int AS en_ventana
  FROM public.stock_movements WHERE reference_id='${FVC}' AND movement_type='purchase'

-- [int_otras_cabeceras]
SELECT count(*)::int AS n
  FROM public.receipts WHERE id<>'${FVC}' AND updated_at > '${WIN_START}'

-- [int_otras_lineas]
SELECT count(*)::int AS n
  FROM public.receipt_items WHERE receipt_id<>'${FVC}' AND updated_at > '${WIN_START}'

-- [int_productos_ajenos]
SELECT count(*)::int AS n
  FROM public.products WHERE updated_at > '${WIN_START}'
    AND id NOT IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')

-- [int_otros_movs]
SELECT count(*)::int AS n,
    count(*) FILTER (WHERE store_id<>'${STORE}')::int AS otras_tiendas
  FROM public.stock_movements WHERE created_at > '${WIN_START}'

-- [int_otras_tiendas_asientos]
SELECT count(*)::int AS n
  FROM public.fin_entries WHERE posted_at > '${WIN_START}' AND store_id<>'${STORE}'

-- [int_auditoria]
SELECT trace_id, action, count(*)::int AS n, max(created_at) AS ultima
  FROM public.audit_logs WHERE created_at > '${WIN_START}' GROUP BY 1,2 ORDER BY 3 DESC LIMIT 50

-- [proveedores]
SELECT id, name FROM public.suppliers ORDER BY name LIMIT 30

-- [int_precios]
SELECT p.sku, p.price, p.updated_at
  FROM public.products p WHERE p.updated_at > '${WIN_START}'
    AND p.id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')

-- ─────────────────────────────────────────────────────────────────────────────────────
-- M080b · Suplemento agregado (8 consultas RO)  (m080b-cert-012-supplement.mjs)
-- ─────────────────────────────────────────────────────────────────────────────────────

-- [categoria_fecha]
SELECT m.category_code, m.economic_date,
    coalesce(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),0) AS neto_debito,
    count(*)::int AS movs
  FROM public.fin_movements m WHERE m.store_id='${STORE}'
  GROUP BY 1,2 ORDER BY 1,2

-- [pagos_fvc]
SELECT count(*)::int AS n, coalesce(sum(amount),0) AS total
  FROM public.payment_transactions WHERE reference='${FVC}'

-- [cxp_por_proveedor]
SELECT supplier, payment_status, count(*)::int AS n,
    coalesce(sum(total_cost),0) AS total, coalesce(sum(paid_amount),0) AS pagado,
    min(due_date) AS vencimiento_min, max(due_date) AS vencimiento_max
  FROM public.receipts WHERE store_id='${STORE}' AND status='active'
  GROUP BY supplier, payment_status ORDER BY supplier, payment_status

-- [drift_stock_kardex]
WITH k AS (SELECT product_id, sum(quantity_change) AS q
    FROM public.stock_movements GROUP BY product_id)
  SELECT count(*)::int AS productos_no_servicio,
    count(*) FILTER (WHERE p.stock_current IS DISTINCT FROM k.q)::int AS drift_campo_vs_kardex,
    count(*) FILTER (WHERE coalesce(k.q,0) < 0)::int AS saldos_negativos
  FROM public.products p LEFT JOIN k ON k.product_id=p.id
  WHERE p.store_id='${STORE}' AND p.is_service=false

-- [auditoria_ventana_full]
SELECT trace_id, action, created_at, record_id, table_name
  FROM public.audit_logs WHERE created_at > '${WIN_START}' ORDER BY created_at LIMIT 400

-- [asientos_entre_rect2_y_rect011]
SELECT id, event, document_type, document_id, store_id, status, posted_at
  FROM public.fin_entries
  WHERE posted_at > '2026-11-16T16:08:00Z' AND posted_at < '2026-11-16T20:02:56Z'
  ORDER BY posted_at

-- [movs_ventana_todas]
SELECT count(*)::int AS n,
    count(*) FILTER (WHERE store_id='${STORE}')::int AS enervida,
    count(*) FILTER (WHERE store_id<>'${STORE}')::int AS otras_tiendas,
    min(created_at) AS primera, max(created_at) AS ultima
  FROM public.stock_movements WHERE created_at > '${WIN_START}'

-- [rango_economico]
SELECT min(economic_date) AS primera, max(economic_date) AS ultima,
    count(*)::int AS entradas FROM public.fin_entries WHERE store_id='${STORE}'

-- ─────────────────────────────────────────────────────────────────────────────────────
-- M080c · Suplemento 2 (6 consultas RO)  (m080c-cert-012-supplement2.mjs)
-- ─────────────────────────────────────────────────────────────────────────────────────

-- [movs_organicos]
SELECT fm.entry_id, e.document_type, e.document_id, e.event, e.posted_at,
    fm.category_code, fm.sense, fm.amount, fm.amount_cup
  FROM public.fin_movements fm JOIN public.fin_entries e ON e.id=fm.entry_id
  WHERE fm.entry_id IN (
    '96c77749-d475-4eb2-b26e-30c5cd10f432','cb419a22-f1ff-4e12-b478-22c3f24700e9',
    'df201fa0-e60c-4c7a-92cd-5b80af1a2b94','67fc9c45-0fc6-4ade-937f-3b02009a18b1',
    'c78e28fb-cc69-4f45-bde0-386a910c91a0')
  ORDER BY e.posted_at, fm.category_code, fm.sense

-- [servicio_recibido]
SELECT * FROM public.received_services WHERE id='708e16dd-43cd-4a7e-8c3d-0c6fd3dd60ab'

-- [pago_servicio]
SELECT id, amount, currency, created_at, reference
  FROM public.payment_transactions WHERE reference='708e16dd-43cd-4a7e-8c3d-0c6fd3dd60ab'

-- [negativos]
SELECT count(*)::int AS productos_no_servicio,
    count(*) FILTER (WHERE cost_average < 0)::int AS wac_negativo,
    count(*) FILTER (WHERE stock_current < 0)::int AS stock_negativo,
    count(*) FILTER (WHERE cost_average = 0 AND stock_current <> 0)::int AS wac_cero_con_stock
  FROM public.products WHERE store_id='${STORE}' AND is_service=false

-- [ventas_organicas_items]
SELECT ti.transaction_id, ti.product_id, p.sku, ti.quantity,
    ti.cost_at_sale, ti.price_at_sale_cup, ti.created_at, t.status AS tx_status
  FROM public.transaction_items ti
  JOIN public.products p ON p.id=ti.product_id
  JOIN public.transactions t ON t.id=ti.transaction_id
  WHERE ti.transaction_id IN ('9bac8945-fe6a-4c59-92d1-b37f2a1cd467','97263a9c-054f-45a0-a6fe-bc52c155bcff','92503dc6-495d-4924-a8c1-baa5f44b86f3')
  ORDER BY ti.created_at

-- [ventas_organicas_movs]
SELECT sm.id, sm.reference_id, sm.movement_type, sm.product_id, p.sku,
    sm.quantity_change, sm.unit_cost, sm.created_at
  FROM public.stock_movements sm JOIN public.products p ON p.id=sm.product_id
  WHERE sm.reference_id IN ('9bac8945-fe6a-4c59-92d1-b37f2a1cd467','97263a9c-054f-45a0-a6fe-bc52c155bcff','92503dc6-495d-4924-a8c1-baa5f44b86f3')
  ORDER BY sm.created_at

-- ─────────────────────────────────────────────────────────────────────────────────────
-- VERIFICACIONES SERVER-SIDE PUNTUALES (consistencia de la extracción)
-- ─────────────────────────────────────────────────────────────────────────────────────

-- [conteo_movimientos_por_cuenta]
SELECT category_code, count(*)::int AS n FROM public.fin_movements
 WHERE store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND category_code IN
 ('ACT_INVENTARIO','PAS_CXP_PROV','GAS_COSTO_VENTAS','GAS_VALES','GAS_PERDIDA_INV')
 GROUP BY 1 ORDER BY 1

-- [saldo_act_cxp_por_tienda]
SELECT m.store_id, c.code,
 round(CASE WHEN c.clase IN ('activo','gasto') THEN coalesce(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),0)
       ELSE coalesce(sum(CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END),0) END,2) AS saldo, count(m.id)::int AS n
 FROM public.fin_movements m JOIN public.fin_categories c ON c.code=m.category_code
 WHERE c.code IN ('ACT_INVENTARIO','PAS_CXP_PROV')
 GROUP BY m.store_id, c.code, c.clase ORDER BY m.store_id, c.code

-- [sku999_movimientos_completos]
SELECT sm.movement_type, sm.quantity_change, sm.unit_cost, sm.reference_id, sm.created_at
 FROM public.stock_movements sm
 WHERE sm.product_id=(SELECT id FROM public.products WHERE sku='999' AND store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38')
 ORDER BY sm.created_at

-- [wac_negativos_hallazgo_f0121]
SELECT p.sku, p.name, p.cost_average, p.stock_current,
 (p.id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63')) AS del_fvc
 FROM public.products p
 WHERE p.store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND p.is_service=false AND p.cost_average<0
 ORDER BY p.sku

-- =====================================================================================
-- FIN · 64 consultas · todas de solo lectura · re-ejecutables sin efectos
-- =====================================================================================
