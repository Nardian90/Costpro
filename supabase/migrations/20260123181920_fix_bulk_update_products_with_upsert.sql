DROP FUNCTION IF EXISTS bulk_update_products(jsonb);

CREATE OR REPLACE FUNCTION bulk_update_products(_products jsonb)
RETURNS TABLE(updated_count int, inserted_count int) AS $$
DECLARE
    inserted_count int;
    updated_count int;
BEGIN
    WITH upserted AS (
        INSERT INTO products (id, store_id, name, cost_price, price, image_url, created_at, updated_at)
        SELECT
            p.id::UUID,
            p.store_id::UUID,
            p.name,
            p.cost_price::NUMERIC,
            p.price::NUMERIC,
            p.image_url,
            NOW(),
            NOW()
        FROM jsonb_to_recordset(_products) AS p(
            id TEXT,
            store_id TEXT,
            name TEXT,
            cost_price TEXT,
            price TEXT,
            image_url TEXT
        )
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            price = EXCLUDED.price,
            cost_price = EXCLUDED.cost_price,
            image_url = EXCLUDED.image_url,
            updated_at = NOW()
        RETURNING xmax
    )
    SELECT
        SUM(CASE WHEN xmax::text::int > 0 THEN 1 ELSE 0 END), -- A non-zero xmax indicates an update
        SUM(CASE WHEN xmax = 0 THEN 1 ELSE 0 END)   -- 0 indicates an insert
    INTO updated_count, inserted_count
    FROM upserted;

    RETURN QUERY SELECT COALESCE(updated_count, 0), COALESCE(inserted_count, 0);
END;
$$ LANGUAGE plpgsql;