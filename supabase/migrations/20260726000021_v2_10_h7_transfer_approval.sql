-- ════════════════════════════════════════════════════════════════════════
-- V2.10 — H7: Aprobación por umbral en transferencias
--
-- Auditoría H7: "Cualquier usuario con acceso a una tienda puede iniciar y
-- confirmar transferencias de cualquier monto sin un segundo aprobador.
-- Para MiPYMEs donde el dueño quiere ver transferencias grandes antes de
-- que se ejecuten, es una brecha de control interno."
--
-- SOLUCIÓN:
-- 1. Tabla transfer_approval_rules (config por tenant: monto/cantidad que
--    dispara aprobación de un segundo rol)
-- 2. Columna requires_approval en transfers (flag)
-- 3. Columna approved_by en transfers (NULL hasta aprobada)
-- 4. RPC set_transfer_approval_rule(p_tenant_id, p_threshold_amount, ...)
-- 5. RPC approve_transfer(p_transfer_id, p_user_id)
-- 6. Modificar confirm_transfer: bloquear si requires_approval AND approved_by IS NULL
-- ════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Tabla transfer_approval_rules (config por tenant)
-- ──────────────────────────────────────────────────────────────────────────
-- V2.10.1: DROP y CREATE para quitar DEFERRABLE (incompatible con ON CONFLICT)
DROP TABLE IF EXISTS public.transfer_approval_rules CASCADE;
CREATE TABLE public.transfer_approval_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,  -- NULL = regla global por defecto
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,  -- NULL = todas las tiendas del tenant
  -- Umbrales (cualquiera que se dispara requiere aprobación)
  threshold_amount NUMERIC(15,2),  -- monto total en CUP que dispara aprobación
  threshold_quantity NUMERIC(12,4),  -- cantidad total de items que dispara
  -- Roles que deben aprobar (cualquiera de ellos)
  approver_roles TEXT[] NOT NULL DEFAULT ARRAY['admin', 'encargado']::text[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Solo una regla activa por (tenant_id, store_id) — si store_id es NULL, es por tenant
  UNIQUE(tenant_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_transfer_approval_rules_tenant ON public.transfer_approval_rules(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_transfer_approval_rules_store ON public.transfer_approval_rules(store_id) WHERE is_active = true;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Añadir columnas a transfers
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

COMMENT ON COLUMN public.transfers.requires_approval IS 'V2.10 H7: TRUE si la transferencia supera el umbral configurado y requiere aprobación';
COMMENT ON COLUMN public.transfers.approved_by IS 'V2.10 H7: usuario que aprobó la transferencia (NULL = pendiente)';
COMMENT ON COLUMN public.transfers.approved_at IS 'V2.10 H7: timestamp de aprobación';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Helper: evaluar si una transferencia requiere aprobación
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transfer_requires_approval(
  p_origin_store_id UUID,
  p_destination_store_id UUID,
  p_items JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id UUID;
  v_rule RECORD;
  v_total_amount NUMERIC := 0;
  v_total_quantity NUMERIC := 0;
  v_item RECORD;
BEGIN
  -- Obtener tenant_id
  SELECT tenant_id INTO v_tenant_id FROM public.stores WHERE id = p_origin_store_id;

  -- Buscar regla aplicable: primero por store, luego por tenant
  SELECT * INTO v_rule FROM public.transfer_approval_rules
  WHERE is_active = true
    AND (
      (store_id = p_origin_store_id) OR
      (store_id IS NULL AND tenant_id IS NOT DISTINCT FROM v_tenant_id)
    )
  ORDER BY store_id NULLS LAST
  LIMIT 1;

  IF v_rule.id IS NULL THEN
    RETURN FALSE;  -- no hay regla, no requiere aprobación
  END IF;

  -- Calcular totales
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC, unit_cost NUMERIC)
  LOOP
    v_total_quantity := v_total_quantity + v_item.quantity;
    v_total_amount := v_total_amount + (v_item.quantity * v_item.unit_cost);
  END LOOP;

  -- Verificar umbrales
  IF v_rule.threshold_amount IS NOT NULL AND v_total_amount >= v_rule.threshold_amount THEN
    RETURN TRUE;
  END IF;
  IF v_rule.threshold_quantity IS NOT NULL AND v_total_quantity >= v_rule.threshold_quantity THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_requires_approval(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_requires_approval(UUID, UUID, JSONB) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Modificar create_transfer: marcar requires_approval
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_transfer(
  p_origin_store_id uuid,
  p_destination_store_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_transaction_id uuid DEFAULT NULL,
  p_operation_date timestamp with time zone DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_transfer_id UUID := COALESCE(p_transaction_id, gen_random_uuid());
    v_item RECORD;
    v_server_unit_cost NUMERIC;
    v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
    v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
    v_requires_approval BOOLEAN := FALSE;
BEGIN
    -- V2.5 H1a: autorización BOLA
    IF v_caller_uid IS NOT NULL THEN
      IF NOT public.has_store_access_as(v_caller_uid, p_origin_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED_ORIGIN';
      END IF;
      IF NOT public.has_store_access_as(v_caller_uid, p_destination_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED_DESTINATION';
      END IF;
    END IF;

    PERFORM public.validate_transfer_operation_date(p_operation_date, p_origin_store_id, p_destination_store_id);

    -- V2.10 H7: evaluar si requiere aprobación
    v_requires_approval := public.transfer_requires_approval(p_origin_store_id, p_destination_store_id, p_items);

    INSERT INTO public.transfers (
      id, origin_store_id, destination_store_id, created_by, notes, tenant_id, created_at,
      requires_approval
    )
    VALUES (
      v_transfer_id, p_origin_store_id, p_destination_store_id,
      v_caller_uid,
      p_notes,
      (SELECT tenant_id FROM public.stores WHERE id = p_origin_store_id),
      v_effective_date,
      v_requires_approval
    );

    FOR v_item IN
      SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        quantity NUMERIC,
        unit_cost NUMERIC,
        tasa_cambio NUMERIC
      )
    LOOP
        SELECT cost_average INTO v_server_unit_cost
        FROM public.products
        WHERE id = v_item.product_id AND store_id = p_origin_store_id;
        IF v_server_unit_cost IS NULL THEN
          v_server_unit_cost := 0;
        END IF;

        INSERT INTO public.transfer_items (transfer_id, product_id, quantity, unit_cost, created_at)
        VALUES (v_transfer_id, v_item.product_id, v_item.quantity, v_server_unit_cost, v_effective_date);
    END LOOP;
    RETURN v_transfer_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone, uuid) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. RPC: approve_transfer
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_transfer(
  p_transfer_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_transfer RECORD;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
  v_user_role TEXT;
  v_rule RECORD;
  v_tenant_id UUID;
  v_has_approver_role BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND'; END IF;

  IF v_transfer.status != 'PENDIENTE' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden aprobar transferencias PENDIENTE';
  END IF;

  IF NOT v_transfer.requires_approval THEN
    RAISE EXCEPTION 'ERR_NO_APPROVAL_REQUIRED';
  END IF;

  IF v_transfer.approved_by IS NOT NULL THEN
    RAISE EXCEPTION 'ERR_ALREADY_APPROVED';
  END IF;

  -- Autorización: caller debe tener acceso al origen
  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Verificar que el caller tiene rol de aprobador
  IF v_caller_uid IS NOT NULL THEN
    SELECT role INTO v_user_role FROM public.profiles WHERE id = v_caller_uid;
    SELECT tenant_id INTO v_tenant_id FROM public.stores WHERE id = v_transfer.origin_store_id;

    SELECT * INTO v_rule FROM public.transfer_approval_rules
    WHERE is_active = true
      AND (
        (store_id = v_transfer.origin_store_id) OR
        (store_id IS NULL AND tenant_id IS NOT DISTINCT FROM v_tenant_id)
      )
      ORDER BY store_id NULLS LAST
      LIMIT 1;

    IF v_rule.id IS NOT NULL THEN
      v_has_approver_role := v_user_role = ANY(v_rule.approver_roles) OR v_user_role = 'admin';
      IF NOT v_has_approver_role THEN
        RAISE EXCEPTION 'ERR_NOT_APPROVER: tu rol (%) no está autorizado para aprobar (requerido: %)', v_user_role, v_rule.approver_roles;
      END IF;
    END IF;
  END IF;

  -- Marcar como aprobada
  UPDATE public.transfers
    SET approved_by = v_caller_uid,
        approved_at = NOW()
    WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'transfer_id', p_transfer_id,
    'approved_by', v_caller_uid,
    'approved_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_transfer(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_transfer(UUID, UUID) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. RPC: reject_transfer
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_transfer(
  p_transfer_id UUID,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_transfer RECORD;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND'; END IF;
  IF v_transfer.status != 'PENDIENTE' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING';
  END IF;

  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  UPDATE public.transfers
    SET status = 'CANCELADA',
        rejection_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'transfer_id', p_transfer_id,
    'new_status', 'CANCELADA'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_transfer(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_transfer(UUID, TEXT, UUID) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 7. RPC: set_transfer_approval_rule (admin)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_transfer_approval_rule(
  p_tenant_id UUID DEFAULT NULL,
  p_store_id UUID DEFAULT NULL,
  p_threshold_amount NUMERIC DEFAULT NULL,
  p_threshold_quantity NUMERIC DEFAULT NULL,
  p_approver_roles TEXT[] DEFAULT ARRAY['admin', 'encargado']::text[],
  p_is_active BOOLEAN DEFAULT TRUE,
  p_user_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rule_id UUID;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
  v_user_role TEXT;
BEGIN
  -- V2.10: autorización — admin global o service_role (bypass)
  IF v_caller_uid IS NOT NULL THEN
    SELECT role INTO v_user_role FROM public.profiles WHERE id = v_caller_uid;
    IF v_user_role != 'admin' THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo admin puede configurar reglas de aprobación';
    END IF;
  END IF;

  -- Upsert
  INSERT INTO public.transfer_approval_rules (
    tenant_id, store_id, threshold_amount, threshold_quantity,
    approver_roles, is_active, created_by
  ) VALUES (
    p_tenant_id, p_store_id, p_threshold_amount, p_threshold_quantity,
    p_approver_roles, p_is_active, v_caller_uid
  )
  ON CONFLICT (tenant_id, store_id) DO UPDATE SET
    threshold_amount = EXCLUDED.threshold_amount,
    threshold_quantity = EXCLUDED.threshold_quantity,
    approver_roles = EXCLUDED.approver_roles,
    is_active = EXCLUDED.is_active,
    updated_at = NOW()
  RETURNING id INTO v_rule_id;

  RETURN v_rule_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_transfer_approval_rule(UUID, UUID, NUMERIC, NUMERIC, TEXT[], BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_transfer_approval_rule(UUID, UUID, NUMERIC, NUMERIC, TEXT[], BOOLEAN, UUID) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 8. RLS para transfer_approval_rules (solo admin puede modificar)
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.transfer_approval_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transfer_approval_rules_admin_only" ON public.transfer_approval_rules;
CREATE POLICY "transfer_approval_rules_admin_only" ON public.transfer_approval_rules
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_global_admin())
  WITH CHECK (public.is_admin() OR public.is_global_admin());

NOTIFY pgrst, 'reload schema';
