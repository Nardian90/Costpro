-- ============================================================================
-- Migration: 20261126170000_cpbra_r05_adjustment_confirmation_role_guard.sql
-- Misión:    CP-BRA-INV005-FIN011-CLOSURE-001 — LÍNEA A (R-05 / INV-005)
-- Fecha:     2026-11-26
-- ============================================================================
-- REGLA INV-005 (CP-BRA-001, CRÍTICO en RISK-REGISTER):
--   «La confirmación de un ajuste de inventario — que sobrescribe el stock
--    físico y genera movimiento de kardex — exige autorización de perfil con
--    gestión».
--
-- DECISIÓN AUTORIZADA (misión §2.2): PRIMER INCREMENTO de la alternativa A de
--   docs/audits/CP-BRA-FINAL-VERIFICATION-AND-INV005-001/DECISION-R05.md —
--   control de confirmación por rol autorizado. EXPLÍCITAMENTE fuera de
--   alcance: umbral porcentual/monetario, doble autorización, motivo
--   obligatorio (incremento 2 de la opción C — decisión reservada al
--   propietario), lógica de cálculo de diferencias, kardex, ajustes históricos.
--
-- DEFECTO CORREGIDO (evidencia DECISION-R05 §1):
--   El RPC vigente autorizaba con `is_admin_check OR has_store_access_as`
--   = CUALQUIER membresía activa (encargado, clerk, warehouse, usuario,
--   costo). Un clerk podía confirmar vía PostgREST un ajuste pendiente de su
--   tienda sin evento de auditoría. La granularidad por operación
--   (20261027120000) existía en el historial pero no en la función vigente.
--
-- SOLUCIÓN (una sola fuente de verdad, sin funciones paralelas):
--   1) Reutiliza la función existente `has_store_role_as(uid, store, roles[])`
--      (migración 20260807000002 — bypass perfiles admin/superadmin +
--      membresía ACTIVA con rol ∈ roles en ESA tienda). Espejo EXACTO de:
--        - canManageStore (src/lib/roles.ts) → roles encargado|manager|admin
--        - can_admin_reverse_transaction (DB, 20261027120000)
--        - canReverseDocumentInStore(…, 'adjustment') (frontend)
--   2) Fail-closed: clerk/warehouse/usuario/costo → ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED.
--      Usuario de otra tienda → mismo error (la membresía se acota por store_id).
--      Sin sesión válida → ERR_UNAUTHENTICATED (conservado).
--      La UI quedará alineada con esta misma política (gate simétrico con
--      Revertir) — la interfaz NO es el control de seguridad, el RPC sí.
--   3) Auditoría transaccional (misión §2.4): fila `ADJUSTMENT_CONFIRMED` en
--      audit_logs escrita en la MISMA transacción que la confirmación; si el
--      INSERT falla, TODA la confirmación revierte — jamás una confirmación
--      silenciosa de una operación que exige trazabilidad.
--
-- INVARIANTE PRESERVADO: firma (uuid, uuid) + RETURN jsonb + SECURITY DEFINER
--   + search_path + ACL certificada (REVOKE PUBLIC/anon; GRANT
--   authenticated, service_role) — el contrato de superficie NO cambia de
--   forma, solo de cuerpo (drift LIVE-vs-replay INTENCIONAL declarado en
--   ci-gate-allowlist.json hasta aprobación del propietario + deploy +
--   re-certificación del surface).
--
-- NOTA service_role: rama conservada VERBATIM — con p_user_id el check de rol
--   aplica AL USUARIO indicado (no se debilita); sin p_user_id sigue
--   ERR_UNAUTHENTICATED. No hay llamador interno server-side de este RPC.
-- ============================================================================

-- ─── UP ─────────────────────────────────────────────────────────────────────
BEGIN;

-- Guard fail-closed: la función vigente existe con la firma certificada
DO $r05_guard$
DECLARE
  v_found boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'confirm_inventory_adjustment'
      AND pg_get_function_identity_arguments(p.oid) = 'p_adjustment_id uuid, p_user_id uuid'
  ) INTO v_found;
  IF NOT v_found THEN
    RAISE EXCEPTION 'R05-GUARD: confirm_inventory_adjustment(uuid, uuid) no existe — abortando (estado inesperado)';
  END IF;
END;
$r05_guard$;

CREATE OR REPLACE FUNCTION public.confirm_inventory_adjustment(
  p_adjustment_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_adj RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_new_stock NUMERIC;
  v_count INTEGER := 0;
  v_pi_number TEXT;
  v_reason TEXT;
  v_items_ctx JSONB;
BEGIN
  SELECT * INTO v_adj FROM public.inventory_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF v_adj IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_adj.status != 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden confirmar ajustes pendientes (estado actual: %)', v_adj.status;
  END IF;

  -- Fail-closed: sin usuario autenticado no se confirma (verbatim R-PI)
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;

  -- [R-05 20261126] INV-005 — barrera definitiva en el servidor (SECURITY
  -- DEFINER): la confirmación exige ROL DE GESTIÓN en la tienda del ajuste.
  -- Antes: is_admin_check OR has_store_access_as (cualquier membresía activa,
  -- incl. clerk). Ahora: perfiles admin/superadmin de plataforma, o membresía
  -- ACTIVA con rol admin|manager|encargado EN ESA TIENDA — un solo check vía
  -- la función existente has_store_role_as (espejo canManageStore).
  -- Usuario de otra tienda / clerk / sin membresía → mismo error (fail-closed,
  -- sin filtrar el motivo exacto).
  IF NOT public.has_store_role_as(v_caller_uid, v_adj.store_id,
                                  ARRAY['admin','manager','encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED: la confirmación de ajustes de inventario exige rol de gestión en la tienda (admin, manager o encargado)';
  END IF;

  -- Trazabilidad: si el ajuste proviene de un inventario físico, el kardex
  -- lo referencia explícitamente (campo persistido, no texto manual).
  -- [R-05 20261126] lógica VERBATIM — el cálculo de diferencias y el kardex
  -- NO se modifican en esta misión.
  SELECT pi.pi_number INTO v_pi_number
  FROM public.physical_inventories pi
  WHERE pi.id = v_adj.source_physical_inventory_id;
  v_reason := CASE WHEN v_pi_number IS NOT NULL
                   THEN 'Ajuste por inventario físico ' || v_pi_number
                   ELSE 'Ajuste documental confirmado' END;

  -- Aplicar cada item: actualizar stock + kardex (loop VERBATIM R-PI)
  FOR v_item IN
    SELECT product_id, expected_quantity, counted_quantity
    FROM public.inventory_adjustment_items
    WHERE adjustment_id = p_adjustment_id
  LOOP
    -- Actualizar stock del producto (atómico)
    UPDATE public.products
      SET stock_current = v_item.counted_quantity,
          updated_at = NOW()
      WHERE id = v_item.product_id AND store_id = v_adj.store_id
      RETURNING stock_current INTO v_new_stock;

    -- Registrar movimiento en kardex
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_adj.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_item.counted_quantity - v_item.expected_quantity,
      p_movement_type := 'adjustment',
      p_unit_cost := 0,
      p_reason := v_reason,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE  -- ya validamos acceso+rol vía has_store_role_as
    );

    v_count := v_count + 1;
  END LOOP;

  -- Marcar como confirmed (VERBATIM R-PI)
  UPDATE public.inventory_adjustments
    SET status = 'confirmed',
        confirmed_at = NOW(),
        confirmed_by = v_caller_uid
    WHERE id = p_adjustment_id;

  -- [R-05 20261126] Auditoría transaccional (misión §2.4) — reconstruible:
  -- tienda, actor autenticado, ajuste, fecha (created_at), operación
  -- (ADJUSTMENT_CONFIRMED), resultado y contexto de investigación (items con
  -- desviación por ítem, origen PI, motivo del kardex). Misma transacción:
  -- un fallo del INSERT revierte TODA la confirmación (sin confirmación
  -- silenciosa sin trazabilidad).
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'product_id', product_id,
             'expected_quantity', expected_quantity,
             'counted_quantity', counted_quantity,
             'deviation', counted_quantity - expected_quantity
           ) ORDER BY product_id
         ), '[]'::jsonb)
    INTO v_items_ctx
    FROM public.inventory_adjustment_items
    WHERE adjustment_id = p_adjustment_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
  VALUES (
    v_caller_uid,
    'ADJUSTMENT_CONFIRMED',
    'inventory_adjustments',
    p_adjustment_id,
    jsonb_build_object('status', v_adj.status),
    jsonb_build_object(
      'status', 'confirmed',
      'items_applied', v_count,
      'items', v_items_ctx,
      'source_physical_inventory_id', v_adj.source_physical_inventory_id,
      'kardex_reason', v_reason
    ),
    v_adj.store_id
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'id', p_adjustment_id,
    'items_applied', v_count
  );
END;
$$;

-- ACL invariante (superficie certificada: authenticated + service_role)
REVOKE EXECUTE ON FUNCTION public.confirm_inventory_adjustment(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_adjustment(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_adjustment(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.confirm_inventory_adjustment(UUID, UUID) IS
  'R-05/INV-005 (20261126170000): la confirmación exige rol de gestión EN la tienda del ajuste (perfiles admin/superadmin o membresía activa admin|manager|encargado — has_store_role_as, espejo canManageStore). Fail-closed: ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED. Escribe ADJUSTMENT_CONFIRMED en audit_logs en la misma transacción (revertida si la auditoría falla). Firma/ACL/kardex invariables.';

-- Verificación fail-closed (mismo patrón que 20261027120000)
DO $r05_verify$
DECLARE
  v_def text;
  v_acl text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'confirm_inventory_adjustment'
      AND pg_get_function_identity_arguments(p.oid) = 'p_adjustment_id uuid, p_user_id uuid';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'R05-VERIFY: la función no existe tras la reemisión';
  END IF;

  -- El nuevo guard de rol debe estar en el cuerpo
  IF v_def NOT LIKE '%has_store_role_as%'
     OR v_def NOT LIKE '%ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED%'
     OR v_def NOT LIKE '%ADJUSTMENT_CONFIRMED%' THEN
    RAISE EXCEPTION 'R05-VERIFY: el cuerpo reemitido no contiene el guard R-05 ni la auditoría';
  END IF;

  -- El hueco anterior NO puede persistir: sin has_store_access_as en el
  -- CÓDIGO — los comentarios documentales (que citan el nombre histórico)
  -- se excluyen de la comparación con regexp_replace
  IF regexp_replace(v_def, '--[^\n]*', '', 'g') LIKE '%has_store_access_as%' THEN
    RAISE EXCEPTION 'R05-VERIFY: el cuerpo aún usa has_store_access_as (hueco INV-005 sin cerrar)';
  END IF;

  -- ACL certificada preservada
  SELECT coalesce(array_to_string(array_agg(r.grantee || '=' || r.privilege_type), ','), '')
    INTO v_acl
    FROM information_schema.role_routine_grants r
    WHERE r.specific_schema = 'public'
      AND r.routine_name = 'confirm_inventory_adjustment'
      AND r.privilege_type = 'EXECUTE';
  IF v_acl NOT LIKE '%authenticated%' OR v_acl NOT LIKE '%service_role%' THEN
    RAISE EXCEPTION 'R05-VERIFY: ACL divergente tras la reemisión (%)', v_acl;
  END IF;

  RAISE NOTICE 'R05-VERIFY: guard de rol + auditoría presentes, ACL intacta (%)', v_acl;
END;
$r05_verify$;

COMMIT;

-- ─── DOWN ───────────────────────────────────────────────────────────────────
-- La reversión restaura el cuerpo previo (20261027030000) reemitiéndolo desde
-- el historial versionado. NO se automatiza en esta migración: la política de
-- reversiones del repo exige expediente explícito. El guard inicial garantiza
-- que el DOWN manual opere sobre la firma correcta.
-- ============================================================================
