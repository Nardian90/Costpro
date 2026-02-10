-- Migration: Fix Store Audit Trigger and Expand Coverage
-- Date: 2026-03-03
-- Author: Jules

BEGIN;

-- 1. Correct the audit_store_changes function to remove non-existent 'settings' column
-- and expand to handle INSERT and DELETE for full coverage.
CREATE OR REPLACE FUNCTION public.audit_store_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
        VALUES (
            auth.uid(),
            'CREATE_STORE',
            'stores',
            NEW.id,
            jsonb_build_object('name', NEW.name, 'address', NEW.address, 'is_active', NEW.is_active),
            NEW.id
        );
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Only log if something important changed
        IF (OLD.name IS DISTINCT FROM NEW.name OR OLD.address IS DISTINCT FROM NEW.address OR OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'UPDATE_STORE_CONFIG',
                'stores',
                NEW.id,
                jsonb_build_object('name', OLD.name, 'address', OLD.address, 'is_active', OLD.is_active),
                jsonb_build_object('name', NEW.name, 'address', NEW.address, 'is_active', NEW.is_active),
                NEW.id
            );
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, store_id)
        VALUES (
            auth.uid(),
            'DELETE_STORE',
            'stores',
            OLD.id,
            jsonb_build_object('name', OLD.name, 'address', OLD.address),
            OLD.id
        );
    END IF;

    -- Return value for AFTER triggers is ignored, but let's be consistent
    IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. Update the trigger to fire on INSERT and DELETE as well
DROP TRIGGER IF EXISTS trigger_audit_store_changes ON public.stores;
CREATE TRIGGER trigger_audit_store_changes
AFTER INSERT OR UPDATE OR DELETE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.audit_store_changes();

COMMIT;
