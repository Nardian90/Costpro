-- DECLARED FINAL STATE (Git) de fn_audit_stock_reception
-- fuente: 20260318_harden_audit_logging.sql stmt#4

CREATE OR REPLACE FUNCTION public.fn_audit_stock_reception()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.audit_logs (
        user_id,
        table_name,
        record_id,
        action,
        new_data,
        description
    ) VALUES (
        auth.uid(),
        'stock_movements',
        NEW.id,
        'PURCHASE',
        row_to_json(NEW),
        format('Stock purchase: %s units of product %s', NEW.quantity_change, NEW.product_id)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
