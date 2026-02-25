-- Reconciliation script: Kardex vs Stock
-- This script identifies inconsistencies where the sum of movements does not match current stock.

WITH movement_summary AS (
    SELECT
        store_id,
        product_id,
        SUM(quantity_change) as calculated_stock
    FROM public.stock_movements
    GROUP BY store_id, product_id
),
inventory_comparison AS (
    SELECT
        i.store_id,
        i.product_id,
        i.quantity as current_stock,
        COALESCE(m.calculated_stock, 0) as calculated_stock,
        (i.quantity - COALESCE(m.calculated_stock, 0)) as discrepancy
    FROM public.inventory i
    FULL OUTER JOIN movement_summary m ON i.store_id = m.store_id AND i.product_id = m.product_id
)
SELECT
    s.name as store_name,
    p.name as product_name,
    ic.*
FROM inventory_comparison ic
JOIN public.stores s ON ic.store_id = s.id
JOIN public.products p ON ic.product_id = p.id
WHERE discrepancy != 0;
