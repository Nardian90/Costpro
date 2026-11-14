-- ============================================================================
-- RECT004_READONLY_SQL.sql — CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004
-- Consultas INDEPENDIENTES de verificación — EXCLUSIVAMENTE DE LECTURA.
-- Re-ejecutables en cualquier momento; producción intacta.
-- Canal recomendado: Supabase Management API /database/query (service role) o
-- consola SQL. Ninguna sentencia de escritura en este archivo.
-- Constantes: FVC fd9d6c88-5db8-49ea-b185-8bc96cc93e63 · tienda ENERVIDA
-- 5e6fe821-5465-48b1-b3f1-3aa3182edc38 · SKU111 4afef9a7-28b7-4a5e-b134-13a9e0ffea16
-- · SKU112 14aeb370-7e00-4889-b29b-ef2bc778f4c4 · asiento original
-- 93bb5da9-0afd-4325-baad-a275710062c5.
-- ============================================================================

-- ═══ A. DP-1 — COSTO REAL DE SKU 111/112 SEPARADO DEL PRECIO DE VENTA ══════

-- A.1 La recepción y su estado de liquidación (esperado: total 192.039.436,00;
--     active; unpaid; paid_amount 0; vencida 2026-07-31; sin reversa)
SELECT id, status, total_cost, payment_status, paid_amount, paid_at, due_date,
       reversed_at, reversal_reason, document_number, reference_doc, supplier
FROM public.receipts
WHERE id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';

-- A.2 Las 2 líneas del alcance (esperado: 49 u @ 2.500 USD@680 y 100 u @ 1.000
--     USD@680 — el defecto sigue presente hasta la rectificación autorizada)
SELECT ri.id, p.sku, p.name, ri.quantity, ri.unit_cost, ri.moneda_recepcion,
       ri.tasa_cambio_recepcion, p.price AS precio_venta_maestro,
       p.price_currency AS moneda_precio, p.cost_average AS wac
FROM public.receipt_items ri
JOIN public.products p ON p.id = ri.product_id
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
  AND p.sku IN ('111','112');

-- A.3 Recomputo del total de las 101 líneas (esperado: 192.039.436,00 exacto)
SELECT count(*) AS lineas,
       sum(ri.quantity * ri.unit_cost * coalesce(ri.tasa_cambio_recepcion,1)) AS total_recomputado,
       (SELECT total_cost FROM public.receipts
         WHERE id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63') AS total_cabecera
FROM public.receipt_items ri
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';

-- A.4 Exceso a revertir (esperado: 83.299.951,00 + 67.999.900,00 = 151.299.851,00)
SELECT p.sku,
       ri.quantity * ri.unit_cost * ri.tasa_cambio_recepcion AS valor_defectuoso,
       ri.quantity * 1 AS valor_correcto_1cup,
       ri.quantity * (ri.unit_cost * ri.tasa_cambio_recepcion - 1) AS exceso
FROM public.receipt_items ri
JOIN public.products p ON p.id = ri.product_id
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63' AND p.sku IN ('111','112');

-- ═══ B. DP-2 — CONTRAPARTIDA: DEUDA DEL PROVEEDOR, DOCUMENTO POR DOCUMENTO ══

-- B.1 Pagos que referencian la FVC o mencionen al proveedor (esperado: 0 filas)
SELECT pt.id, pt.ref_type, pt.ref_id, pt.amount, pt.currency, pt.amount_cup,
       pt.direction, pt.payment_date, pt.reference, pt.notes
FROM public.payment_transactions pt
WHERE pt.ref_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
   OR pt.reference ILIKE '%vitallcons%' OR pt.notes ILIKE '%vitallcons%'
   OR pt.reference ILIKE '%FAC-VITALLCONS%' OR pt.notes ILIKE '%FAC-VITALLCONS%';

-- B.2 Pagos de la tienda por tipo de referencia (NO debe existir ref_type
--     receipt/proveedor/supplier/purchase con importe aplicado a CXP)
SELECT pt.ref_type, coalesce(pt.direction,'in') AS direction, count(*) AS n,
       sum(pt.amount_cup) AS total_cup
FROM public.payment_transactions pt
WHERE pt.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
GROUP BY 1, 2 ORDER BY 1, 2;

-- B.3 Anticipos/compensaciones (direction='out') — esperar solo cash_flow
SELECT pt.ref_type, pt.ref_id, pt.amount, pt.currency, pt.amount_cup, pt.payment_date
FROM public.payment_transactions pt
WHERE pt.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND coalesce(pt.direction,'in') = 'out';

-- B.4 Duplicados del documento del proveedor (esperado: 0 filas)
SELECT reference_doc, document_number, count(*) AS n
FROM public.receipts
WHERE supplier ILIKE '%vitallcons%' OR reference_doc ILIKE '%vitallcons%'
  OR document_number ILIKE '%vitallcons%' OR notes ILIKE '%vitallcons%'
GROUP BY 1, 2 HAVING count(*) > 1;

-- B.5 Anulaciones de recepciones en el mayor (esperado: 1 fila — la recepción
--     de 960 CUP; NUNCA la FVC)
SELECT fe.document_id, r.reference_doc, fe.event, fe.status, sum(
  CASE WHEN fm.sense='credito' THEN fm.amount_cup ELSE -fm.amount_cup END) AS neto_cxp
FROM public.fin_entries fe
JOIN public.fin_movements fm ON fm.entry_id = fe.id
LEFT JOIN public.receipts r ON r.id = fe.document_id
WHERE fe.document_type = 'RECEPCION' AND fe.event = 'anulacion'
GROUP BY 1, 2, 3, 4;

-- B.6 ¿Existe alguna reversión de los asientos de la FVC? (esperado: 0 filas)
SELECT * FROM public.fin_entries
WHERE reversal_of IN (SELECT id FROM public.fin_entries
                       WHERE document_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63');

-- B.7 Mayor PAS_CXP_PROV global (esperado: reconocimiento C 207.256.110,57 en
--     98 recepciones + anulacion D 960 en 1; NETO 207.255.150,57 — sin PAGO_PROVEEDOR)
SELECT fe.document_type, fe.event, fm.sense, count(*) AS n_movs, sum(fm.amount_cup) AS total
FROM public.fin_movements fm
JOIN public.fin_entries fe ON fe.id = fm.entry_id
WHERE fm.category_code = 'PAS_CXP_PROV'
GROUP BY 1, 2, 3 ORDER BY 1, 3;

-- B.8 Vista de CXP de la tienda (esperado: 0 filas para ENERVIDA)
SELECT * FROM public.v_purchase_orders_cxp
WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
   OR receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';

-- ═══ C. DP-3 — LOS 24 CUP DE SALIDAS SIN ASIENTO ═════════════════════════════

-- C.1 Vales de estos SKU CON asiento (esperado 6: VS-148/157/158/165/208/225)
SELECT fe.document_number, fe.event, fe.status, fm.category_code, fm.sense, fm.amount
FROM public.fin_entries fe
JOIN public.fin_movements fm ON fm.entry_id = fe.id
WHERE fe.document_type = 'VALE_SALIDA'
  AND fe.document_number IN ('VS-000037-2026','VS-000138-2026','VS-000139-2026',
                             'VS-000148-2026','VS-000157-2026','VS-000158-2026',
                             'VS-000165-2026','VS-000208-2026','VS-000223-2026','VS-000225-2026')
ORDER BY fe.document_number;

-- C.2 Los 4 vales SIN asiento (esperado: VS-37, VS-138, VS-139 [completed] y
--     VS-223 [reversed] — cero filas en fin_entries por id y por número)
SELECT s.id, s.slip_number, s.status, s.total_cost, s.created_at
FROM public.issue_slips s
WHERE s.slip_number IN ('VS-000037-2026','VS-000138-2026','VS-000139-2026','VS-000223-2026')
  AND NOT EXISTS (SELECT 1 FROM public.fin_entries fe
                   WHERE fe.document_id = s.id OR fe.document_number = s.slip_number)
ORDER BY s.slip_number;

-- C.3 Contenido EXACTO de los 3 vales sin asiento (esperado: SOLO líneas
--     111/112 con uc=0: 4+1+1 = 6 unidades)
SELECT s.slip_number, p.sku, i.quantity, i.unit_cost, i.total_cost
FROM public.issue_slip_items i
JOIN public.issue_slips s ON s.id = i.slip_id
LEFT JOIN public.products p ON p.id = i.product_id
WHERE s.slip_number IN ('VS-000037-2026','VS-000138-2026','VS-000139-2026')
ORDER BY s.slip_number, p.sku;

-- C.4 Los 2 ajustes de cuadre sin documento ni asiento (esperado: Δ−1 SKU111 +
--     Δ−17 SKU112 el 2026-08-18; 0 inventory_adjustments; 0 asientos vinculados)
SELECT sm.id, p.sku, sm.movement_type, sm.quantity_change, sm.unit_cost,
       sm.movement_date, sm.reference_id, sm.notes
FROM public.stock_movements sm
LEFT JOIN public.products p ON p.id = sm.product_id
WHERE sm.product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')
  AND sm.movement_type = 'adjustment';

-- C.5 Las 26 unidades subvaluadas (esperado: 7 filas — 2 ventas + 3 vales
--     VS-37/138/139 + 2 ajustes; el COGS de las 2 ventas YA está en el mayor)
SELECT sm.id, p.sku, sm.movement_type, sm.quantity_change, sm.unit_cost,
       sm.reference_doc, sm.movement_date
FROM public.stock_movements sm
LEFT JOIN public.products p ON p.id = sm.product_id
WHERE sm.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND sm.product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')
  AND sm.quantity_change < 0 AND sm.unit_cost = 0
ORDER BY sm.movement_date;

-- C.6 COGS del motor de las 5 ventas (esperado: 1+1+3+1+1 = 7 CUP — INTACTO;
--     RECT-2 NO debita GAS_COSTO_VENTAS)
SELECT fe.document_number, fe.document_id, fm.amount
FROM public.fin_movements fm
JOIN public.fin_entries fe ON fe.id = fm.entry_id
WHERE fm.category_code = 'GAS_COSTO_VENTAS'
  AND fe.document_id IN (
    SELECT sm.reference_id::uuid FROM public.stock_movements sm
    WHERE sm.product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')
      AND sm.movement_type = 'sale' AND sm.reference_id ~ '^[0-9a-f-]{36}$')
ORDER BY fm.economic_date;

-- ═══ D. §8 — IDENTIDAD DE LAS 119 SALIDAS Y EL REINGRESO ═════════════════════

-- D.1 Reconstrucción por SKU (esperado: 111 → entradas 49/salidas 39/saldo 10;
--     112 → entradas 101/salidas 81/saldo 20 — con stock_current e inventory)
SELECT p.sku,
       sum(CASE WHEN sm.quantity_change > 0 THEN sm.quantity_change ELSE 0 END) AS entradas,
       sum(CASE WHEN sm.quantity_change < 0 THEN -sm.quantity_change ELSE 0 END) AS salidas_brutas,
       sum(sm.quantity_change) AS saldo_kardex,
       p.stock_current, i.quantity AS inventory
FROM public.stock_movements sm
JOIN public.products p ON p.id = sm.product_id
LEFT JOIN public.inventory i ON i.product_id = p.id AND i.store_id = sm.store_id
WHERE sm.product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')
GROUP BY p.sku, p.stock_current, i.quantity
ORDER BY p.sku;

-- D.2 El reingreso de VS-000223 (par salida/reingreso — ambos sin asiento, neto 0)
SELECT sm.id, sm.movement_type, sm.quantity_change, sm.unit_cost, sm.reference_doc,
       sm.movement_date
FROM public.stock_movements sm
WHERE sm.reference_doc LIKE '%VS-000223%'
ORDER BY sm.movement_date;

-- D.3 Asientos de la FVC (esperado HOY: 1 — el reconocimiento 93bb5da9;
--     TRAS la rectificación: +RECT-1 +RECT-2, el original INTACTO)
SELECT id, document_type, document_number, event, status, reversal_of,
       economic_date, posted_at
FROM public.fin_entries
WHERE document_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
ORDER BY posted_at;

-- ═══ E. §10 — PROTECCIÓN DE LAS 75 LÍNEAS (regresión re-ejecutable) ═════════

-- E.1 Las 4 discrepancias de moneda (SKU 90, 92, 999, 120) — DEBEN permanecer
--     con sus valores exactos (no modificar):
SELECT p.sku, ri.quantity, ri.unit_cost, ri.moneda_recepcion, ri.tasa_cambio_recepcion
FROM public.receipt_items ri
JOIN public.products p ON p.id = ri.product_id
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
  AND p.sku IN ('90','92','999','120')
ORDER BY p.sku;

-- E.2 Conteo de clasificación de las 101 líneas (esperado: 2 corregidas por
--     decidir + 18 legítimas + 4 moneda + 71 no verificables + 6 sin problema)
SELECT CASE
         WHEN p.sku IN ('111','112') THEN '1_alcance_rectificacion'
         WHEN ri.unit_cost = p.price AND ri.moneda_recepcion = 'CUP'
              AND p.price_currency = 'CUP' AND p.sku NOT IN ('90','92','999','120')
              AND ri.unit_cost > 1 THEN '5_no_verificable_posible'
         WHEN p.sku IN ('90','92','999','120') THEN '3_discrepancia_moneda'
         WHEN ri.unit_cost IN (1) AND ri.moneda_recepcion IN ('CUP','USD') THEN '2_costo_legitimo_o_sin_problema'
         ELSE '4_otros'
       END AS grupo, count(*) AS lineas
FROM public.receipt_items ri
JOIN public.products p ON p.id = ri.product_id
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
GROUP BY 1 ORDER BY 1;
-- Nota: el conteo canónico por categorías es el de la matriz m048 (congelada);
-- esta consulta es el control rápido de que nada cambió (101 líneas y mismos
-- valores por línea — comparar contra RECT004_MATRIX_101.xlsx).

-- E.3 Control de que la FVC no fue modificada (esperado: total 192.039.436,00
--     y 101 líneas con updated_at ANTERIOR a la misión 004 — ninguna línea
--     tocada por esta misión)
SELECT count(*) AS lineas_tocadas_desde_20261114
FROM public.receipt_items ri
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
  AND ri.updated_at > '2026-11-14T18:58:17Z';
-- (esperado 0 mientras la rectificación no se autorice; tras RECT-1 serán 2)

-- ═══ F. §11 — SNAPSHOT VIGENTE (actividad comercial posterior) ══════════════

-- F.1 Movimientos NUEVOS de SKU 111/112 desde el corte de la misión 003
SELECT sm.id, p.sku, sm.movement_type, sm.quantity_change, sm.reference_doc,
       sm.created_at
FROM public.stock_movements sm
LEFT JOIN public.products p ON p.id = sm.product_id
WHERE sm.product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')
  AND sm.created_at > '2026-11-14T18:58:17Z';
-- (esperado 0: ningún movimiento comercial de estos SKU tras el corte)

-- F.2 Asientos nuevos de la tienda tras el corte 003 (actividad viva explicada)
SELECT id, document_type, document_number, event, status, posted_at, description
FROM public.fin_entries
WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND posted_at > '2026-11-14T18:58:17Z'
ORDER BY posted_at;

-- F.3 Mayor ACT_INVENTARIO global (para comparar cortes; el delta tras el
--     corte 003 es actividad comercial viva, no error)
SELECT sum(CASE WHEN fm.sense='debito' THEN fm.amount_cup ELSE -fm.amount_cup END) AS act_neto
FROM public.fin_movements fm
WHERE fm.category_code = 'ACT_INVENTARIO';

-- ═══ G. VERIFICACIÓN POST-RECTIFICACIÓN (solo tras autorización y ejecución) ═

-- G.1 Estado final esperado de la FVC tras RECT-1 (valores exactos):
--     total_cost = 40.739.585,00 · líneas 111/112 = 1 CUP @ tasa 1
SELECT r.total_cost, ri.unit_cost, ri.moneda_recepcion, ri.tasa_cambio_recepcion
FROM public.receipts r
JOIN public.receipt_items ri ON ri.receipt_id = r.id
JOIN public.products p ON p.id = ri.product_id
WHERE r.id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63' AND p.sku IN ('111','112');

-- G.2 Asientos de rectificación presentes, enlazados y equilibrados:
--     RECT-1 (reversal_of = 93bb5da9) D PAS_CXP_PROV 151.299.851 /
--     C ACT_INVENTARIO 151.299.851; RECT-2 D GAS_VALES 6 + D GAS_PERDIDA_INV
--     18 / C ACT_INVENTARIO 24; D=C por asiento
SELECT fe.document_number, fe.event, fe.reversal_of,
       sum(CASE WHEN fm.sense='debito' THEN fm.amount ELSE -fm.amount END) AS balance_debe
FROM public.fin_entries fe
JOIN public.fin_movements fm ON fm.entry_id = fe.id
WHERE fe.document_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
  AND fe.event = 'ajuste_manual'
GROUP BY 1, 2, 3 ORDER BY 1;
-- (esperado: dos filas con balance_debe = 0.00 exacto)

-- G.3 Salidas uc=0 restantes de estos SKU (esperado: 0 filas tras RECT-2)
SELECT count(*) AS salidas_uc0_restantes
FROM public.stock_movements
WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')
  AND quantity_change < 0 AND unit_cost = 0;

-- G.4 Mayores tras la rectificación (esperado: ACT = antes − 151.299.851 − 24;
--     PAS_CXP_PROV = antes − 151.299.851; el "antes" se mide EN el momento de
--     la ejecución con F.3/B.7)
SELECT fm.category_code,
       sum(CASE WHEN fm.sense='debito' THEN fm.amount_cup ELSE -fm.amount_cup END) AS neto_debito,
       sum(CASE WHEN fm.sense='credito' THEN fm.amount_cup ELSE -fm.amount_cup END) AS neto_credito
FROM public.fin_movements fm
WHERE fm.category_code IN ('ACT_INVENTARIO','PAS_CXP_PROV','GAS_VALES','GAS_PERDIDA_INV','GAS_COSTO_VENTAS')
GROUP BY 1 ORDER BY 1;

-- G.5 Idempotencia re-verificada (re-ejecutar S1-S4 de prueba → 0 filas): ver
--     el runbook RECT004_PRODUCTION_RUNBOOK.md §verificación post-aplicación.

-- ═══ H. INTEGRIDAD DEL EXPEDIENTE ════════════════════════════════════════════
-- Hashes SHA-256 de todos los entregables: RECT004_SHA256SUMS.txt
-- (recomputables con: sha256sum docs/audits/valuation-rectification-release-gate-004/RECT004_*)
