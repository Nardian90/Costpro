-- supabase/migrations/YYYYMMDDHHMMSS_create_bulk_update_products_rpc.sql

CREATE OR REPLACE FUNCTION bulk_update_products(
    p_products jsonb
)
RETURNS void AS $$
DECLARE
    product_record jsonb;
BEGIN
    FOR product_record IN SELECT * FROM jsonb_array_elements(p_products)
    LOOP
        UPDATE products
        SET
            name = COALESCE((product_record->>'name'), name),
            price = COALESCE((product_record->>'price')::numeric, price),
            cost_price = COALESCE((product_record->>'cost_price')::numeric, cost_price),
            image_url = COALESCE((product_record->>'image_url'), image_url)
        WHERE
            id = (product_record->>'id')::uuid;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
