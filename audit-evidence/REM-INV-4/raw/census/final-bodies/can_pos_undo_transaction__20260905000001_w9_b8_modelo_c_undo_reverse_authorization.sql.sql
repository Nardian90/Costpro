-- DECLARED FINAL STATE (Git) de can_pos_undo_transaction
-- fuente: 20260905000001_w9_b8_modelo_c_undo_reverse_authorization.sql stmt#1

CREATE OR REPLACE FUNCTION public.can_pos_undo_transaction(p_transaction_id uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_tx RECORD;
  v_profile_role TEXT;
  v_membership_role TEXT;
BEGIN
  IF p_transaction_id IS NULL OR p_actor IS NULL THEN RETURN false; END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_tx.status <> 'completed' THEN RETURN false; END IF;

  IF v_tx.seller_id IS NULL OR v_tx.seller_id <> p_actor THEN RETURN false; END IF;

  IF v_tx.created_at IS NULL OR v_tx.created_at < now() - INTERVAL '30 seconds' THEN RETURN false; END IF;

  SELECT role::text INTO v_profile_role FROM public.profiles WHERE id = p_actor;
  IF v_profile_role = 'admin' THEN RETURN true; END IF;

  SELECT m.role::text INTO v_membership_role
    FROM public.user_store_memberships m
   WHERE m.user_id = p_actor AND m.store_id = v_tx.store_id AND m.status = 'active'
   LIMIT 1;

  RETURN COALESCE(v_membership_role IN ('admin','manager','encargado','clerk'), false);
END;
$function$
