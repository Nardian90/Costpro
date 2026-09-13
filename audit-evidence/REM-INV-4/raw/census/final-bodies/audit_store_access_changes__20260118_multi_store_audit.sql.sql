-- DECLARED FINAL STATE (Git) de audit_store_access_changes
-- fuente: 20260118_multi_store_audit.sql stmt#3

CREATE OR REPLACE FUNCTION public.audit_store_access_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data)
        VALUES (
            auth.uid(),
            'ASSIGN_STORE',
            'user_store_access',
            NEW.id,
            jsonb_build_object('user_id', NEW.user_id, 'store_id', NEW.store_id)
        );
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data)
        VALUES (
            auth.uid(),
            'REMOVE_STORE_ACCESS',
            'user_store_access',
            OLD.id,
            jsonb_build_object('user_id', OLD.user_id, 'store_id', OLD.store_id)
        );
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql
