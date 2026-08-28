-- ══════════════════════════════════════════════════════════════════════
-- [ RECONSTRUCTED-FROM-TRANSCRIPT — NO ES EVIDENCIA ORIGINAL ]
-- Reconstruido: 2026-08-28 · Original perdido en reinicio de sandbox
-- Original: download/auditoria-multitienda/WAC-DATAFLOW/W6-CANONICAL-DESIGN/65-sql-invariants-draft.sql
-- Método: verbatim desde transcripción (lectura íntegra previa a la pérdida);
--         único añadido = este bloque de comentarios. SHA-256: ver 00-RECONSTRUCTION-MANIFEST.md
-- ══════════════════════════════════════════════════════════════════════
-- W6 · 65 — BORRADOR DE INVARIANTES SQL (INV-01..14)
-- Destino: suite permanente del Audit Harness (W7). NO EJECUTAR EN PROD.
-- Cada sonda devuelve el NÚMERO de violaciones (esperado = 0 bajo canon).
-- :t_canon = cutoff temporal (post-W8); en era pre-T usar variantes 'pre' solo informativas.
-- Tolerancia monetaria: 0.01 CUP; unidades: exactas.
-- ══════════════════════════════════════════════════════════════════════

-- INV-STOCK-LEDGER · inventory == Σ ledger por tienda/producto
SELECT store_id, product_id, 'INV-01' AS inv, count(*) FILTER (WHERE delta_qty <> i.quantity) AS violations
FROM (
  SELECT sm.store_id, sm.product_id,
         SUM(sm.quantity_change)::numeric AS delta_qty
  FROM stock_movements sm GROUP BY 1,2
) d JOIN inventory i ON i.store_id=d.store_id AND i.product_id=d.product_id;

-- INV-CACHE · products.stock_current == último balance_after del producto/tienda
SELECT p.store_id, p.id, 'INV-02', count(*)
FROM products p JOIN LATERAL (
  SELECT balance_after FROM stock_movements sm
  WHERE sm.product_id=p.id AND sm.store_id=p.store_id ORDER BY movement_date DESC, ctid DESC LIMIT 1
) b ON true
WHERE p.stock_current IS DISTINCT FROM b.balance_after AND NOT p.is_service;

-- INV-NONNEG · ningún stock negativo físico en ninguna capa
SELECT 'INV-03', count(*) FROM inventory WHERE quantity < 0;

-- INV-WAC-INTEGRITY-EVENTS · para movimientos con wac_before/wac_after [SCHEMA-CANDIDATE]:
-- entradas: ca_after*(S_prev+Δ) ≈ S_prev*ca_before+Δ*uc ; salidas puras: ca_after==ca_before
SELECT 'INV-04/05', count(*) FROM stock_movements m
JOIN LATERAL (SELECT quantity AS s_prev FROM inventory_history h WHERE h.product_id=m.product_id AND h.store_id=m.store_id AND h.before_ts=m.movement_date LIMIT 1) sp ON true
WHERE m.created_at >= :t_canon AND COALESCE(m.wac_before,-1) = -1; -- placeholder de diseño (ver notas)

-- Nota INV-04/05: requiere materializar snapshots WAC por evento (wac_before/after o tabla history).
-- Diseño definitivo del probe se fija en W7 cuando exista la columna/tabla candidata.

-- INV-COGS-FROZEN · toda venta física post-T: cost_at_sale>0 y unidad cero prohibida
SELECT 'INV-06', count(*) FROM transaction_items ti
JOIN transactions t ON t.id=ti.transaction_id
JOIN products p ON p.id=ti.product_id
WHERE t.completed_at >= :t_canon AND NOT p.is_service AND COALESCE(ti.cost_at_sale,0) <= 0;

-- INV-COGS-MOVEMENT-PARITY · cost_at_sale item == unit_cost movement de la misma venta/unidades
SELECT 'INV-07', count(*) FROM transaction_items ti
JOIN transactions t ON t.id=ti.transaction_id
JOIN stock_movements sm ON sm.reference_id::uuid = t.id AND sm.movement_type='sale'
     AND sm.quantity_change = -ti.quantity
WHERE t.completed_at >= :t_canon AND abs(sm.unit_cost - ti.cost_at_sale) > 0.01;

-- INV-VALUATION-KARDEX · última fila kardex por producto == stock×WAC corriente (tolerancia)
SELECT 'INV-08', count(*) FROM (
  SELECT DISTINCT ON (k.store_id,k.product_id) k.*
  FROM kardex_entries k ORDER BY k.store_id,k.product_id, k.created_at DESC, k.id DESC
) last_k JOIN products p ON p.id=last_k.product_id AND p.store_id=last_k.store_id
WHERE abs(last_k.balance_total_value - p.stock_current*p.cost_average) > GREATEST(0.01, 1e-6*abs(p.stock_current*p.cost_average));

-- INV-RETURN-CAP · devuelto acumulado ≤ vendido por (txn original, producto)
WITH sold AS (SELECT transaction_id, product_id, SUM(quantity) q FROM transaction_items GROUP BY 1,2),
     returned AS (SELECT d.original_transaction_id tid, di.product_id, SUM(di.quantity) q
                  FROM devolution_items di JOIN devolutions d ON d.id=di.devolution_id
                  WHERE d.status='completed' GROUP BY 1,2)
SELECT 'INV-09', r.tid::text, r.product_id::text
FROM returned r JOIN sold s ON s.transaction_id=r.tid AND s.product_id=r.product_id
WHERE r.q > s.q + 1e-9;

-- INV-CONTRA-FINANCE · devolución completada post-T ⇒ ≥1 reembolsos espejo que cuadren (dir refund)
SELECT 'INV-10', d.id FROM devolutions d
WHERE d.status='completed' AND d.created_at >= :t_canon
  AND (SELECT COALESCE(SUM(pt.amount_cup),0) FROM payment_transactions pt
       WHERE pt.ref_type='devolution' AND pt.ref_id=d.id) < abs(d.total_amount) - 0.01;

-- INV-IDEMPOTENT-REPLAY (runtime, harness): replay del mismo key no cambia censal ni devuelve error. Ejecutado como caso e2e del suite, no como SQL estático.

-- INV-CP-NOFINANCIAL (estático, test de repo): grep禁忌 — queries financieras que toquen products.cost_price.
--   Implementado como escaneo de código en vitest (lista blanca: catálogo/completitud/guard variación).

-- INV-WAC-SINGLEWRITER (estático/runtime): ninguna ruta distinta de fn_recalc_wac UPDATEa products.cost_average
--   (pg_proc scan: functions whose body matches 'UPDATE\s+products\s+SET[^W]*cost_average\s*=' EXCEPT whitelist → inviolación).

-- INV-PRODUCTION-NOCOSTZERO · orden cerrada post-T sin materiales a costo 0 sin bandera admin auditada
SELECT 'INV-13', po.order_number FROM production_orders po
WHERE po.updated_at >= :t_canon AND po.output_quantity > 0
  AND EXISTS (SELECT 1 FROM production_order_items pi WHERE pi.order_id=po.id
              AND COALESCE(pi.actual_unit_cost,0)=0 AND pi.actual_qty>0)
  AND NOT EXISTS (SELECT 1 FROM audit_logs al WHERE al.record_id=po.id::text
                  AND al.metadata->>'approve_zero_cost_material'='true');

-- INV-ADJUSTMENT-REQUIRES-COST · ajustes Δ>0 post-T siempre con uc_event>0
SELECT 'INV-14', sm.id FROM stock_movements sm
WHERE sm.movement_type='adjustment' AND sm.quantity_change>0 AND sm.created_at>=:t_canon
  AND COALESCE(sm.unit_cost,0)<=0;
