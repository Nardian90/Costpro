-- Migration: Create missing functions
-- Date: 2024-08-02

BEGIN;

-- 1. Create the get_current_user_store_id function
CREATE OR REPLACE FUNCTION public.get_current_user_store_id()
RETURNS uuid AS $$
BEGIN
  RETURN (SELECT store_id FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the get_dashboard_kpis function
CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(p_store_id uuid DEFAULT NULL)
RETURNS TABLE(
    total_sales numeric,
    total_cost numeric,
    total_profit numeric,
    transaction_count bigint,
    avg_ticket numeric,
    total_cash numeric,
    total_card numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(total_amount), 0) AS total_sales,
    COALESCE(SUM(subtotal - total_amount), 0) AS total_cost,
    COALESCE(SUM(total_amount - (subtotal - total_amount)), 0) AS total_profit,
    COUNT(*) AS transaction_count,
    COALESCE(AVG(total_amount), 0) AS avg_ticket,
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) AS total_cash,
    COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total_amount ELSE 0 END), 0) AS total_card
  FROM public.transactions
  WHERE (p_store_id IS NULL OR store_id = p_store_id);
END;
$$ LANGUAGE plpgsql;
-- Migration: Create inventory adjustments infrastructure
-- Date: 2024-08-01

-- 1. Create the inventory_adjustments table
CREATE TABLE public.inventory_adjustments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, COMPLETED, CANCELLED
    notes TEXT,
    CONSTRAINT fk_store FOREIGN KEY (store_id) REFERENCES stores(id),
    CONSTRAINT fk_created_by FOREIGN KEY (created_by) REFERENCES profiles(id)
);

COMMENT ON TABLE public.inventory_adjustments IS 'Records a full or partial inventory count session.';
COMMENT ON COLUMN public.inventory_adjustments.status IS 'The current status of the adjustment process.';

-- 2. Create the inventory_adjustment_items table
CREATE TABLE public.inventory_adjustment_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    adjustment_id uuid NOT NULL,
    product_id uuid NOT NULL,
    expected_quantity INT NOT NULL,
    counted_quantity INT NOT NULL,
    difference INT GENERATED ALWAYS AS (counted_quantity - expected_quantity) STORED,
    CONSTRAINT fk_adjustment FOREIGN KEY (adjustment_id) REFERENCES inventory_adjustments(id) ON DELETE CASCADE,
    CONSTRAINT fk_product FOREIGN KEY (product_id) REFERENCES products(id)
);

COMMENT ON TABLE public.inventory_adjustment_items IS 'Details of each product counted within an inventory adjustment.';
COMMENT ON COLUMN public.inventory_adjustment_items.difference IS 'The calculated difference between counted and expected quantities.';


-- 3. Add RLS policies to the new tables
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_adjustment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to own store data" ON public.inventory_adjustments
FOR ALL
USING (store_id IN (SELECT public.get_current_user_store_id()))
WITH CHECK (store_id IN (SELECT public.get_current_user_store_id()));

CREATE POLICY "Allow related access for items" ON public.inventory_adjustment_items
FOR ALL
USING (
  adjustment_id IN (SELECT id FROM public.inventory_adjustments)
);

-- 4. Create an ENUM type for adjustment reasons to standardize inputs
CREATE TYPE public.inventory_adjustment_reason AS ENUM (
    'STOCKTAKE_SHRINKAGE',
    'STOCKTAKE_SURPLUS',
    'DAMAGED_GOODS',
    'OTHER'
);

-- 5. Add reason to adjustments table
ALTER TABLE public.inventory_adjustments
ADD COLUMN reason public.inventory_adjustment_reason;

ALTER TABLE public.inventory_adjustments
ALTER COLUMN reason SET NOT NULL;

-- 6. Grant usage for the new type
GRANT USAGE ON TYPE public.inventory_adjustment_reason TO authenticated;


COMMIT;
