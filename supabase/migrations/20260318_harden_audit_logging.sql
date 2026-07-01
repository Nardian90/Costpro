-- Harden audit logging for high-stakes events
-- Date: 2026-03-18

BEGIN;

-- Function to handle transaction voiding audit
CREATE OR REPLACE FUNCTION public.fn_audit_transaction_voiding()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'voided' AND OLD.status != 'voided' THEN
        INSERT INTO public.audit_logs (
            user_id,
            table_name,
            record_id,
            action,
            old_data,
            new_data,
            description
        ) VALUES (
            auth.uid(),
            'transactions',
            NEW.id,
            'VOID',
            row_to_json(OLD),
            row_to_json(NEW),
            'Transaction voided'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for transaction voiding
DROP TRIGGER IF EXISTS tr_audit_transaction_voiding ON public.transactions;
CREATE TRIGGER tr_audit_transaction_voiding
    AFTER UPDATE ON public.transactions
    FOR EACH ROW
    WHEN (NEW.status = 'voided' AND OLD.status != 'voided')
    EXECUTE FUNCTION public.fn_audit_transaction_voiding();

-- Function to handle stock reception (purchase) audit
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for stock reception (purchase)
DROP TRIGGER IF EXISTS tr_audit_stock_reception ON public.stock_movements;
CREATE TRIGGER tr_audit_stock_reception
    AFTER INSERT ON public.stock_movements
    FOR EACH ROW
    WHEN (NEW.movement_type = 'purchase')
    EXECUTE FUNCTION public.fn_audit_stock_reception();

COMMIT;
