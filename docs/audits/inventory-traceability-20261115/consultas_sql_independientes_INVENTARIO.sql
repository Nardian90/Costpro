-- ═══════════════════════════════════════════════════════════════════════════════
-- CP-INVENTORY-TRACEABILITY-RECONCILIATION-001
-- CONSULTAS SQL INDEPENDIENTES Y REPRODUCIBLES (producción — SOLO LECTURA)
-- Ejecutar contra el proyecto Supabase wthkddeleylijmonclxg (PostgreSQL 15+).
-- Cada consulta es autónoma y reproducible: devuelve el mismo resultado en
-- cualquier momento posterior (salvo que cambien los datos).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── F1. Movimientos de compra sin reference_id (debe devolver 0 tras Fase II) ─
SELECT sm.store_id, s.name AS tienda, count(*) AS n
FROM public.stock_movements sm
LEFT JOIN public.stores s ON s.id = sm.store_id
WHERE sm.movement_type = 'purchase' AND sm.reference_id IS NULL
GROUP BY 1, 2 ORDER BY n DESC;

-- ─── F2. Conteo de trazabilidad reparada por misión ───────────────────────────
SELECT count(*) AS total_backfill
FROM public.audit_logs
WHERE action = 'TRACEABILITY_BACKFILL';
-- esperado 309 = 101 (M025, FVC) + 208 (M028, otras recepciones)

-- ─── F3. Verificación de conservación económica de los 208 (muestra íntegra) ──
-- Los movimientos reparados conservan cantidades/costos/fechas; solo cambia reference_id
SELECT count(*) AS filas_conservadas
FROM public.stock_movements sm
JOIN public.receipt_items ri ON ri.receipt_id = sm.reference_id::uuid
WHERE sm.movement_type = 'purchase'
  AND ri.product_id = sm.product_id
  AND abs(ri.quantity - sm.quantity_change) <= 1e-6
  AND abs(ri.unit_cost * coalesce(NULLIF(ri.tasa_cambio_recepcion, 0), 1) - sm.unit_cost) <= 0.005;
-- esperado 309 (101 FVC + 208) — correspondencia producto+cantidad+costo 1:1

-- ─── F4. Mayor ACT_INVENTARIO: débitos/créditos por categoría de movimiento ───
SELECT fe.document_type, fe.event, fm.sense, count(DISTINCT fe.id) AS asientos,
       sum(fm.amount_cup) AS total_cup
FROM public.fin_movements fm
JOIN public.fin_entries fe ON fe.id = fm.entry_id
WHERE fm.category_code = 'ACT_INVENTARIO'
GROUP BY 1, 2, 3 ORDER BY 1, 3;

-- ─── F5. Saldo contable ACT_INVENTARIO por tienda ─────────────────────────────
SELECT s.name AS tienda,
       sum(CASE WHEN fm.sense='debito' THEN fm.amount_cup ELSE -fm.amount_cup END) AS saldo_cup
FROM public.fin_movements fm
LEFT JOIN public.stores s ON s.id = fm.store_id
WHERE fm.category_code = 'ACT_INVENTARIO'
GROUP BY 1 ORDER BY saldo_cup DESC;
-- esperado: ENERVIDA 189.439.466,38 · COSTPRO 12.258.163,67 · PUERTO PADRE 1.616,50

-- ─── F6. Serie mensual del saldo (fecha económica) ────────────────────────────
SELECT date_trunc('month', fm.economic_date)::date AS mes,
       sum(CASE WHEN fm.sense='debito' THEN fm.amount_cup ELSE -fm.amount_cup END) AS delta,
       sum(sum(CASE WHEN fm.sense='debito' THEN fm.amount_cup ELSE -fm.amount_cup END))
         OVER (ORDER BY date_trunc('month', fm.economic_date)::date) AS saldo_acumulado
FROM public.fin_movements fm
WHERE fm.category_code = 'ACT_INVENTARIO'
GROUP BY 1 ORDER BY 1;

-- ─── F7. Reconstrucción de cantidades por SKU vs existencias registradas ──────
SELECT p.sku, p.name,
       sum(sm.quantity_change) AS existencia_calculada,
       max(p.stock_current) AS stock_current,
       (SELECT i.quantity FROM public.inventory i
         WHERE i.product_id = sm.product_id AND i.store_id = sm.store_id LIMIT 1) AS inventory_qty
FROM public.stock_movements sm
JOIN public.products p ON p.id = sm.product_id
WHERE sm.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' -- ENERVIDA-VITALLCONS
GROUP BY p.sku, p.name, sm.product_id, sm.store_id
HAVING abs(sum(sm.quantity_change) - max(p.stock_current)) > 1e-6;
-- esperado: 0 filas (conciliación perfecta de cantidades)

-- ─── F8. Recibido según movimientos vs según líneas de recepción (por producto)
SELECT r.store_id, ri.product_id,
       sum(ri.quantity) AS por_lineas,
       (SELECT sum(sm.quantity_change) FROM public.stock_movements sm
         WHERE sm.product_id = ri.product_id AND sm.store_id = r.store_id
           AND sm.movement_type='purchase') AS por_movimientos
FROM public.receipt_items ri
JOIN public.receipts r ON r.id = ri.receipt_id
GROUP BY r.store_id, ri.product_id
HAVING abs(coalesce((SELECT sum(sm.quantity_change) FROM public.stock_movements sm
         WHERE sm.product_id = ri.product_id AND sm.store_id = r.store_id
           AND sm.movement_type='purchase'), 0) - sum(ri.quantity)) > 1e-6;
-- esperado: 0 filas (compras == líneas; la recepción revertida compensa por su
-- purchase_reverse)

-- ─── F9. Identidades de valor: compras del kardex vs débitos del mayor ────────
SELECT
  (SELECT sum(quantity_change * unit_cost) FROM public.stock_movements
     WHERE movement_type='purchase') AS compras_kardex,
  (SELECT sum(fm.amount_cup) FROM public.fin_movements fm
     JOIN public.fin_entries fe ON fe.id = fm.entry_id
     WHERE fe.document_type='RECEPCION' AND fe.event='reconocimiento'
       AND fm.category_code='ACT_INVENTARIO' AND fm.sense='debito') AS debitos_mayor;
-- esperado: 207.256.110,57 = 207.256.110,57 (dif 0,00)

-- ─── F10. Ventas sin asiento contable (por tienda) ────────────────────────────
SELECT sm.store_id, sm.reference_doc, count(DISTINCT sm.reference_id) AS transacciones,
       sum(abs(sm.quantity_change) * sm.unit_cost) AS valor_segun_movimientos
FROM public.stock_movements sm
WHERE sm.movement_type = 'sale' AND sm.reference_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.fin_entries fe
                   WHERE fe.document_type='VENTA' AND fe.document_id = sm.reference_id::uuid)
GROUP BY 1, 2 ORDER BY 4 DESC;
-- documentado: 290 completed + 18 voided; valor movimientos 353.398,54 (ENER)

-- ─── F11. Vales de salida sin asiento contable ────────────────────────────────
SELECT sm.store_id, count(DISTINCT sm.reference_id) AS vales,
       sum(abs(sm.quantity_change) * sm.unit_cost) AS valor_movimientos
FROM public.stock_movements sm
WHERE sm.movement_type = 'issue_slip_out' AND sm.reference_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.fin_entries fe
                   WHERE fe.document_type='VALE_SALIDA' AND fe.document_id = sm.reference_id::uuid)
GROUP BY 1 ORDER BY 3 DESC;
-- documentado: 42 vales · 189.691,76 CUP (2,01 ENER · 189.644,76 COSTPRO · 45,00 PP)

-- ─── F12. Ajustes de inventario sin asiento (valor de movimientos) ────────────
SELECT sum(quantity_change * unit_cost) AS valor_ajustes_movimientos,
       (SELECT sum(fm.amount_cup) FROM public.fin_movements fm
          JOIN public.fin_entries fe ON fe.id = fm.entry_id
          WHERE fe.document_type='AJUSTE_INVENTARIO'
            AND fm.category_code='ACT_INVENTARIO' AND fm.sense='credito') AS posted_mayor
FROM public.stock_movements WHERE movement_type='adjustment';
-- documentado: movimientos −511.418,00 vs posted 1,00 → 511.417 sin asiento

-- ─── F13. Reversiones/voids sin asiento (reingresan stock sin débito) ─────────
SELECT movement_type, count(*) AS n, sum(quantity_change) AS unidades,
       sum(quantity_change * unit_cost) AS valor
FROM public.stock_movements
WHERE movement_type IN ('sale_reverse','issue_slip_reverse','sale_void')
GROUP BY 1 ORDER BY 4 DESC;
-- documentado: 353.389,59 + 120.002,00 + 1,50 = 473.393,09 CUP sin débito al mayor

-- ─── F14. FAC-VITALLCONS-001: entrada por producto (tasa 680 aprobada) ────────
SELECT p.sku, p.name AS producto, ri.moneda_recepcion AS moneda,
       sum(ri.quantity) AS cantidad,
       sum(ri.quantity * ri.unit_cost * coalesce(NULLIF(ri.tasa_cambio_recepcion,0),1)) AS valor_cup
FROM public.receipt_items ri
JOIN public.products p ON p.id = ri.product_id
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
GROUP BY p.sku, p.name, ri.moneda_recepcion
ORDER BY valor_cup DESC;
-- total 192.039.436,00 CUP (101 líneas: 79 CUP@1 + 22 USD@680)

-- ─── F15. Movimientos de venta con costo 0 en el kardex (calidad de la capa) ──
SELECT count(*) AS movimientos, count(DISTINCT reference_id) AS transacciones,
       sum(abs(quantity_change)) AS unidades
FROM public.stock_movements
WHERE movement_type='sale' AND (unit_cost = 0 OR unit_cost IS NULL);
-- documentado: 557 movimientos · 556 transacciones · 2.652,72 unidades

-- ─── F16. Valorización a costos vigentes (por tienda) ─────────────────────────
SELECT s.name AS tienda, sum(p.stock_current * p.cost_average) AS valor_cup,
       sum(p.stock_current) AS unidades
FROM public.products p
LEFT JOIN public.stores s ON s.id = p.store_id
GROUP BY 1 ORDER BY valor_cup DESC;
-- ENERVIDA: 1.065.011,13 CUP · 7.078,35 unidades

-- ─── F17. Conteos físicos firmados (debe devolver 0) ──────────────────────────
SELECT (SELECT count(*) FROM public.physical_counts) AS physical_counts,
       (SELECT count(*) FROM public.physical_inventories WHERE status <> 'voided') AS inventarios_validos;
-- 0 y 0 → no existe certificación física; la conciliación es contable contra
-- inventario registrado; usar HOJA_CONTEO_FISICO_ENERVIDA.xlsx para el conteo real

-- ─── F18. COGS atribuido por producto (método indirecto documentado) ──────────
-- Base 1: cost_at_sale de transaction_items (asientos del motor)
SELECT ti.product_id, p.sku, sum(ti.quantity * ti.cost_at_sale) AS cogs_por_items
FROM public.transaction_items ti
JOIN public.products p ON p.id = ti.product_id
WHERE ti.cost_at_sale > 0
GROUP BY 1, 2 ORDER BY 3 DESC;
-- Base 2 (unicidad de producto): ver expediente m031c/m032 — el COGS de
-- transacciones de UN solo producto se atribuye a ese producto; residual
-- no atribuible: 2.060,40 CUP (2 transacciones multi-producto).

-- ─── F19. Puente mayor → valorización (ENERVIDA) ───────────────────────────────
WITH mayor AS (
  SELECT sum(CASE WHEN fm.sense='debito' THEN fm.amount_cup ELSE -fm.amount_cup END) AS saldo
  FROM public.fin_movements fm
  WHERE fm.category_code='ACT_INVENTARIO' AND fm.store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38'),
vigente AS (
  SELECT sum(p.stock_current * p.cost_average) AS valor
  FROM public.products p
  WHERE p.store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38')
SELECT (SELECT saldo FROM mayor) AS saldo_contable,
       (SELECT valor FROM vigente) AS valor_costos_vigentes,
       (SELECT saldo FROM mayor) - (SELECT valor FROM vigente) AS diferencia_total;
-- 189.439.466,38 − 1.065.011,13 = 188.374.455,25

-- ─── F20. FVC: productos con y sin existencia actual ─────────────────────────
WITH fvc AS (
  SELECT DISTINCT ri.product_id FROM public.receipt_items ri
  WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63')
SELECT count(*) FILTER (WHERE p.stock_current > 0) AS con_existencia,
       count(*) FILTER (WHERE p.stock_current = 0) AS sin_existencia,
       sum(p.stock_current * p.cost_average) AS valor_vigente_fvc
FROM public.products p JOIN fvc ON fvc.product_id = p.id
WHERE p.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
-- 45 con existencia · 56 sin existencia · 710.892,56 CUP valor vigente

-- ═══════════════════════════════════════════════════════════════════════════════
-- Nota de método: consultas F7-F8 usan agregación por producto+tienda; la
-- recepción revertida (a3fe3e76) queda compensada por su purchase_reverse.
-- Todas las escrituras de esta misión se limitaron a reference_id (Fase II) con
-- auditoría TRACEABILITY_BACKFILL; no se modificaron cantidades, costos, monedas,
-- tasas, WAC, notas, existencias ni asientos financieros.
-- ═══════════════════════════════════════════════════════════════════════════════
