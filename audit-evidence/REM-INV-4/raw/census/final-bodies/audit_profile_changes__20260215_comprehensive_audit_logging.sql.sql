-- DECLARED FINAL STATE (Git) de audit_profile_changes
-- fuente: 20260215_comprehensive_audit_logging.sql stmt#1

CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Log creation
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
        VALUES (
            auth.uid(),
            'CREATE_USER',
            'profiles',
            NEW.id,
            jsonb_build_object('full_name', NEW.full_name, 'role', NEW.role, 'email', NEW.email),
            NULL
        );
    -- Log deletion
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, store_id)
        VALUES (
            auth.uid(),
            'DELETE_USER',
            'profiles',
            OLD.id,
            jsonb_build_object('full_name', OLD.full_name, 'role', OLD.role),
            NULL
        );
    -- Log updates
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Log active store change
        IF (OLD.active_store_id IS DISTINCT FROM NEW.active_store_id) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'CHANGE_ACTIVE_STORE',
                'profiles',
                NEW.id,
                jsonb_build_object('active_store_id', OLD.active_store_id),
                jsonb_build_object('active_store_id', NEW.active_store_id),
                NEW.active_store_id
            );
        END IF;

        -- Log role change
        IF (OLD.role IS DISTINCT FROM NEW.role) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'CHANGE_ROLE',
                'profiles',
                NEW.id,
                jsonb_build_object('role', OLD.role),
                jsonb_build_object('role', NEW.role),
                NEW.active_store_id
            );
        END IF;

        -- Log name change
        IF (OLD.full_name IS DISTINCT FROM NEW.full_name) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'UPDATE_USER_NAME',
                'profiles',
                NEW.id,
                jsonb_build_object('full_name', OLD.full_name),
                jsonb_build_object('full_name', NEW.full_name),
                NEW.active_store_id
            );
        END IF;
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql
