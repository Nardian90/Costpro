-- DECLARED FINAL STATE (Git) de bulk_update_products
-- fuente: 20260124_enforce_store_sku_uniqueness.sql stmt#2

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
$$ LANGUAGE plpgsql
