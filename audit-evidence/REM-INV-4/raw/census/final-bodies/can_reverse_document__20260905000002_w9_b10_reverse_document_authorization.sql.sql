-- DECLARED FINAL STATE (Git) de can_reverse_document
-- fuente: 20260905000002_w9_b10_reverse_document_authorization.sql stmt#0

CREATE OR REPLACE FUNCTION public.can_reverse_document(p_actor uuid, p_store_id uuid, p_operation text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_profile_role TEXT;
  v_membership_role TEXT;
BEGIN
  IF p_actor IS NULL OR p_store_id IS NULL OR p_operation IS NULL THEN RETURN false; END IF;

  SELECT role::text INTO v_profile_role FROM public.profiles WHERE id = p_actor;
  IF v_profile_role = 'admin' THEN RETURN true; END IF;

  SELECT m.role::text INTO v_membership_role
    FROM public.user_store_memberships m
   WHERE m.user_id = p_actor AND m.store_id = p_store_id AND m.status = 'active'
   LIMIT 1;
  IF v_membership_role IS NULL THEN RETURN false; END IF;
  IF v_membership_role = 'admin' THEN RETURN true; END IF;

  CASE p_operation
    WHEN 'receipt' THEN
      RETURN v_membership_role IN ('manager','encargado','warehouse');
    WHEN 'transfer' THEN
      RETURN v_membership_role IN ('manager','encargado','warehouse');
    WHEN 'adjustment' THEN
      RETURN v_membership_role IN ('manager','encargado');
    WHEN 'devolution' THEN
      RETURN true; -- cualquier membresía activa (simétrica a la creación; módulo dormant)
    WHEN 'production_order' THEN
      RETURN v_membership_role IN ('manager','costo');
    ELSE
      RETURN false;
  END CASE;
END;
$function$
