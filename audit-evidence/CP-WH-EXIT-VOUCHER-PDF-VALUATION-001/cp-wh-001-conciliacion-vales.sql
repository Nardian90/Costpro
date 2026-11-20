-- CP-WH-EXIT-VOUCHER-PDF-VALUATION-001 — Conciliación Vales de Salida ↔ Inventario
-- SOLO LECTURA (guard fail-closed del aplicador). Producción CostproBD.
-- Comprueba §3.2 del informe: ciclos, descuento único, reversiones, huérfanos,
-- duplicados, negativos y aislamiento de tienda.

-- 1. Universo de vales por tienda y estado
SELECT s.name AS tienda, i.status, count(*) AS vales
FROM public.issue_slips i JOIN public.stores s ON s.id = i.store_id
GROUP BY s.name, i.status ORDER BY s.name, i.status;

-- 2. Vales 'completed' SIN movimientos (huérfanos: un completado debe descontar)
SELECT i.slip_number, i.status, s.name AS tienda, i.created_at::date
FROM public.issue_slips i JOIN public.stores s ON s.id = i.store_id
WHERE i.status = 'completed'
  AND NOT EXISTS (SELECT 1 FROM public.stock_movements m WHERE m.reference_id = i.id::text AND m.movement_type = 'issue_slip_out')
ORDER BY i.created_at;

-- 3. Vales 'pending' o 'voided' CON movimientos (no debieron descontar)
SELECT i.slip_number, i.status, s.name AS tienda,
       (SELECT count(*) FROM public.stock_movements m WHERE m.reference_id = i.id::text) AS movimientos
FROM public.issue_slips i JOIN public.stores s ON s.id = i.store_id
WHERE i.status IN ('pending','voided')
  AND EXISTS (SELECT 1 FROM public.stock_movements m WHERE m.reference_id = i.id::text)
ORDER BY i.created_at;

-- 4. Vales 'reversed' SIN entrada compensatoria issue_slip_reverse
SELECT i.slip_number, s.name AS tienda
FROM public.issue_slips i JOIN public.stores s ON s.id = i.store_id
WHERE i.status = 'reversed'
  AND NOT EXISTS (SELECT 1 FROM public.stock_movements m WHERE m.reference_id = i.id::text AND m.movement_type = 'issue_slip_reverse')
ORDER BY i.created_at;

-- 5. Doble descuento: (vale, producto) con MÁS de un movimiento issue_slip_out
SELECT m.reference_id, i.slip_number, m.product_id, count(*) AS salidas,
       sum(m.quantity_change) AS total_cambiado
FROM public.stock_movements m
JOIN public.issue_slips i ON i.id::text = m.reference_id::text
WHERE m.movement_type = 'issue_slip_out'
GROUP BY m.reference_id, i.slip_number, m.product_id
HAVING count(*) > 1;

-- 6. Cantidades: suma de salidas por línea vs cantidad del ítem (mismatch)
WITH salida AS (
  SELECT m.reference_id, m.product_id, sum(ABS(m.quantity_change)) AS descontado
  FROM public.stock_movements m WHERE m.movement_type = 'issue_slip_out'
  GROUP BY m.reference_id, m.product_id
)
SELECT i.slip_number, s.name AS tienda, it.product_id, it.quantity AS item_qty, sa.descontado
FROM public.issue_slip_items it
JOIN public.issue_slips i ON i.id = it.slip_id
JOIN public.stores s ON s.id = i.store_id
JOIN salida sa ON sa.reference_id = i.id::text AND sa.product_id = it.product_id
WHERE i.status = 'completed' AND ABS(sa.descontado - it.quantity) > 0.0001
ORDER BY i.created_at;

-- 7. Movimientos huérfanos: issue_slip_out/reverse cuyo vale no existe
SELECT m.id, m.reference_id, m.movement_type, m.created_at::date
FROM public.stock_movements m
WHERE m.movement_type IN ('issue_slip_out','issue_slip_reverse')
  AND NOT EXISTS (SELECT 1 FROM public.issue_slips i WHERE i.id::text = m.reference_id::text)
LIMIT 50;

-- 8. Existencias negativas no autorizadas
SELECT p.id, p.name, p.store_id, p.stock_current
FROM public.products p WHERE p.stock_current < 0 LIMIT 50;

-- 9. Aislamiento de tienda: movimiento con store distinto al del vale
SELECT m.id, m.store_id AS store_movimiento, i.store_id AS store_vale, i.slip_number
FROM public.stock_movements m
JOIN public.issue_slips i ON i.id::text = m.reference_id::text
WHERE m.movement_type IN ('issue_slip_out','issue_slip_reverse') AND m.store_id <> i.store_id
LIMIT 50;

-- 10. Estado del ciclo: vales por estado + fecha de última transición registrada
SELECT i.status,
       count(*) FILTER (WHERE i.confirmed_at IS NOT NULL) AS confirmados,
       count(*) FILTER (WHERE i.voided_at IS NOT NULL) AS anulados_devueltos,
       min(i.created_at::date) AS primero, max(i.created_at::date) AS ultimo
FROM public.issue_slips i GROUP BY i.status;

-- 11. Asientos contables del evento VALE_SALIDA: equilibrio débito/crédito
SELECT e.document_type, count(*) AS asientos,
       sum(CASE WHEN em.sense='debito' THEN em.amount ELSE 0 END) AS total_debito,
       sum(CASE WHEN em.sense='credito' THEN em.amount ELSE 0 END) AS total_credito
FROM public.fin_entries e
JOIN public.fin_movements em ON em.entry_id = e.id
WHERE e.document_type = 'VALE_SALIDA'
GROUP BY e.document_type;

-- 12. Vales completados sin asiento contable VALE_SALIDA (motor CP-FIN)
SELECT count(*) AS vales_sin_asiento
FROM public.issue_slips i
WHERE i.status = 'completed'
  AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='VALE_SALIDA' AND e.document_id = i.id);

-- 13. Categorías contables usadas por VALE_SALIDA (¿GAS_VALES vs ACT_INVENTARIO?)
SELECT em.category_code, em.sense, count(*) AS movimientos, sum(em.amount) AS total
FROM public.fin_entries e
JOIN public.fin_movements em ON em.entry_id = e.id
WHERE e.document_type = 'VALE_SALIDA'
GROUP BY em.category_code, em.sense ORDER BY em.category_code, em.sense;
