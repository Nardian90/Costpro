-- Phase 9: Audit Triggers

CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Log active store change
    IF (OLD.active_store_id IS DISTINCT FROM NEW.active_store_id) THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
        VALUES (
            auth.uid(),
            'CHANGE_ACTIVE_STORE',
            'profiles',
            NEW.id,
            jsonb_build_object('active_store_id', OLD.active_store_id),
            jsonb_build_object('active_store_id', NEW.active_store_id)
        );
    END IF;

    -- Log role change
    IF (OLD.role IS DISTINCT FROM NEW.role) THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
        VALUES (
            auth.uid(),
            'CHANGE_ROLE',
            'profiles',
            NEW.id,
            jsonb_build_object('role', OLD.role),
            jsonb_build_object('role', NEW.role)
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_audit_profile_changes ON public.profiles;
CREATE TRIGGER trigger_audit_profile_changes
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_profile_changes();

-- Audit store access assignments
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_audit_store_access_changes ON public.user_store_access;
CREATE TRIGGER trigger_audit_store_access_changes
AFTER INSERT OR DELETE ON public.user_store_access
FOR EACH ROW EXECUTE FUNCTION public.audit_store_access_changes();
