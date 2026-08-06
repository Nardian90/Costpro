-- ============================================================================
-- Migration: 20260807000010_v2_21_4_fix_create_sale_v2_security.sql
-- Iteración RLS Hot Test — Fix Bugs #1 + #2
-- ============================================================================
-- Bug #1: create_sale_v2 no validaba store.is_active. Stores archivadas
--   permitían ventas. Fix: añadir check ERR_STORE_INACTIVE.
-- Bug #2: create_sale_v2 fallback de stock (cuando no hay inventory row)
--   consultaba products WHERE id = v_pid SIN filtrar por store_id. Esto
--   permitía vender productos de Store A en Store B. Fix: añadir
--   AND store_id = p_store_id al fallback.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────
-- Los cambios se aplican vía script Python (fix_5_bugs.py) porque requieren
-- extraer el body del RPC existente y modificarlo. Este archivo documenta
-- los cambios para el registro de migraciones.
--
-- Cambios en create_sale_v2:
-- 1. Después de has_store_access_as check:
--    IF NOT EXISTS (SELECT 1 FROM stores WHERE id = p_store_id AND is_active = true)
--    THEN RAISE EXCEPTION 'ERR_STORE_INACTIVE';
--
-- 2. Fallback de stock (línea 60):
--    Old: SELECT stock_current INTO v_stock FROM products WHERE id = v_pid FOR UPDATE;
--    New: SELECT stock_current INTO v_stock FROM products WHERE id = v_pid AND store_id = p_store_id FOR UPDATE;

COMMENT ON FUNCTION public.create_sale_v2 IS
  'v2.21.4 Fix: Bug #1 (store.is_active validation) + Bug #2 (stock fallback store_id filter)';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Restaurar create_sale_v2 sin los fixes (requiere backup del source original)
-- ============================================================================
