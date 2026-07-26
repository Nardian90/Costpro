-- ════════════════════════════════════════════════════════════════════════
-- V2.3.3 — FIX: Drop trigger legacy que bloqueaba reverse_production_order
--
-- PROBLEMA: existían 2 triggers sobre production_orders.status:
--   1. trg_validate_production_transition (V2.3, usa fn_validate_document_transition)
--   2. trigger_validate_production_order_status (legacy, usa validate_production_order_transition)
-- El trigger #2 no conocía el estado 'reversed' y bloqueaba con error:
--   "Desde En Progreso solo se puede pasar a Pausada, Completada, Cerrada o Anulada"
--
-- SOLUCIÓN: drop del trigger #2 y drop de la función legacy.
-- El trigger #1 (V2.3) ya maneja TODAS las transiciones válidas incluyendo reversed.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Drop trigger legacy
DROP TRIGGER IF EXISTS trigger_validate_production_order_status ON public.production_orders;

-- 2. Drop función legacy (ya no se usa)
DROP FUNCTION IF EXISTS public.validate_production_order_transition();

-- 3. Comentario informativo
COMMENT ON TRIGGER trg_validate_production_transition ON public.production_orders IS
'V2.3.3: Único trigger de validación de transiciones de estado en production_orders. Reemplaza al legacy validate_production_order_transition que no conocía el estado reversed.';
