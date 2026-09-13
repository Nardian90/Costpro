-- DECLARED FINAL STATE (Git) de prevent_self_privilege_escalation
-- fuente: 20260911000000_rem_sec1_security_boundaries.sql stmt#3

CREATE OR REPLACE FUNCTION public.prevent_self_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.id = auth.uid() THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.roles IS DISTINCT FROM OLD.roles
       OR NEW.role_id IS DISTINCT FROM OLD.role_id
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.store_id IS DISTINCT FROM OLD.store_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.max_stores_limit IS DISTINCT FROM OLD.max_stores_limit
       OR NEW.max_users_limit IS DISTINCT FROM OLD.max_users_limit
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'ERR_SELF_PRIVILEGED_FIELD: role, roles, role_id, is_active, store ownership, tenant y limites solo pueden modificarse por la via administrativa autorizada (managed_update_user).';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
