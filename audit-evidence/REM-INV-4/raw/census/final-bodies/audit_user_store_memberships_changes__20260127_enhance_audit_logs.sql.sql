-- DECLARED FINAL STATE (Git) de audit_user_store_memberships_changes
-- fuente: 20260127_enhance_audit_logs.sql stmt#3

CREATE OR REPLACE FUNCTION public.audit_user_store_memberships_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
        VALUES (
            auth.uid(),
            'ASSIGN_STORE',
            'user_store_memberships',
            NEW.id,
            jsonb_build_object('user_id', NEW.user_id, 'store_id', NEW.store_id, 'role', NEW.role),
            NEW.store_id
        );
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, store_id)
        VALUES (
            auth.uid(),
            'REMOVE_STORE_ACCESS',
            'user_store_memberships',
            OLD.id,
            jsonb_build_object('user_id', OLD.user_id, 'store_id', OLD.store_id, 'role', OLD.role),
            OLD.store_id
        );
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.role IS DISTINCT FROM NEW.role OR OLD.status IS DISTINCT FROM NEW.status) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'UPDATE_STORE_ACCESS',
                'user_store_memberships',
                NEW.id,
                jsonb_build_object('role', OLD.role, 'status', OLD.status),
                jsonb_build_object('role', NEW.role, 'status', NEW.status),
                NEW.store_id
            );
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql
