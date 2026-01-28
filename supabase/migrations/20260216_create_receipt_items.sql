-- Migration: Create receipt_items table and set up RLS
-- Date: 2026-02-16

BEGIN;

-- 1. Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
-- Policy: Users can view items of receipts they have access to
DROP POLICY IF EXISTS receipt_items_access ON public.receipt_items;
CREATE POLICY receipt_items_access ON public.receipt_items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.receipts r
            JOIN public.profiles p ON p.id = r.user_id
            WHERE r.id = public.receipt_items.receipt_id
              AND (
                  p.store_id = (SELECT store_id FROM public.profiles WHERE id = auth.uid())
                  OR public.is_admin()
              )
        )
    );

-- Policy: Users can insert items for receipts they can access
DROP POLICY IF EXISTS receipt_items_insert ON public.receipt_items;
CREATE POLICY receipt_items_insert ON public.receipt_items
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.receipts r
            JOIN public.profiles p ON p.id = r.user_id
            WHERE r.id = public.receipt_items.receipt_id
              AND (
                  p.store_id = (SELECT store_id FROM public.profiles WHERE id = auth.uid())
                  OR public.is_admin()
              )
        )
    );

-- 4. Grant Permissions
GRANT ALL ON public.receipt_items TO authenticated;
GRANT ALL ON public.receipt_items TO service_role;

-- 5. Add index for performance
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id ON public.receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_product_id ON public.receipt_items(product_id);

COMMIT;
