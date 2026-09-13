-- DECLARED FINAL STATE (Git) de log_transaction_changes
-- fuente: 20240325000000_harden_audit_triggers.sql stmt#3

CREATE OR REPLACE FUNCTION public.log_transaction_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user_id uuid;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
        -- Handle different user column names
        IF TG_TABLE_NAME = 'transactions' THEN
            v_user_id := NEW.seller_id;
        ELSIF TG_TABLE_NAME = 'receipts' THEN
            v_user_id := NEW.user_id;
        END IF;

        INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
        VALUES (
            COALESCE(auth.uid(), v_user_id),
            'UPDATE_STATUS',
            TG_TABLE_NAME,
            NEW.id,
            jsonb_build_object('old', OLD.status),
            jsonb_build_object('new', NEW.status),
            NEW.store_id
        );
    END IF;
    RETURN NEW;
END;
$function$
