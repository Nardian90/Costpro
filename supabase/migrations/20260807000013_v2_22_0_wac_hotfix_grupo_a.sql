-- ============================================================================
-- Migration: 20260807000013_v2_22_0_wac_hotfix_grupo_a.sql
-- Iteración WAC Hotfix — Grupo A: Motor financiero de costos
-- ============================================================================
-- A1: Eliminar WAC update de register_reception (Path 3)
-- A2: Eliminar WAC update de register_stock_movement (Path 2)
-- A3: Fix void de recepción (inventory + stock_movements + kardex + WAC)
--
-- Los cambios se aplican vía CREATE OR REPLACE FUNCTION (in-place en DB).
-- Esta migración documenta los cambios para el registro.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- A1: register_reception — Path 3 WAC block eliminado
-- El bloque UPDATE products SET cost_average = CASE... fue reemplazado por
-- un comentario. El WAC lo calcula únicamente trg_update_product_wac.

-- A2: register_stock_movement — WAC recalculation block eliminado
-- El bloque UPDATE products SET cost_average = (SELECT... FROM stock_movements)
-- fue eliminado. El WAC lo calcula únicamente trg_update_product_wac.

-- A3: void_reception_with_reversal — Rewritten
-- Ahora usa register_stock_movement(movement_type='purchase_reverse') para
-- insertar la reversión, lo que automáticamente:
--   - Actualiza products.stock_current
--   - Actualiza inventory.quantity (via tr_sync_inventory_after_movement)
--   - Crea kardex_entries (via trg_auto_kardex)
-- Después restaura WAC con fórmula reversa:
--   new_wac = (old_stock * old_wac - void_qty * void_cost) / new_stock

COMMENT ON SCHEMA public IS
  'v2.22.0 WAC Hotfix Grupo A: Triple WAC conflict resolved + void restoration fixed.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Restaurar las 3 funciones a su estado anterior (requiere backup del source)
-- ============================================================================
