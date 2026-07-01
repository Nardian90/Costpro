-- Migration: Roles Table Auditing
-- TAREA 5: Registro automático de cambios de rol y permisos

BEGIN;

CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.user_audit_log (performed_by, action, new_values)
        VALUES (auth.uid(), 'CREATE_ROLE', row_to_json(NEW)::jsonb);
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.user_audit_log (performed_by, action, old_values, new_values)
        VALUES (auth.uid(), 'UPDATE_ROLE_DEFINITION', row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb);
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.user_audit_log (performed_by, action, old_values)
        VALUES (auth.uid(), 'DELETE_ROLE', row_to_json(OLD)::jsonb);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_audit_role_changes ON public.roles;
CREATE TRIGGER tr_audit_role_changes
AFTER INSERT OR UPDATE OR DELETE ON public.roles
FOR EACH ROW EXECUTE FUNCTION public.audit_role_changes();

COMMIT;
