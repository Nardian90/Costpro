-- ============================================================================
-- W9.5 — B-8 · MODELO C: autorización diferenciada POS Undo vs Reversión admin
-- Migración: 20260905000001 (versionada, idempotente, SIN DROP CASCADE)
--
-- Política congelada: audit-evidence/20260905-w9-b8-impl/01-policy-matrix.md
--
--   NIVEL 1 (POS Undo, void_transaction): venta propia + ventana 30s
--           server-side + estado completed + rol operativo POS por
--           membership (admin/manager/encargado/clerk) o admin global.
--   NIVEL 2 (Reversión administrativa, reverse_transaction_v2): rol
--           admin/manager/encargado en la tienda (o admin global
--           transversal); venta ajena permitida; sin ventana.
--
-- INVARIANTES PRESERVADOS (GATE 14):
--   - firmas, SECURITY DEFINER, owner, search_path endurecidos;
--   - FOR UPDATE como primera lectura relevante en ambos RPC;
--   - has_store_access_as como capa STORE ACCESS (sin cambios);
--   - máquina de estados + triggers (segunda barrera, sin cambios);
--   - mecánica de stock/WAC/pagos/kardex/idempotencia intacta;
--   - ACLs preexistentes de ambos RPC intactas (solo se fija ACL de los
--     helpers NUEVOS).
--   Audit: acciones históricas se conservan; metadata gana operation /
--   old_status / new_status (aditivo).
--
-- ROLLBACK: ver audit-evidence/20260905-w9-b8-impl/ (cuerpos previos
-- capturados byte a byte de live antes de aplicar).
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════
-- 1. HELPERS NORMATIVOS (fuente unica de la politica MODELO C)
--    Espejo DB de la doctrina de src/lib/roles.ts:
--      - ROL GLOBAL admin (profiles.role)  -> alcance transversal (*)
--      - ROLES DE MEMBERSHIP (por tienda)  -> definen lo operable EN ESA TIENDA
--    STORE ACCESS (has_store_access_as)  ≠  OPERATION AUTHORIZATION (estos helpers)
-- ═══════════════════════════════════════════════════════════════════

-- Nivel 2: reversion administrativa de ventas.
-- admin global -> true (cualquier tienda, alcance transversal confirmado
-- por has_store_access_as + canManageStore + B-2 P5). Resto: SOLO con
-- membership ACTIVA en la tienda con rol admin/manager/encargado
-- (patron canManageStore). clerk/warehouse/usuario/costo -> false.
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
$function$;

-- Nivel 1: POS Undo (deshacer la venta que el actor acaba de realizar).
-- Requisitos TODOS obligatorios:
--   a) estado 'completed' (create_sale_v2 solo produce completed);
--   b) ownership estricto (tx.seller_id = actor — venta PROPIA);
--   c) ventana server-side de 30 segundos desde created_at (MM-9,
--      "ventana POS"; antes solo client-side);
--   d) rol operativo POS: admin global transversal o membership activa
--      en la tienda con rol admin/manager/encargado/clerk.
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
$function$;

-- ═══════════════════════════════════════════════════════════════════
-- 2. void_transaction — Nivel 1 (POS Undo). Cuerpo live c57e8de1 +
--    guards de política. FOR UPDATE sigue siendo la 1ª lectura.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone DEFAULT now(), p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_eff TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_conversion_factor integer := 1;
  v_units_to_restore numeric;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TX_NOT_FOUND'; END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- W9.5 B-8 (MODELO C, Nivel 1 POS Undo): guard de estado explicito
  -- (endurecimiento B-9a: rechaza estados distintos de completed/voided
  -- ANTES de tocar datos; el trigger trg_validate_tx_transition sigue
  -- siendo la segunda barrera).
  IF v_tx.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;
  IF v_tx.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: void_transaction (POS undo) solo permite completed (status=%)', v_tx.status;
  END IF;

  -- W9.5 B-8 (MODELO C, Nivel 1 POS Undo): politica normativa UNICA
  -- can_pos_undo_transaction: venta propia + ventana server-side 30s
  -- + estado completed + rol operativo POS (membership por tienda o
  -- admin global). Identidad SIEMPRE auth.uid() para no-service_role;
  -- p_user_id del cliente no puede convertirse en actor.
  IF NOT public.can_pos_undo_transaction(p_transaction_id, v_caller_uid) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: POS undo requiere venta propia, dentro de la ventana de 30s y rol operativo POS en la tienda';
  END IF;

  UPDATE public.transactions
    SET status = 'voided', void_reason = p_reason, cancelled_at = v_eff, updated_at = NOW()
    WHERE id = p_transaction_id;

  -- FIX C-7: Restaurar stock considerando conversion_factor de variantes.
  -- Si transaction_items.variant_id está poblado, buscar conversion_factor.
  -- Si variant_id es NULL (ventas legacy), usar 1 (sin conversión) para
  -- mantener simetría con create_sale legacy.
  FOR v_item IN SELECT * FROM public.transaction_items WHERE transaction_id = p_transaction_id LOOP
    v_conversion_factor := 1;
    IF v_item.variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_item.variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;

    v_units_to_restore := v_item.quantity * v_conversion_factor;

    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_tx.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_units_to_restore,
      p_movement_type := 'sale_void',
      p_notes := p_transaction_id::text,
      p_unit_cost := v_item.cost_at_sale,
      p_reason := 'Void de venta',
      p_operation_date := v_eff,
      p_skip_access_check := TRUE
    );
  END LOOP;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('VOID_SALE', 'transactions', p_transaction_id, v_tx.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'old_status', v_tx.status, 'new_status', 'voided', 'operation', 'POS_UNDO'));

  RETURN jsonb_build_object('status', 'success', 'transaction_id', p_transaction_id);
END;

$function$
;

-- ═══════════════════════════════════════════════════════════════════
-- 3. reverse_transaction_v2 — Nivel 2 (Reversión administrativa).
--    Cuerpo live c57e8de1 + capa de rol. FOR UPDATE 1ª lectura intacta.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reverse_transaction_v2(p_transaction_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_units_to_restore numeric;
  v_total_restored numeric := 0;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND';
  END IF;

  IF v_tx.status = 'voided' THEN
    RETURN jsonb_build_object('status', 'idempotent', 'transaction_id', p_transaction_id);
  END IF;

  IF v_tx.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: only completed transactions can be reversed (status=%)', v_tx.status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- W9.5 B-8 (MODELO C, Nivel 2 Reversion administrativa): politica
  -- normativa UNICA can_admin_reverse_transaction: admin global
  -- (alcance transversal *) o membership activa con rol
  -- admin/manager/encargado en LA TIENDA de la transaccion.
  -- La membresia responde "puede operar en la tienda"; el ROL responde
  -- "puede realizar esta operacion administrativa". Ownership NO se
  -- exige (venta ajena permitida dentro del alcance); sin ventana
  -- temporal (doc vigente; la ventana 24h de la doc previa esta
  -- superseda). Todo lo demas de V2 se conserva intacto (GATE 14).
  IF NOT public.can_admin_reverse_transaction(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion administrativa requiere rol admin/manager/encargado en la tienda de la venta';
  END IF;

  FOR v_item IN
    SELECT ti.product_id, ti.quantity, ti.cost_at_sale
    FROM public.transaction_items ti
    WHERE ti.transaction_id = p_transaction_id AND ti.product_id IS NOT NULL
  LOOP
    v_units_to_restore := v_item.quantity;

    -- register_stock_movement genera el stock_movement → trigger genera kardex
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_tx.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_units_to_restore,
      p_movement_type := 'sale_reverse'::text,
      p_sale_id := p_transaction_id,
      p_unit_cost := v_item.cost_at_sale,
      p_reason := 'Reverso de venta'::text,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    -- PR-4.3: INSERT directo a kardex_entries ELIMINADO

    v_total_restored := v_total_restored + v_units_to_restore;
  END LOOP;

  UPDATE public.transactions
  SET status = 'voided',
      updated_at = NOW()
  WHERE id = p_transaction_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_TRANSACTION_V2', 'transactions', p_transaction_id, v_tx.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'units_restored', v_total_restored, 'old_status', v_tx.status, 'new_status', 'voided', 'operation', 'ADMIN_REVERSE'));

  RETURN jsonb_build_object(
    'status', 'success',
    'transaction_id', p_transaction_id,
    'units_restored', v_total_restored
  );
END;
$function$
;

-- ═══════════════════════════════════════════════════════════════════
-- 4. ACL de los helpers (patron de endurecimiento F06 del repo).
--    Los helpers se ejecutan DENTRO de las funciones DEFINER (owner
--    postgres) y por service_role desde /api/reverse (boundary API).
--    Ningun cliente necesita ni debe invocarlos directamente.
-- ═══════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.can_pos_undo_transaction(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_pos_undo_transaction(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_pos_undo_transaction(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.can_pos_undo_transaction(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.can_admin_reverse_transaction(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_admin_reverse_transaction(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_admin_reverse_transaction(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin_reverse_transaction(uuid, uuid) TO service_role;
