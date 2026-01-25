-- Migration: Enforce SKU uniqueness per store and update RPCs
-- Date: 2026-01-24

-- 1. Remove existing global SKU unique constraint if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_sku_key') THEN
        ALTER TABLE public.products DROP CONSTRAINT products_sku_key;
    END IF;
END $$;

-- 2. Ensure sku and store_id are not null for future consistency
-- (Optional: only if we can guarantee existing data satisfies this)
-- ALTER TABLE public.products ALTER COLUMN sku SET NOT NULL;
-- ALTER TABLE public.products ALTER COLUMN store_id SET NOT NULL;

-- 3. Add composite unique constraint for Multi-Store SKU isolation
ALTER TABLE public.products ADD CONSTRAINT products_store_sku_unique UNIQUE (store_id, sku);

-- 4. Update bulk_update_products RPC to match by (store_id, sku)
CREATE OR REPLACE FUNCTION bulk_update_products(_products jsonb)
RETURNS TABLE(updated_count int, inserted_count int) AS $$
DECLARE
    v_inserted_count int;
    v_updated_count int;
BEGIN
    WITH upserted AS (
        INSERT INTO products (
            store_id,
            sku,
            name,
            cost_price,
            price,
            image_url,
            category,
            unit_of_measure,
            updated_at
        )
        SELECT
            (p->>'store_id')::UUID,
            p->>'sku',
            p->>'name',
            COALESCE((p->>'cost_price')::NUMERIC, 0),
            COALESCE((p->>'price')::NUMERIC, 0),
            p->>'image_url',
            p->>'category',
            p->>'unit_of_measure',
            NOW()
        FROM jsonb_array_elements(_products) AS p
        WHERE p->>'sku' IS NOT NULL AND p->>'store_id' IS NOT NULL
        ON CONFLICT (store_id, sku) DO UPDATE SET
            name = EXCLUDED.name,
            price = EXCLUDED.price,
            cost_price = EXCLUDED.cost_price,
            image_url = EXCLUDED.image_url,
            category = EXCLUDED.category,
            unit_of_measure = EXCLUDED.unit_of_measure,
            updated_at = NOW()
        RETURNING xmax
    )
    SELECT
        SUM(CASE WHEN xmax::text::int > 0 THEN 1 ELSE 0 END),
        SUM(CASE WHEN xmax = 0 THEN 1 ELSE 0 END)
    INTO v_updated_count, v_inserted_count
    FROM upserted;

    RETURN QUERY SELECT COALESCE(v_updated_count, 0), COALESCE(v_inserted_count, 0);
END;
$$ LANGUAGE plpgsql;

-- 5. Update register_reception to allow matching by SKU within the active store
CREATE OR REPLACE FUNCTION register_reception(
    p_store_id UUID,
    p_supplier TEXT,
    p_reception_date DATE,
    p_invoice_number TEXT,
    p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reception_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity NUMERIC;
    v_unit_cost NUMERIC;
    v_total_cost NUMERIC := 0;
    v_items_count INT := 0;
    v_user_id UUID;
    v_user_store_id UUID;
    v_sku TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    v_user_id := auth.uid()::UUID;

    -- SECURITY CHECK
    v_user_store_id := public.current_user_store_id();
    IF v_user_store_id IS NULL THEN
        RAISE EXCEPTION 'User has no store assigned';
    END IF;
    IF v_user_store_id != p_store_id THEN
        RAISE EXCEPTION 'Invalid store_id for user';
    END IF;

    -- BASIC VALIDATIONS
    IF p_supplier IS NULL OR TRIM(p_supplier) = '' THEN RAISE EXCEPTION 'Supplier is required'; END IF;
    IF p_reception_date IS NULL THEN RAISE EXCEPTION 'Reception date is required'; END IF;
    IF p_reception_date > CURRENT_DATE THEN RAISE EXCEPTION 'Reception date cannot be in the future'; END IF;
    IF p_invoice_number IS NULL OR TRIM(p_invoice_number) = '' THEN RAISE EXCEPTION 'Invoice number is required'; END IF;

    -- DUPLICATE INVOICE CHECK
    IF EXISTS (
        SELECT 1 FROM receipts r
        JOIN public.profiles p ON p.id = r.user_id
        WHERE p.store_id = p_store_id
          AND r.reference_doc = FORMAT('%s | %s', TRIM(p_supplier), TRIM(p_invoice_number))
          AND r.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Duplicate invoice for this supplier in this store';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Reception must contain at least one item';
    END IF;

    v_items_count := jsonb_array_length(p_items);

    -- CREATE RECEPTION HEADER
    INSERT INTO receipts (
        user_id, total_cost, reference_doc, notes, created_at, status
    ) VALUES (
        v_user_id, 0, FORMAT('%s | %s', TRIM(p_supplier), TRIM(p_invoice_number)), NULL, p_reception_date, 'active'
    )
    RETURNING id INTO v_reception_id;

    -- PROCESS ITEMS
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_sku := v_item->>'sku';
        v_quantity := (v_item->>'quantity')::NUMERIC;
        v_unit_cost := (v_item->>'unit_cost')::NUMERIC;

        -- MATCH BY SKU IF PRODUCT_ID IS MISSING
        IF v_product_id IS NULL AND v_sku IS NOT NULL THEN
            SELECT id INTO v_product_id FROM products
            WHERE store_id = p_store_id AND sku = v_sku;
        END IF;

        IF v_product_id IS NULL THEN
            RAISE EXCEPTION 'Product with SKU % not found in this store', COALESCE(v_sku, 'UNKNOWN');
        END IF;

        IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'quantity must be greater than 0'; END IF;
        IF v_unit_cost IS NULL OR v_unit_cost < 0 THEN RAISE EXCEPTION 'unit_cost cannot be negative'; END IF;

        -- AUDIT ITEM
        INSERT INTO receipt_items (receipt_id, product_id, quantity, unit_cost, created_at)
        VALUES (v_reception_id, v_product_id, v_quantity, v_unit_cost, NOW());

        -- UPDATE INVENTORY
        INSERT INTO inventory (store_id, product_id, quantity, updated_at, created_at)
        VALUES (p_store_id, v_product_id, v_quantity, NOW(), NOW())
        ON CONFLICT (store_id, product_id) DO UPDATE SET
            quantity = inventory.quantity + v_quantity,
            updated_at = NOW();

        -- STOCK MOVEMENT
        INSERT INTO stock_movements (
            store_id, product_id, quantity_change, movement_type, reference_doc, reference_id, movement_date, created_by, created_at
        ) VALUES (
            p_store_id, v_product_id, v_quantity, 'purchase'::public.movement_type,
            FORMAT('%s | %s', TRIM(p_supplier), TRIM(p_invoice_number)), v_reception_id::TEXT, p_reception_date, v_user_id, NOW()
        );

        v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
    END LOOP;

    -- UPDATE TOTAL COST
    UPDATE receipts SET total_cost = v_total_cost, updated_at = NOW() WHERE id = v_reception_id;

    RETURN v_reception_id;
END;
$$;
