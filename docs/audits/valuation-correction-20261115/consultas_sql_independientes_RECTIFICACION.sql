-- ============================================================================
-- CP-FIN-VALUATION-CORRECTION-002 — SQL INDEPENDIENTE Y REPRODUCIBLE
-- SKU 111 / SKU 112 · FAC-VITALLCONS-001 (fd9d6c88-5db8-49ea-b185-8bc96cc93e63)
-- Verificación read-only (Q1-Q14) + plantillas de la rectificación (R1-R8,
-- SOLO para ejecución gobernada tras aprobación del propietario — ver
-- PROPUESTA_RECTIFICACION_CP_FIN_WAC.md).
-- Ejecutar en producción como servicio de solo lectura salvo la sección R.
-- ============================================================================

-- Constantes de la misión ---------------------------------------------------
-- RECEPCIÓN : fd9d6c88-5db8-49ea-b185-8bc96cc93e63
-- TIENDA    : 5e6fe821-5465-48b1-b3f1-3aa3182edc38 (ENERVIDA-VITALLCONS)
-- SKU 111   : 4afef9a7-28b7-4a5e-b134-13a9e0ffea16 (Grapas plásticas con clavo de acero)
-- SKU 112   : 14aeb370-7e00-4889-b29b-ef2bc778f4c4 (Grapas metálicas 3/4 con tornillo roscante)
-- LÍNEA 111 : 80a1767b-8902-48c6-833b-abf713bdc7b0
-- LÍNEA 112 : 9c9e6010-b848-4d0f-b667-304282f7584b
-- ASIENTO   : 93bb5da9-0afd-4325-baad-a275710062c5 (reconocimiento, 192.039.436)

-- ══════════════════════════════════════════════════════════════════════════
-- Q1. Estado vigente de la recepción (cabecera)
-- ══════════════════════════════════════════════════════════════════════════
SELECT id, reference_doc, status, total_cost, reception_date, created_at, updated_at,
       payment_status, paid_amount
FROM receipts WHERE id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';

-- ══════════════════════════════════════════════════════════════════════════
-- Q2. Las dos líneas objeto de rectificación
-- ══════════════════════════════════════════════════════════════════════════
SELECT ri.id, p.sku, p.name AS producto, ri.quantity, ri.unit_cost,
       ri.moneda_recepcion, ri.tasa_cambio_recepcion,
       ri.quantity * ri.unit_cost * ri.tasa_cambio_recepcion AS valor_cup_actual,
       ri.quantity * 1 AS valor_cup_correcto,
       (ri.quantity * ri.unit_cost * ri.tasa_cambio_recepcion - ri.quantity * 1) AS exceso
FROM receipt_items ri JOIN products p ON p.id = ri.product_id
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
  AND ri.product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16', '14aeb370-7e00-4889-b29b-ef2bc778f4c4');
-- Esperado: 2 filas · excesos 83.299.951 y 67.999.900 · conjunto 151.299.851

-- ══════════════════════════════════════════════════════════════════════════
-- Q3. Verificación aritmética del total ACTUAL (101 líneas)
-- ══════════════════════════════════════════════════════════════════════════
SELECT count(*) AS n_lineas,
       sum(ri.quantity * ri.unit_cost * coalesce(ri.tasa_cambio_recepcion, 1)) AS recomputo_cup,
       (SELECT total_cost FROM receipts WHERE id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63') AS total_cabecera
FROM receipt_items ri
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
-- Esperado: 101 · 192.039.436 · 192.039.436 (diferencia 0,00)

-- ══════════════════════════════════════════════════════════════════════════
-- Q4. Recomputo del total CORREGIDO (escenario del propietario)
-- ══════════════════════════════════════════════════════════════════════════
SELECT sum(CASE WHEN ri.product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16',
                                       '14aeb370-7e00-4889-b29b-ef2bc778f4c4')
                THEN ri.quantity * 1   -- costo real 1 CUP/unidad
                ELSE ri.quantity * ri.unit_cost * coalesce(ri.tasa_cambio_recepcion, 1)
           END) AS total_corregido
FROM receipt_items ri
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
-- Esperado: 40.739.585,00 (vía 1 = vía 2 de la reconciliación)

-- ══════════════════════════════════════════════════════════════════════════
-- Q5. No doble conversión: TODAS las líneas de recepción de ambos SKU
-- ══════════════════════════════════════════════════════════════════════════
SELECT ri.receipt_id, r.reference_doc, ri.quantity, ri.unit_cost, ri.moneda_recepcion,
       ri.tasa_cambio_recepcion, ri.created_at
FROM receipt_items ri LEFT JOIN receipts r ON r.id = ri.receipt_id
WHERE ri.product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16', '14aeb370-7e00-4889-b29b-ef2bc778f4c4')
ORDER BY ri.created_at;
-- Esperado: exactamente 2 filas, ambas de fd9d6c88 (sin segundas líneas en otros documentos)

-- ══════════════════════════════════════════════════════════════════════════
-- Q6. Kardex cronológico de ambos SKU (con valoración correcta)
-- ══════════════════════════════════════════════════════════════════════════
SELECT p.sku, sm.movement_date::date AS fecha, sm.movement_type, sm.reference_doc,
       sm.quantity_change AS dQ, sm.unit_cost AS uc_registrado,
       sm.quantity_change * sm.unit_cost AS valor_registrado,
       sm.quantity_change * 1 AS valor_correcto,
       sum(sm.quantity_change) OVER (PARTITION BY sm.product_id ORDER BY sm.movement_date, sm.created_at) AS saldo
FROM stock_movements sm JOIN products p ON p.id = sm.product_id
WHERE sm.product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16', '14aeb370-7e00-4889-b29b-ef2bc778f4c4')
  AND sm.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
ORDER BY sm.movement_date, sm.created_at;
-- Esperado: 21 filas · saldos finales 10 y 20 · valor correcto de salidas −120 CUP (120 u)

-- ══════════════════════════════════════════════════════════════════════════
-- Q7. Salidas subvaluadas (uc=0) de ambos SKU — insumo del asiento de revalorización
-- ══════════════════════════════════════════════════════════════════════════
SELECT p.sku, sm.movement_type, count(*) AS filas, sum(-sm.quantity_change) AS unidades,
       sum(-sm.quantity_change * 1) AS cogs_correcto_cup, sum(-sm.quantity_change * sm.unit_cost) AS valor_registrado
FROM stock_movements sm JOIN products p ON p.id = sm.product_id
WHERE sm.product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16', '14aeb370-7e00-4889-b29b-ef2bc778f4c4')
  AND sm.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND sm.quantity_change < 0 AND sm.unit_cost = 0
GROUP BY p.sku, sm.movement_type ORDER BY p.sku;
-- Esperado: 111: sale 2u / adjustment 1u / issue_slip_out 1u · 112: adjustment 17u / issue_slip_out 5u
--           total 26 unidades × 1 CUP = 26 CUP (2 COGS + 24 vales/ajustes)

-- ══════════════════════════════════════════════════════════════════════════
-- Q8. WAC vigente y existencias (deben quedar sin cambio material)
-- ══════════════════════════════════════════════════════════════════════════
SELECT sku, name, price, price_currency, cost_price, cost_average, stock_current,
       cost_average * stock_current AS valor_contable
FROM products
WHERE id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16', '14aeb370-7e00-4889-b29b-ef2bc778f4c4');
-- Esperado: WAC 1 · stock 10/20 · valor contable 10/20 CUP (ya correctos)

-- ══════════════════════════════════════════════════════════════════════════
-- Q9. Inventario registrado por tienda
-- ══════════════════════════════════════════════════════════════════════════
SELECT product_id, store_id, quantity, version FROM inventory
WHERE product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16', '14aeb370-7e00-4889-b29b-ef2bc778f4c4');
-- Esperado: 10 y 20 (conciliado con kardex y master)

-- ══════════════════════════════════════════════════════════════════════════
-- Q10. Asiento de reconocimiento original y sus movimientos
-- ══════════════════════════════════════════════════════════════════════════
SELECT id, document_type, event, economic_date, posted_at, status, reversal_of, description
FROM fin_entries WHERE document_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';

SELECT fm.category_code, fm.sense, fm.amount, fm.currency, fm.economic_date, fm.description
FROM fin_movements fm
WHERE fm.entry_id = '93bb5da9-0afd-4325-baad-a275710062c5'
ORDER BY fm.sense DESC;
-- Esperado: débito ACT_INVENTARIO 192.039.436 / crédito PAS_CXP_PROV 192.039.436

-- ══════════════════════════════════════════════════════════════════════════
-- Q11. Corroboración: contradicción documentada por GATE16 (WAC log)
-- ══════════════════════════════════════════════════════════════════════════
SELECT product_id, wac_before, wac_after, event, created_at, source_ref
FROM wac_change_log
WHERE product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16', '14aeb370-7e00-4889-b29b-ef2bc778f4c4')
ORDER BY created_at;
-- Esperado: 2 eventos wac_correction → 1 CUP (SKU 112 con evidencia «contradice precio venta 1000 CUP»)

-- ══════════════════════════════════════════════════════════════════════════
-- Q12. Corroboración: historia de precios del maestro (auditoría)
-- ══════════════════════════════════════════════════════════════════════════
SELECT created_at, action, old_data, new_data
FROM audit_logs
WHERE record_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16', '14aeb370-7e00-4889-b29b-ef2bc778f4c4')
  AND (action = 'UPDATE_PRODUCT' OR action = 'price_change')
ORDER BY created_at;
-- Esperado: SKU 111 price 2500 USD → 2500 CUP (2026-10-22) → 2000 CUP; SKU 112 price 1000

-- ══════════════════════════════════════════════════════════════════════════
-- Q13. Clasificación de alcance: patrón unit_cost == products.price (74/101)
-- ══════════════════════════════════════════════════════════════════════════
SELECT count(*) FILTER (WHERE ri.unit_cost = p.price) AS uc_igual_precio,
       count(*) FILTER (WHERE p.cost_price = 0)      AS cost_price_cero,
       count(*) FILTER (WHERE ri.moneda_recepcion <> p.price_currency) AS moneda_discrepante,
       count(*) AS total_lineas
FROM receipt_items ri JOIN products p ON p.id = ri.product_id
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
-- Esperado: 74 · 101 · 5 · 101

-- ══════════════════════════════════════════════════════════════════════════
-- Q14. Exposición contingente de las 71 líneas no verificables
-- ══════════════════════════════════════════════════════════════════════════
SELECT count(*) AS lineas, sum(ri.quantity * ri.unit_cost * coalesce(ri.tasa_cambio_recepcion, 1)) AS valor_cup
FROM receipt_items ri JOIN products p ON p.id = ri.product_id
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
  AND ri.unit_cost = p.price
  AND p.cost_price = 0
  AND ri.moneda_recepcion = p.price_currency
  AND ri.unit_cost <> 1
  AND ri.product_id NOT IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16', '14aeb370-7e00-4889-b29b-ef2bc778f4c4');
-- Esperado: 71 líneas · 24.510.805 CUP (decisión DP-3 del propietario)

-- ══════════════════════════════════════════════════════════════════════════
-- ══ SECCIÓN R — PLANTILLAS DE RECTIFICACIÓN (SOLO TRAS APROBACIÓN) ════════
-- ══ NO EJECUTAR sin autorización expresa del propietario (DP-1/DP-2/DP-6).
-- ══ Demostradas íntegras en la BD E2E aislada (EVIDENCIA_E2E_AISLADA.json).
-- ══════════════════════════════════════════════════════════════════════════

-- R0. Respaldo lógico pre-flight (exportar antes de la transacción)
SELECT * FROM receipt_items WHERE receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
SELECT * FROM receipts      WHERE id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
SELECT * FROM stock_movements WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16', '14aeb370-7e00-4889-b29b-ef2bc778f4c4')
  AND movement_type = 'purchase';
SELECT * FROM fin_entries  WHERE id = '93bb5da9-0afd-4325-baad-a275710062c5';
SELECT * FROM fin_movements WHERE entry_id = '93bb5da9-0afd-4325-baad-a275710062c5';

-- R1-R8. Transacción atómica de rectificación (ver PROPUESTA_RECTIFICACION_CP_FIN_WAC.md §3)
-- BEGIN;
-- SET LOCAL app.allow_receipt_item_edit = 'on';   -- escape hatch gobernado (trigger M021)
--
-- R1. Líneas → costo real 1 CUP
-- UPDATE receipt_items SET unit_cost = 1, moneda_recepcion = 'CUP', tasa_cambio_recepcion = 1, updated_at = now()
-- WHERE receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
--   AND product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16', '14aeb370-7e00-4889-b29b-ef2bc778f4c4')
--   AND (unit_cost <> 1 OR moneda_recepcion <> 'CUP' OR tasa_cambio_recepcion <> 1)
-- RETURNING id, unit_cost AS uc_antes, moneda_recepcion AS moneda_antes;
--
-- R2. Cabecera → total corregido
-- UPDATE receipts SET total_cost = 40739585.00, updated_at = now()
-- WHERE id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63' AND total_cost <> 40739585.00
-- RETURNING id, total_cost AS antes;
--
-- R3. Capas de compra → uc 1 CUP
-- UPDATE stock_movements SET unit_cost = 1, cost_value_change = quantity_change * 1
-- WHERE reference_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63' AND movement_type = 'purchase' AND unit_cost <> 1
-- RETURNING id, unit_cost AS antes;
--
-- R4. Salidas subvaluadas → uc 1 CUP (26 unidades)
-- UPDATE stock_movements SET unit_cost = 1, cost_value_change = quantity_change * 1
-- WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
--   AND product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16', '14aeb370-7e00-4889-b29b-ef2bc778f4c4')
--   AND quantity_change < 0 AND unit_cost = 0
-- RETURNING id, quantity_change;
--
-- R5. wac_change_log (evento 'rectificacion', 2 filas, wac 1→1, source_ref de la misión)
-- R6. Asiento compensatorio: D PAS_CXP_PROV 151.299.851 / C ACT_INVENTARIO 151.299.851
--     (event 'ajuste_manual', reversal_of = 93bb5da9-0afd-4325-baad-a275710062c5,
--      document_number 'FAC-VITALLCONS-001-RECT')
-- R7. Asiento revalorización de salidas: D GAS_COSTO_VENTAS 2 / D GAS_VALES 24 / C ACT_INVENTARIO 26
--     (document_number 'FAC-VITALLCONS-001-RECT-SAL')
-- R8. audit_logs por fila (SYSTEM_RECT_*: old_data/new_data, metadata.mision, trace_id)
--
-- COMMIT;

-- R9. Verificación post-rectificación (re-ejecutar Q2/Q3/Q4/Q6/Q7/Q8: esperan)
--     Q2: valor_correcto == valor_cup_actual · Q4: 40.739.585 · Q6: salidas −120 CUP
--     Q7: 0 filas · Q8: sin cambios · Q10: 2 asientos compensatorios enlazados
--     Neto ACT_INVENTARIO de ambos SKU tras la FVC completa = 30 CUP = valor en libros
