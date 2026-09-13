-- DECLARED FINAL STATE (Git) de audit_product_changes
-- fuente: 20260215_fix_sale_price_error.sql stmt#3

CREATE OR REPLACE FUNCTION public.audit_product_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        store_id
    )
    VALUES (
        auth.uid(),
        'UPDATE_PRODUCT',
        'products',
        NEW.id,
        jsonb_build_object(
            'name', OLD.name,
            'price', OLD.price,
            'cost_price', OLD.cost_price,
            'sku', OLD.sku
        ),
        jsonb_build_object(
            'name', NEW.name,
            'price', NEW.price,
            'cost_price', NEW.cost_price,
            'sku', NEW.sku
        ),
        NEW.store_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
