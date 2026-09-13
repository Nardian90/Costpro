-- DECLARED FINAL STATE (Git) de fn_audit_transaction_voiding
-- fuente: 20260318_harden_audit_logging.sql stmt#1

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
$$ LANGUAGE plpgsql SECURITY DEFINER
