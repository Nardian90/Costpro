-- Migration: Fix audit_product_changes trigger function
-- Date: 2026-02-15
-- Author: Jules

BEGIN;

-- Correct the audit_product_changes function to use 'price' instead of 'sale_price'
CREATE OR REPLACE FUNCTION public.audit_product_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
        VALUES (
            auth.uid(),
            'CREATE_PRODUCT',
            'products',
            NEW.id,
            jsonb_build_object('name', NEW.name, 'sku', NEW.sku, 'price', NEW.price, 'cost_price', NEW.cost_price),
            NEW.store_id
        );
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Log Price Change
        IF (OLD.price IS DISTINCT FROM NEW.price OR OLD.cost_price IS DISTINCT FROM NEW.cost_price) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'UPDATE_PRICES',
                'products',
                NEW.id,
                jsonb_build_object('price', OLD.price, 'cost_price', OLD.cost_price, 'name', OLD.name),
                jsonb_build_object('price', NEW.price, 'cost_price', NEW.cost_price, 'name', NEW.name),
                NEW.store_id
            );
        END IF;

        -- Log other important changes (name, sku) if not already logged by price change
        IF (OLD.name IS DISTINCT FROM NEW.name OR OLD.sku IS DISTINCT FROM NEW.sku) THEN
             IF (OLD.price IS NOT DISTINCT FROM NEW.price AND OLD.cost_price IS NOT DISTINCT FROM NEW.cost_price) THEN
                INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
                VALUES (
                    auth.uid(),
                    'UPDATE_PRODUCT',
                    'products',
                    NEW.id,
                    jsonb_build_object('name', OLD.name, 'sku', OLD.sku),
                    jsonb_build_object('name', NEW.name, 'sku', NEW.sku),
                    NEW.store_id
                );
             END IF;
        END IF;
    END IF;
    -- Note: managed_delete_product already handles DELETE audit.
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMIT;
