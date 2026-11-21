-- ============================================================================
-- CP-FIN-INV-EXPORT-AND-CONTINUOUS-RECONCILIATION-001 · Auditoría forense
-- Scripts de SOLO LECTURA para verificar el diagnóstico contra PRODUCCIÓN
-- (CostproBD wthkddeleylijmonclxg · tienda ENERVIDA-VITALLCONS
--  5e6fe821-5465-48b1-b3f1-3aa3182edc38).
--
-- POLÍTICA (AGENTS.md / REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS):
--   · Ejecutar en el SQL Editor de Supabase o psql con SET default_transaction_read_only = on;
--   · Cada script es una sola consulta agregada (≤ 10 por tarea, sin bucles, sin PII);
--   · NO modificar nada: cualquier corrección requiere expediente aprobado.
-- ============================================================================

-- ── 01 · Puente del mayor ACT_INVENTARIO + explicación de los 23.57 CUP ────
-- Verifica: saldo por evento = −2,355,627.46 y LOS DOCUMENTOS concretos
-- posteriores a la validación GEN-2 (2026-11-20 16:24 UTC) que explican el
-- delta de −23.57 (ventas nuevas 18,252.18 / anulación 18,226.61 / devolución 2.00).
SELECT e.event, e.document_type,
       round(sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END), 2) AS efecto_inventario,
       count(*) AS asientos
FROM fin_movements m
JOIN fin_entries e ON e.id = m.entry_id
WHERE m.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND m.category_code = 'ACT_INVENTARIO'
  AND e.generation_id = (SELECT id FROM fin_posting_generations WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND status = 'active')
GROUP BY 1, 2 ORDER BY 1, 2;

SELECT e.document_type, e.document_id, e.document_number, e.event, e.economic_date, e.posted_at,
       round(sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END), 2) AS efecto_inventario
FROM fin_entries e
JOIN fin_movements m ON m.entry_id = e.id
WHERE e.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND m.category_code = 'ACT_INVENTARIO'
  AND e.generation_id = (SELECT id FROM fin_posting_generations WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND status = 'active')
  AND e.posted_at > '2026-11-20 16:24:16+00'   -- instante de la validación GEN-2
GROUP BY 1, 2, 3, 4, 5, 6
ORDER BY e.posted_at;

-- ── 02 · Descomposición de la brecha operacional-contable (2,950,375.33) ───
-- Por producto: costo congelado (cost_at_sale) usado por las ventas/vales vs
-- el costo corregido (cost_average actual), y valor operativo vs mayor.
WITH vendido_congelado AS (
  SELECT ti.product_id,
         round(sum(ti.quantity * coalesce(NULLIF(ti.cost_at_sale, 0), p.cost_average, 0)), 2) AS cogs_historico
  FROM transaction_items ti
  JOIN transactions t ON t.id = ti.transaction_id
  LEFT JOIN products p ON p.id = ti.product_id
  WHERE t.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND t.status = 'completed'
  GROUP BY 1
),
vales_congelado AS (
  SELECT isi.product_id, round(sum(isi.quantity * isi.unit_cost), 2) AS vales_historico
  FROM issue_slip_items isi
  JOIN issue_slips i ON i.id = isi.slip_id
  WHERE i.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND i.status = 'completed'
  GROUP BY 1
)
SELECT p.sku, p.name, p.stock_current, p.cost_average, p.cost_price,
       round(p.stock_current * coalesce(p.cost_average, 0), 2) AS valor_operativo,
       coalesce(v.cogs_historico, 0) AS cogs_historico,
       coalesce(va.vales_historico, 0) AS vales_historico
FROM products p
LEFT JOIN vendido_congelado v ON v.product_id = p.id
LEFT JOIN vales_congelado va ON va.product_id = p.id
WHERE p.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND (p.stock_current <> 0 OR coalesce(v.cogs_historico, 0) <> 0 OR coalesce(va.vales_historico, 0) <> 0)
ORDER BY cogs_historico DESC
LIMIT 50;

-- ── 03 · Cobertura documental (generación activa) ──────────────────────────
-- Documentos operacionales postables SIN asiento y asientos SIN documento.
SELECT 'VENTA_SIN_ASIENTO' AS hallazgo, count(*) AS n FROM transactions t
WHERE t.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND t.status = 'completed'
  AND NOT EXISTS (SELECT 1 FROM fin_entries e WHERE e.document_type = 'VENTA' AND e.document_id = t.id
                    AND e.generation_id = (SELECT id FROM fin_posting_generations WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND status = 'active'))
UNION ALL
SELECT 'VALE_SIN_ASIENTO', count(*) FROM issue_slips i
WHERE i.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND i.status = 'completed'
  AND NOT EXISTS (SELECT 1 FROM fin_entries e WHERE e.document_type = 'VALE_SALIDA' AND e.document_id = i.id
                    AND e.generation_id = (SELECT id FROM fin_posting_generations WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND status = 'active'))
UNION ALL
SELECT 'RECEPCION_SIN_ASIENTO', count(*) FROM receipts r
WHERE r.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND r.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM fin_entries e WHERE e.document_type = 'RECEPCION' AND e.document_id = r.id
                    AND e.generation_id = (SELECT id FROM fin_posting_generations WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND status = 'active'))
UNION ALL
SELECT 'ASIENTO_VENTA_SIN_DOC', count(*) FROM fin_entries e
WHERE e.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND e.document_type = 'VENTA' AND e.document_id IS NOT NULL
  AND e.generation_id = (SELECT id FROM fin_posting_generations WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND status = 'active')
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = e.document_id);

-- ── 04 · Integridad de fuentes de valoración ───────────────────────────────
-- Kardex vs inventory vs products; costos cero; recibos activos vs PAS_CXP_PROV.
SELECT
  (SELECT count(*) FROM products WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38') AS productos,
  (SELECT count(*) FROM products WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND stock_current > 0) AS con_stock,
  (SELECT count(*) FROM products WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND stock_current <> 0 AND coalesce(cost_average, 0) = 0) AS sin_costo_verificable,
  (SELECT round(sum(stock_current * coalesce(cost_average, 0)), 2) FROM products WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38') AS valor_operacional_wac,
  (SELECT round(sum(stock_current * coalesce(cost_price, 0)), 2) FROM products WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38') AS valor_cost_price,
  (SELECT round(coalesce(sum(total_cost), 0), 2) FROM receipts WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND status = 'active') AS recibos_activos_total,
  (SELECT round(sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END), 2)
     FROM fin_movements m JOIN fin_entries e ON e.id = m.entry_id
     WHERE m.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND m.category_code = 'PAS_CXP_PROV'
       AND e.generation_id = (SELECT id FROM fin_posting_generations WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND status = 'active')) AS cxp_mayor;
