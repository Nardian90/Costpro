-- DECLARED FINAL STATE (Git) de can_admin_reverse_transaction
-- fuente: 20260905000001_w9_b8_modelo_c_undo_reverse_authorization.sql stmt#0

CREATE OR REPLACE FUNCTION public.can_admin_reverse_transaction(p_actor uuid, p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_profile_role TEXT;
  v_membership_role TEXT;
BEGIN
  IF p_actor IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;

  SELECT role::text INTO v_profile_role FROM public.profiles WHERE id = p_actor;
  IF v_profile_role = 'admin' THEN RETURN true; END IF;

  SELECT m.role::text INTO v_membership_role
    FROM public.user_store_memberships m
   WHERE m.user_id = p_actor AND m.store_id = p_store_id AND m.status = 'active'
   LIMIT 1;

  RETURN COALESCE(v_membership_role IN ('admin','manager','encargado'), false);
END;
$function$
