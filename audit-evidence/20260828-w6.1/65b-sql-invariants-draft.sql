-- ══════════════════════════════════════════════════════════════════════
-- [W6.1 REVISION 65b — DERIVED FROM: 65-sql-invariants-draft.sql]
-- original document hash (RECONSTRUCTED 65):
--   2399f2fdec439e08a958d6cde7556360b3953b0bc0a165982a31ee05a7f6f2a8
-- reason for amendment: resolver CR-W6-2 (excepciones INV-06), CR-W6-3
--   (varianza A1/INV-08), CR-W6-7 (store_credit/INV-10), CR-W6-10 (join
--   INV-07), numerar INV-WAC-SINGLEWRITER con evidencia W6.1 (14 escritores),
--   corregir cast uuid del probe INV-13 (drift WAC-DF-08) y añadir INV-15
--   (conservación de valor) con dependencias declaradas.
-- changes vs original: bloques -- [AMEND-W6.1] inline; el SQL del original
--   SUBSISTE salvo las sondas marcadas. Destino: suite del harness (W7).
--   NO EJECUTAR EN PROD. :t_canon/:t0/:t1 = parámetros de ventana.
-- no production mutation: CONFIRMADO — documento puro.
-- ══════════════════════════════════════════════════════════════════════
-- W6 · 65b — INVARIANTES SQL (revisión W6.1)
-- Convenciones heredadas: violaciones esperadas = 0 bajo canon; unidades BASE;
-- CUP; tolerancia GREATEST(0.01, 1e-6*|valor|) salvo declaración.

-- INV-STOCK-LEDGER (INV-01) — SIN CAMBIOS (texto del original subsiste).
-- INV-NONNEG (INV-03) — SIN CAMBIOS.
-- INV-IDEMPOTENT-REPLAY (INV-11, runtime e2e) — SIN CAMBIOS.

-- [AMEND-W6.1] INV-02 — salvedad de desempate documentada (OBS-AF-01):
-- el orden por (movement_date, created_at) es ambiguo con timestamps idénticos
-- intra-transacción (múltiples líneas del mismo producto en una TX). El `ctid DESC`
-- del original es el desempate físico: MANTENER y tratar como requisito, no cosmética.

-- [AMEND-W6.1] INV-06 — COGS-FROZEN con excepciones sancionadas (CR-W6-2):
-- (a) SKU con WAC 0-documentado (H-FINAL) o (b) venta de orden con bandera admin
-- auditada. ELECCIÓN (a)/(b) = decisión del dueño (arrastra D-07); probe (a):
SELECT 'INV-06', count(*)
FROM transaction_items ti
JOIN transactions t ON t.id = ti.transaction_id
JOIN products p ON p.id = ti.product_id
WHERE t.completed_at >= :t_canon AND NOT p.is_service
  AND COALESCE(ti.cost_at_sale,0) <= 0
  AND NOT EXISTS (SELECT 1 FROM products pz
                  WHERE pz.id = p.id AND pz.metadata->>'documented_zero_wac' = 'true')
  AND NOT EXISTS (SELECT 1 FROM audit_logs al
                  WHERE al.record_id = t.id            -- record_id es UUID (WAC-DF-08)
                  AND al.metadata->>'approve_zero_cost_material' = 'true');

-- [AMEND-W6.1] INV-07 — paridad COGS↔movement con join AGREGADO por (txn, product)
-- (CR-W6-10: dos líneas del mismo producto en una TX tornaban ambigua la igualdad 1:1):
SELECT 'INV-07', t.id, ti.pid
FROM (
  SELECT transaction_id, product_id AS pid, SUM(quantity) q, SUM(cost_at_sale) c
  FROM transaction_items GROUP BY 1,2
) ti
JOIN transactions t ON t.id = ti.transaction_id
JOIN (
  SELECT reference_id::uuid AS tid, product_id, SUM(-quantity_change) q, SUM(unit_cost*quantity_change*-1) c
  FROM stock_movements WHERE movement_type='sale' GROUP BY 1,2
) sm ON sm.tid = t.id AND sm.product_id = ti.pid
WHERE t.completed_at >= :t_canon AND (ABS(sm.q - ti.q) > 1e-9 OR ABS(sm.c - ti.c) > 0.01);
-- NOTA DE GOBERNANZA: INV-07 certifica CONSISTENCIA interna, no legitimidad del costo;
-- la legitimidad la impone D-03 (server-side) — INV-06 + INV-15 cubren el resto.

-- [AMEND-W6.1] INV-08 — valoración kardex con ventana/varianza por base de reversión (CR-W6-3):
-- mientras A1 esté vigente, post-devolución el kardex acredita c_rev y el cache WAC_vigente:
-- la asimetría es ESTRUCTURAL y debe leerse con la línea de varianza etiquetada (INV-15.2.1)
-- o excluir ventanas marcadas basis-mismatch. Sonda estricta solo para productos SIN
-- devoluciones en su ventana reciente:
SELECT 'INV-08', last_k.store_id, last_k.product_id
FROM (
  SELECT DISTINCT ON (k.store_id,k.product_id) k.*
  FROM kardex_entries k ORDER BY k.store_id,k.product_id, k.created_at DESC, k.id DESC
) last_k
JOIN products p ON p.id = last_k.product_id AND p.store_id = last_k.store_id
WHERE NOT EXISTS (   -- ventana marcada: devolución activa en los últimos N eventos del producto
  SELECT 1 FROM kardex_entries kd
  WHERE kd.product_id = p.id AND kd.store_id = p.store_id
    AND kd.movement_type IN ('return') AND kd.created_at >= :t_canon
)
  AND ABS(last_k.balance_total_value - p.stock_current * p.cost_average)
      > GREATEST(0.01, 1e-6 * ABS(p.stock_current * p.cost_average));

-- INV-RETURN-CAP (INV-09) — SONDA SIN CAMBIOS (65 L63-70).
-- [AMEND-W6.1] Gobernanza: la sonda es correcta; el SISTEMA hoy la viola por diseño ausente
-- (sin tope ni lock — F.3/F7). Condición de aceptación W7: tope + advisory lock por
-- original_transaction_id ANTES de leer el acumulado (R-6). BLOCKED por nada (ya ordenado).

-- [AMEND-W6.1] INV-10 — contra-asiento con cláusula store_credit condicionada (CR-W6-7):
-- La sonda del original subsiste. Cláusula nueva (según decisión D-05 del dueño):
--   (a) EXIGIR fila espejo también para store_credit (recomendación técnica) → sin cambio;
--   (b) exención: añadir `AND d.payment_method <> 'store_credit'` a la sonda.
-- BLOCKED — OWNER DECISION (política contable del reembolso).

-- [AMEND-W6.1] INV-WAC-SINGLEWRITER — numeración formal (era sin número en 65):
-- Evidencia W6.1: ≥14 escritores de products.cost_average (w61-writers.sql, v2≡prod).
-- Implementación (estático pg_proc scan + runtime): toda actualización de
-- products.cost_average debe provenir EXCLUSIVAMENTE de fn_recalc_wac (PR-1).
-- Whitelist actual del esquema a extinguir en W7/W8: ver W6.1-DEFECT-REGISTER WAC-DF-01.
-- Sonda runtime equivalente: triggear un evento sintético en el harness y verificar
-- que cost_average solo cambia vía fn_recalc_wac (audit con wac_before/wac_after).

-- [AMEND-W6.1] INV-13 — corrección de cast (drift WAC-DF-08):
-- audit_logs.record_id es UUID en el esquema real; el original casteba po.id::text
-- (mismo defecto que rompe el RPC close). Sonda corregida:
SELECT 'INV-13', po.order_number
FROM production_orders po
WHERE po.updated_at >= :t_canon AND po.output_quantity > 0
  AND EXISTS (SELECT 1 FROM production_order_items pi WHERE pi.order_id = po.id
              AND COALESCE(pi.actual_unit_cost,0) = 0 AND pi.actual_qty > 0)
  AND NOT EXISTS (SELECT 1 FROM audit_logs al
                  WHERE al.record_id = po.id            -- UUID == UUID (sin ::text)
                  AND al.metadata->>'approve_zero_cost_material' = 'true');

-- INV-ADJUSTMENT-REQUIRES-COST (INV-14) — SIN CAMBIOS (65 L94-97).

-- ══════════════════════════════════════════════════════════════════
-- [AMEND-W6.1 NUEVO] INV-15 — VALUE CONSERVATION (formalización del dueño)
-- Definición completa (unidades/eventos/varianza): W6.1-INVARIANTS.md §2.
--   V(t1) − V(t0) = Σ aportes_contables(eventos) + Σ varianzas_base(eventos) ± tolerancia
-- Dependencias declaradas (DEP-1..DEP-4): snapshot inicial, materialización de varianza,
-- semántica stock-cero (conservar ca), precondición D-01=A.
-- Modo 'pre' informativo (sin snapshot inicial): ventanas que nacen en el primer
-- movimiento del producto (V(t0)=0) y devoluciones excluidas hasta resolver DEP-2.
WITH ev AS (
  SELECT sm.store_id, sm.product_id, sm.movement_date, sm.quantity_change,
         CASE
           WHEN sm.movement_type IN ('purchase','transfer_in','initial','adjustment')
                AND sm.quantity_change > 0
                THEN sm.quantity_change * sm.unit_cost                       -- entrada blend: +q×uc
           WHEN sm.movement_type IN ('sale','transfer_out','production_out')
                THEN sm.quantity_change * sm.unit_cost                       -- salida pura: −q×WAC
           WHEN sm.movement_type = 'return'
                THEN sm.quantity_change * sm.unit_cost                       -- A1: +q×c_rev (contable)
           ELSE NULL                                                         -- no valorado: 'void'…
         END AS aporte_contable,
         (sm.movement_type = 'return') AS es_reversa_base
  FROM stock_movements sm
  WHERE sm.movement_date >= :t0 AND sm.movement_date < :t1
)
SELECT 'INV-15-pre', e.store_id, e.product_id,
       SUM(e.aporte_contable) AS suma_aportes,
       SUM(CASE WHEN e.es_reversa_base THEN e.aporte_contable ELSE 0 END) AS en_reversas_excluidas_info
FROM ev e
WHERE e.aporte_contable IS NOT NULL
GROUP BY e.store_id, e.product_id
HAVING SUM(e.aporte_contable) IS NOT NULL;
-- Versión estricta (con V(t0) y varianza materializada) se fija en W7 cuando exista
-- inventory_history o snapshot equivalente [misma SCHEMA-DEPENDENCY que INV-04/05].
-- ══════════════════════════════════════════════════════════════════
