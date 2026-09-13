-- DECLARED FINAL STATE (Git) de set_transfer_approval_rule
-- fuente: 20260727000012_v2_12_18_fix_5_residual_is_not_null.sql stmt#16

CREATE OR REPLACE FUNCTION public.set_transfer_approval_rule(
  p_tenant_id uuid,
  p_store_id uuid,
  p_threshold_amount numeric DEFAULT NULL::numeric,
  p_threshold_quantity numeric DEFAULT NULL::numeric,
  p_approver_roles text[] DEFAULT ARRAY['admin'::text, 'manager'::text],
  p_is_active boolean DEFAULT true,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_user_role TEXT;
  v_existing UUID;
BEGIN
  -- V2.12.18: patrón IS NULL OR NOT (antes era IF v_caller_uid IS NOT NULL THEN ... END IF)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Verificar que el usuario sea admin o manager
  SELECT role INTO v_user_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_user_role IS NULL OR (v_user_role <> 'admin' AND v_user_role <> 'superadmin' AND NOT public.has_store_role(p_store_id, ARRAY['admin'::text, 'manager'::text])) THEN
    RAISE EXCEPTION 'ERR_INSUFFICIENT_ROLE';
  END IF;

  -- Upsert
  SELECT id INTO v_existing FROM public.transfer_approval_rules
    WHERE store_id = p_store_id AND tenant_id IS NOT DISTINCT FROM p_tenant_id
    FOR UPDATE;

  IF v_existing IS NOT NULL THEN
    UPDATE public.transfer_approval_rules
      SET threshold_amount = COALESCE(p_threshold_amount, threshold_amount),
          threshold_quantity = COALESCE(p_threshold_quantity, threshold_quantity),
          approver_roles = COALESCE(p_approver_roles, approver_roles),
          is_active = COALESCE(p_is_active, is_active),
          updated_at = NOW()
      WHERE id = v_existing;
  ELSE
    INSERT INTO public.transfer_approval_rules (tenant_id, store_id, threshold_amount, threshold_quantity, approver_roles, is_active, created_at, updated_at)
    VALUES (p_tenant_id, p_store_id, p_threshold_amount, p_threshold_quantity, p_approver_roles, p_is_active, NOW(), NOW())
    RETURNING id INTO v_existing;
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('SET_TRANSFER_APPROVAL_RULE', 'transfer_approval_rules', v_existing, p_store_id, v_caller_uid,
    jsonb_build_object('threshold_amount', p_threshold_amount, 'threshold_quantity', p_threshold_quantity, 'is_active', p_is_active));

  RETURN jsonb_build_object('status', 'success', 'rule_id', v_existing);
END;
$function$
