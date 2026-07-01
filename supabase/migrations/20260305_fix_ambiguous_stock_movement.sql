-- Migration: Fix Ambiguous register_stock_movement
-- Description: Drops the obsolete 9-parameter version of register_stock_movement to resolve ambiguity.

BEGIN;

-- Drop the 9-parameter version
DROP FUNCTION IF EXISTS public.register_stock_movement(
    uuid,   -- p_product_id
    uuid,   -- p_store_id
    uuid,   -- p_user_id
    integer,-- p_quantity
    text,   -- p_movement_type
    text,   -- p_reason
    uuid,   -- p_sale_id
    numeric,-- p_unit_cost
    text    -- p_notes
);

-- Ensure the 10-parameter version is the only one and is correctly defined
-- (We already have it, but this ensures it's granting permissions)
GRANT EXECUTE ON FUNCTION public.register_stock_movement(uuid, uuid, uuid, integer, text, text, uuid, numeric, text, uuid) TO authenticated;

COMMIT;
