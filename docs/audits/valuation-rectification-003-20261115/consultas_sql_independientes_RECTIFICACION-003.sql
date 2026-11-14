-- ============================================================================
-- CONSULTAS SQL INDEPENDIENTES — CP-FIN-VALUATION-RECTIFICATION-003
-- FAC-VITALLCONS-001 (fd9d6c88-5db8-49ea-b185-8bc96cc93e63) · SKU 111/112
-- Ejecutables por CUALQUIER revisor con acceso de lectura a producción.
-- SECCIONES: A) verificación del estado congelado · B) cronología de salidas
-- C) matriz 101 líneas · D) liquidación del proveedor · E) SQL de la
-- rectificación (SOLO con autorización; idempotente) · F) verificación
-- post-rectificación · G) rollback de emergencia.
-- ============================================================================

-- ═══ A. ESTADO CONGELADO (read-only) ════════════════════════════════════════
-- A1. Cabecera de la recepción con estado de liquidación:
SELECT id, reference_doc, supplier, status, total_cost, reception_date,
       payment_status, paid_amount, paid_at, due_date, created_at
FROM public.receipts WHERE id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';

-- A2. Las dos líneas bajo rectificación:
SELECT ri.id, p.sku, p.name, ri.quantity, ri.unit_cost, ri.moneda_recepcion, ri.tasa_cambio_recepcion,
       ri.quantity * ri.unit_cost * ri.tasa_cambio_recepcion AS valor_cup_actual,
       ri.quantity * 1 AS valor_correcto_cup
FROM public.receipt_items ri
JOIN public.products p ON p.id = ri.product_id
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
  AND p.sku IN ('111','112');

-- A3. Recomputo independiente del total de las 101 líneas:
SELECT count(*) AS n_lineas,
       sum(quantity * unit_cost * tasa_cambio_recepcion)::float8 AS total_recomputado,
       (SELECT total_cost::float8 FROM public.receipts WHERE id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63') AS total_cabecera
FROM public.receipt_items WHERE receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';

-- A4. Total corregido (escenario propietario: 111/112 a 1 CUP; demás líneas intactas):
SELECT sum(CASE WHEN p.sku IN ('111','112') THEN ri.quantity * 1
                ELSE ri.quantity * ri.unit_cost * ri.tasa_cambio_recepcion END)::float8 AS total_corregido
FROM public.receipt_items ri JOIN public.products p ON p.id = ri.product_id
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';   -- esperado: 40739585.00

-- A5. Asiento original del documento (NO se modifica):
SELECT fe.id, fe.event, fe.economic_date, fe.posted_at, fe.status,
       fm.category_code, fm.sense, fm.amount_cup
FROM public.fin_entries fe JOIN public.fin_movements fm ON fm.entry_id = fe.id
WHERE fe.document_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63' ORDER BY fm.id;

-- ═══ B. CRONOLOGÍA DE LAS 119 UNIDADES SALIDAS (read-only) ══════════════════
-- B1. Kardex completo de ambos SKU (21 movimientos):
SELECT p.sku, sm.movement_date::date AS fecha, sm.movement_type AS tipo,
       sm.quantity_change AS dq, sm.unit_cost AS uc_kardex,
       sm.reference_id, sm.reference_doc, sm.balance_after
FROM public.stock_movements sm JOIN public.products p ON p.id = sm.product_id
WHERE sm.product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')
ORDER BY sm.movement_date, sm.created_at;

-- B2. Identidad por SKU (recibidas − salidas + reingreso = existencia):
SELECT p.sku,
       sum(sm.quantity_change) FILTER (WHERE sm.movement_type='purchase') AS recibidas,
       -sum(sm.quantity_change) FILTER (WHERE sm.quantity_change < 0) AS salidas_brutas,
       sum(sm.quantity_change) FILTER (WHERE sm.movement_type='issue_slip_reverse') AS reingreso,
       sum(sm.quantity_change) AS saldo_kardex,
       p.stock_current AS stock_actual
FROM public.stock_movements sm JOIN public.products p ON p.id = sm.product_id
WHERE sm.product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')
GROUP BY p.sku, p.stock_current;   -- esperado: 111: 49,39,0,10,10 · 112: 100,81,1,20,20

-- B3. Distribución de las 26 unidades subvaluadas (uc=0):
SELECT p.sku, sm.movement_date::date AS fecha, sm.movement_type AS tipo,
       sm.reference_doc, -sm.quantity_change AS unidades
FROM public.stock_movements sm JOIN public.products p ON p.id = sm.product_id
WHERE sm.product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')
  AND sm.quantity_change < 0 AND sm.unit_cost = 0
ORDER BY p.sku, sm.movement_date;   -- esperado: 7 filas · 26 unidades

-- B4. COGS del MOTOR en las 5 ventas (ya correcto a 7 CUP — NO tocar):
SELECT fe.document_number, fe.economic_date, fm.amount_cup AS cogs
FROM public.fin_entries fe JOIN public.fin_movements fm ON fm.entry_id = fe.id
WHERE fm.category_code = 'GAS_COSTO_VENTAS' AND fe.document_id::text IN (
  '99d8993f-480c-406b-840f-1f2e183725ac','d939ea06-b328-42f8-ac42-931f201e81c2',
  'acc2b470-ee74-4d44-8e3a-2289c8331c36','4c76a1a1-4b77-4d26-9093-bd183285ec50',
  'a0d9f44d-9f54-4f69-a91f-db05f3dd4886')
ORDER BY fe.economic_date;   -- esperado Σ = 7.00
-- (ids de transacción verificados en el snapshot de Fase I; FAC-004479-2026 = 99d8993f-480c-406b-840f-1f2e183725ac.)

-- B5. Vales SIN asiento contable (brechas a cerrar con RECT-2):
SELECT s.slip_number, s.status, s.notes,
       (SELECT sum(i.quantity) FROM public.issue_slip_items i
         WHERE i.slip_id = s.id AND i.product_id IN
           ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')) AS unidades_111_112
FROM public.issue_slips s
WHERE s.id IN (SELECT reference_id::uuid FROM public.stock_movements
                WHERE movement_type='issue_slip_out'
                  AND product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4'))
  AND NOT EXISTS (SELECT 1 FROM public.fin_entries fe WHERE fe.document_number = s.slip_number)
ORDER BY s.slip_number;   -- esperado: VS-000037 (4u) · VS-000138 (1u) · VS-000139 (1u) · VS-000223 (1u, reversed)

-- ═══ C. MATRIZ DE LAS 101 LÍNEAS (read-only) ════════════════════════════════
-- C1. Clasificación resumida (misma lógica de las misiones 002/003):
WITH l AS (
  SELECT p.sku, p.name, ri.quantity, ri.unit_cost, ri.moneda_recepcion,
         ri.tasa_cambio_recepcion, p.price AS precio_venta, p.price_currency AS moneda_producto,
         ri.quantity * ri.unit_cost * ri.tasa_cambio_recepcion AS total_original
  FROM public.receipt_items ri JOIN public.products p ON p.id = ri.product_id
  WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63')
SELECT CASE
    WHEN sku IN ('111','112') THEN '2. SKU corregido por decisión del propietario'
    WHEN moneda_recepcion <> moneda_producto AND unit_cost = 1 THEN '4a. Discrepancia de moneda (costo 1 auténtico)'
    WHEN moneda_recepcion <> moneda_producto THEN '4b. Discrepancia de moneda (magnitud = precio CUP)'
    WHEN unit_cost = 1 THEN '3. Costo bajo legítimo (1 CUP/USD auténtico)'
    WHEN unit_cost = precio_venta THEN '5. Costo no verificable (uc == precio)'
    ELSE '6. Sin problema detectado' END AS clasificacion,
       count(*) AS lineas, sum(total_original)::float8 AS valor_original
FROM l GROUP BY 1 ORDER BY 2 DESC;
-- esperado: 2 · 18 · 4 (1+3) · 71 · 6 = 101 · 192.039.436 en total

-- ═══ D. LIQUIDACIÓN DEL PROVEEDOR (read-only — evidencia del diseño) ═══════
-- D1. Pagos registrados contra la FVC o el proveedor:
SELECT count(*) AS pagos_fvc FROM public.payment_transactions
WHERE ref_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';   -- esperado: 0

-- D2. Mayor PAS_CXP_PROV (deuda total pendiente — no existe PAGO_PROVEEDOR):
SELECT sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END)::float8 AS saldo_pas_cxp
FROM public.fin_movements WHERE category_code = 'PAS_CXP_PROV';   -- esperado: -207255150.57

-- D3. Mayor ACT_INVENTARIO:
SELECT sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END)::float8 AS saldo_act
FROM public.fin_movements WHERE category_code = 'ACT_INVENTARIO';   -- congelado: 201699246.55 (+actividad viva)

-- ═══ E. SQL DE LA RECTIFICACIÓN (SOLO CON AUTORIZACIÓN — idempotente) ═══════
-- Ids deterministas de la misión (cambiar el prefijo 7ec7… por ids propios si se prefiere):
--   RECT-1 entry: '7ec70003-0000-4000-8000-d0b300000001'
--   RECT-2 entry: '7ec70003-0000-4000-8000-d0b300000002'
--   wcl 1/2:      '7ec70003-0000-4000-8000-9cb300000001' / '…02'
--   fmov 90-94:   '7ec70003-0000-4000-8000-f0b300000090' … '…94'
-- S1-S4 y S6-S8: ver RUNBOOK_PRODUCCION_RECTIFICACION.md §5 (transacción única
-- con SET LOCAL app.allow_receipt_item_edit='on'). Los importes exactos:
--   RECT-1: D PAS_CXP_PROV 151299851.00 / C ACT_INVENTARIO 151299851.00
--   RECT-2: D GAS_VALES 6.00 + D GAS_PERDIDA_INV 18.00 / C ACT_INVENTARIO 24.00
--   wac_change_log: event='rectificacion', wac_before=1, wac_after=1 (2 filas)

-- ═══ F. VERIFICACIÓN POST-RECTIFICACIÓN (read-only) ═════════════════════════
-- F1. Estado de la recepción:
SELECT total_cost FROM public.receipts WHERE id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
-- esperado: 40739585.00
-- F2. Líneas corregidas:
SELECT p.sku, ri.unit_cost, ri.moneda_recepcion, ri.tasa_cambio_recepcion
FROM public.receipt_items ri JOIN public.products p ON p.id=ri.product_id
WHERE ri.receipt_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63' AND p.sku IN ('111','112');
-- esperado: 1 / CUP / 1 en ambas
-- F3. Salidas subvaluadas restantes:
SELECT count(*) FROM public.stock_movements
WHERE store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')
  AND quantity_change < 0 AND unit_cost = 0;   -- esperado: 0
-- F4. Asientos de rectificación balanceados:
SELECT fe.document_number, sum(CASE WHEN fm.sense='debito' THEN fm.amount ELSE -fm.amount END) AS cuadre
FROM public.fin_entries fe JOIN public.fin_movements fm ON fm.entry_id=fe.id
WHERE fe.document_number IN ('FAC-VITALLCONS-001-RECT','FAC-VITALLCONS-001-RECT-SAL')
GROUP BY fe.document_number;   -- esperado: cuadre = 0.00 en ambos
-- F5. Trazabilidad del enlace:
SELECT reversal_of FROM public.fin_entries
WHERE document_number='FAC-VITALLCONS-001-RECT';   -- esperado: 93bb5da9-0afd-4325-baad-a275710062c5
-- F6. COGS intacto (Σ de los 5 asientos de venta de estos SKU = 7.00):
--     reutilizar B4 con los ids de transacción del expediente.
-- F7. Idempotencia (en transacción de prueba con ROLLBACK):
BEGIN;
SET LOCAL app.allow_receipt_item_edit='on';
UPDATE receipt_items SET unit_cost=1, moneda_recepcion='CUP', tasa_cambio_recepcion=1
WHERE receipt_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
  AND product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')
  AND (unit_cost<>1 OR moneda_recepcion<>'CUP' OR tasa_cambio_recepcion<>1);
-- esperado: UPDATE 0 → idempotente
ROLLBACK;

-- ═══ G. ROLLBACK DE EMERGENCIA (ver RUNBOOK §7) ═════════════════════════════
-- Restauración desde el respaldo lógico del PASO 0 (valores ANTES exactos) +
-- asiento testigo FAC-VITALLCONS-001-ROLLBACK. Demostrado en E2E byte a byte.
