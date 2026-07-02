-- ============================================================================
-- Migration: 20260702000002_backfill_wac_currency_conversion.sql
-- Fix P2.2: Recalcular cost_average para productos con recepciones en moneda extranjera
--
-- PROBLEMA: Antes del fix P0, las RPCs calculaban cost_average sin multiplicar
-- por tasa_cambio_recepcion. Las recepciones en USD/EUR/MLC dejaron cost_average
-- con valores en moneda original (ej: 1 en vez de 500).
--
-- SOLUCIÓN: Recalcular cost_average usando unit_cost * tasa_cambio_recepcion
-- para todas las recepciones activas (no voided).
--
-- ADVERTENCIA: Este script es DESTRUCTIVO — sobrescribe cost_average existente.
-- Hacer backup de la tabla products antes de ejecutar:
--   COPY products TO '/tmp/products_backup.csv' WITH CSV HEADER;
--
-- EJECUCIÓN: Manual en Supabase SQL Editor. Verificar el SELECT de preview
-- antes del UPDATE.
-- ============================================================================

-- ── 1. PREVIEW: Productos afectados con el cálculo correcto ──────────────
-- Ejecutar este SELECT primero para verificar qué se va a cambiar.
-- Comentar/descomentar según se quiera preview o update.

SELECT
  p.id,
  p.sku,
  p.name,
  p.cost_average AS current_cost_average,
  p.cost_price,
  p.stock_current,
  ROUND(COALESCE(
    -- WAC = sum(quantity * unit_cost * tasa) / sum(quantity)
    -- Solo recepciones activas (no voided), con conversión a CUP
    (
      SELECT SUM(ri.quantity * ri.unit_cost * COALESCE(ri.tasa_cambio_recepcion, 1.0))
      FROM receipt_items ri
      JOIN receipts r ON ri.receipt_id = r.id
      WHERE ri.product_id = p.id AND r.status = 'active'
    )::NUMERIC /
    NULLIF(
      (
        SELECT SUM(ri.quantity)
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE ri.product_id = p.id AND r.status = 'active'
      ), 0
    ),
    p.cost_price,
    0
  ), 4) AS new_cost_average,
  -- Info de debug
  (
    SELECT COUNT(*)
    FROM receipt_items ri
    JOIN receipts r ON ri.receipt_id = r.id
    WHERE ri.product_id = p.id AND r.status = 'active'
      AND (COALESCE(ri.moneda_recepcion, 'CUP') != 'CUP' OR COALESCE(ri.tasa_cambio_recepcion, 1.0) != 1.0)
  ) AS foreign_currency_receptions
FROM products p
WHERE EXISTS (
  SELECT 1 FROM receipt_items ri
  JOIN receipts r ON ri.receipt_id = r.id
  WHERE ri.product_id = p.id AND r.status = 'active'
    AND (COALESCE(ri.moneda_recepcion, 'CUP') != 'CUP' OR COALESCE(ri.tasa_cambio_recepcion, 1.0) != 1.0)
)
ORDER BY foreign_currency_receptions DESC;

-- ── 2. UPDATE: Recalcular cost_average ───────────────────────────────────
-- Descomentar para ejecutar. Verificar el preview arriba primero.

-- UPDATE products p
-- SET cost_average = (
--   SELECT ROUND(COALESCE(
--     (
--       SELECT SUM(ri.quantity * ri.unit_cost * COALESCE(ri.tasa_cambio_recepcion, 1.0))
--       FROM receipt_items ri
--       JOIN receipts r ON ri.receipt_id = r.id
--       WHERE ri.product_id = p.id AND r.status = 'active'
--     )::NUMERIC /
--     NULLIF(
--       (
--         SELECT SUM(ri.quantity)
--         FROM receipt_items ri
--         JOIN receipts r ON ri.receipt_id = r.id
--         WHERE ri.product_id = p.id AND r.status = 'active'
--       ), 0
--     ),
--     p.cost_price,
--     0
--   ), 4)
-- ),
-- updated_at = NOW()
-- WHERE EXISTS (
--   SELECT 1 FROM receipt_items ri
--   JOIN receipts r ON ri.receipt_id = r.id
--   WHERE ri.product_id = p.id AND r.status = 'active'
--     AND (COALESCE(ri.moneda_recepcion, 'CUP') != 'CUP' OR COALESCE(ri.tasa_cambio_recepcion, 1.0) != 1.0)
-- );

-- ── 3. Verificar cambios ─────────────────────────────────────────────────
-- SELECT id, sku, name, cost_average, updated_at FROM products
-- WHERE updated_at > NOW() - INTERVAL '5 minutes'
-- ORDER BY updated_at DESC;

-- ── 4. Actualizar stock_movements con costo en CUP ───────────────────────
-- Los stock_movements también tienen unit_cost en moneda original.
-- Actualizar solo los que vienen de recepciones en moneda extranjera.

-- UPDATE stock_movements sm
-- SET unit_cost = sm.unit_cost * COALESCE(
--   (SELECT ri.tasa_cambio_recepcion
--    FROM receipt_items ri
--    WHERE ri.receipt_id = sm.reference_doc
--      AND ri.product_id = sm.product_id
--    LIMIT 1),
--   1.0
-- )
-- WHERE sm.movement_type = 'purchase'
--   AND sm.reference_doc IN (
--     SELECT id FROM receipts WHERE status = 'active'
--   )
--   AND EXISTS (
--     SELECT 1 FROM receipt_items ri
--     WHERE ri.receipt_id = sm.reference_doc
--       AND ri.product_id = sm.product_id
--       AND COALESCE(ri.tasa_cambio_recepcion, 1.0) != 1.0
--   );

NOTIFY pgrst, 'reload schema';
