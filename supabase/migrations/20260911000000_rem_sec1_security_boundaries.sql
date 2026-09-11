-- ============================================================================
-- REM-SEC-1 — Remediación quirúrgica de los 5 P0/P1 de E2E-2
-- Baseline: 643f4802151ae340d9a3037fa42cffb0b0107081
-- Alcance: EF2-16a, EF2-16c, EF2-11a, EF2-11b, EF2-07a (solo ellos)
-- ============================================================================
-- ═══════════════════════════════════════════════════════════════════════
-- REM-SEC-1 · FIX EF2-16c (P0) — Reapertura de período fiscal LOCKED
-- ═══════════════════════════════════════════════════════════════════════
-- current_setting('app.bypass_fiscal_lock', true) devuelve NULL cuando el GUC
-- no está seteado (caso de TODA petición PostgREST normal). En PostgreSQL
-- NULL <> 'true' evalúa NULL ⇒ el IF nunca hace RAISE ⇒ la inmutabilidad era
-- un no-op (un manager reabre períodos LOCKED vía PATCH directo).
-- Fail-safe: COALESCE trata NULL como 'false' (bloquea). La vía administrativa
-- server-side (GUC='true' dentro de una transacción autorizada) se preserva.
-- Comportamiento GUC: NULL→bloquea · 'false'→bloquea · 'true'→permite bypass.
CREATE OR REPLACE FUNCTION public.prevent_fiscal_closing_edit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'locked' AND COALESCE(current_setting('app.bypass_fiscal_lock', true), 'false') <> 'true' THEN
    RAISE EXCEPTION 'ERR_FISCAL_CLOSING_LOCKED: Cannot modify locked fiscal closing.';
  END IF;
  RETURN NEW;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════
-- REM-SEC-1 · FIX EF2-11a (P1) — Inmutabilidad de cierre de caja no-op
-- ═══════════════════════════════════════════════════════════════════════
-- Misma familia GUC (EF2-16c): NULL <> 'true' ⇒ no-op. Cierres 'cerrado'
-- mutables vía PATCH directo por cualquier miembro del store.
-- Fail-safe NULL-safe; reopen_cash_shift (vía administrativa con
-- set_config('app.bypass_closure_lock','true') local) se preserva intacto.
-- Comportamiento GUC: NULL→bloquea · 'false'→bloquea · 'true'→permite bypass.
CREATE OR REPLACE FUNCTION public.prevent_cash_closure_edit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'cerrado' AND COALESCE(current_setting('app.bypass_closure_lock', true), 'false') <> 'true' THEN
    RAISE EXCEPTION 'ERR_CASH_CLOSURE_LOCKED: Cannot modify closed cash closure. Use reopen_cash_shift RPC.';
  END IF;
  RETURN NEW;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════
-- REM-SEC-1 · FIX EF2-11b (P1) — Doble conteo de ventas cash en cierre
-- ═══════════════════════════════════════════════════════════════════════
-- create_sale_v2 inserta el pago cash de cada venta en payment_transactions
-- con ref_type='sale'. close_cash_shift sumaba TODAS las filas cash de
-- payment_transactions en v_cash_payments Y la venta ya estaba en
-- v_cash_sales (transactions.cash_amount) ⇒ system_expected_total
-- sub-reportaba exactamente el efectivo vendido (faltante imaginario).
-- Modelo contable canónico (get_cash_report): las ventas se cuentan desde
-- transactions; payment_transactions cuenta pagos NO asociados a venta
-- (proveedores receipt/service/production, reembolsos devolution, work).
-- Fix: excluir ref_type='sale' del SUM de v_cash_payments. v_cash_payments
-- también alimenta z_reports.total_payments_suppliers (quedan excluidos los
-- pagos de ventas de la columna 'pagos a proveedores', coherente con su
-- nombre). La fórmula sigue correcta para: ventas cash (una vez), pagos a
-- proveedores, reembolsos, comisiones.
CREATE OR REPLACE FUNCTION public.close_cash_shift(p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_notes text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE
  v_closure RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_cash_sales numeric := 0;
  v_transfer_sales numeric := 0;
  v_zelle_sales numeric := 0;
  v_cash_payments numeric := 0;
  v_cash_commissions numeric := 0;
  v_system_cash numeric := 0;
  v_system_expected_total numeric := 0;
  v_difference numeric := 0;
  v_tax_total numeric := 0;
  v_devolutions_total numeric := 0;
  v_z_number text;
  v_z_id uuid;
  v_tx_count int := 0;
BEGIN
  SELECT * INTO v_closure FROM public.cash_closures WHERE id = p_closure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_CLOSURE_NOT_FOUND'; END IF;
  IF v_closure.status <> 'pendiente' THEN RAISE EXCEPTION 'ERR_CLOSURE_NOT_PENDING: status=%', v_closure.status; END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_closure.store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_closure.store_id::text));

  -- Recalcular (mismo código de 11.4)
  SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales FROM public.transactions WHERE store_id = v_closure.store_id AND status = 'completed' AND created_at > v_closure.created_at AND created_at <= NOW();
  SELECT COALESCE(SUM(transfer_amount), 0) INTO v_transfer_sales FROM public.transactions WHERE store_id = v_closure.store_id AND status = 'completed' AND created_at > v_closure.created_at AND created_at <= NOW();
  SELECT COALESCE(SUM(zelle_amount), 0) INTO v_zelle_sales FROM public.transactions WHERE store_id = v_closure.store_id AND status = 'completed' AND created_at > v_closure.created_at AND created_at <= NOW();
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_payments FROM public.payment_transactions WHERE store_id = v_closure.store_id AND payment_method = 'cash' AND (ref_type IS NULL OR ref_type <> 'sale') AND created_at > v_closure.created_at AND created_at <= NOW();
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions FROM public.commission_payments WHERE store_id = v_closure.store_id AND status = 'paid' AND paid_at > v_closure.created_at AND paid_at <= NOW();
  SELECT COUNT(*) INTO v_tx_count FROM public.transactions WHERE store_id = v_closure.store_id AND status = 'completed' AND created_at > v_closure.created_at AND created_at <= NOW();

  v_system_cash := COALESCE(v_closure.opening_balance, 0) + v_cash_sales - v_cash_payments - v_cash_commissions;
  v_system_expected_total := v_system_cash + v_transfer_sales + v_zelle_sales;
  v_difference := (p_declared_cash + p_declared_vouchers) - v_system_expected_total;

  UPDATE public.cash_closures SET
    status = 'cerrado', closed_at = NOW(),
    declared_cash = p_declared_cash, declared_vouchers = p_declared_vouchers,
    declared_total = p_declared_cash + p_declared_vouchers,
    system_expected_total = v_system_expected_total, difference = v_difference,
    notes = p_notes
  WHERE id = p_closure_id;

  -- Audit log del cierre (mismo de 11.4)
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CASH_CLOSURE_FINALIZED', 'cash_closures', p_closure_id, v_closure.store_id, v_caller_uid,
    jsonb_build_object('declared_cash', p_declared_cash, 'declared_vouchers', p_declared_vouchers,
      'system_expected_total', v_system_expected_total, 'difference', v_difference,
      'opening_balance', COALESCE(v_closure.opening_balance, 0),
      'cash_sales', v_cash_sales, 'transfer_sales', v_transfer_sales, 'zelle_sales', v_zelle_sales,
      'cash_payments', v_cash_payments, 'cash_commissions', v_cash_commissions, 'v2_close', true));

  -- ═══════════════════════════════════════════════════════════════════════
  -- Iteración Fiscal (F-C2): Generar Z Report atómicamente (Aclaración 2)
  -- Estrictamente aditivo — no modifica la lógica anterior.
  -- Si este bloque falla, el error es específico para que el cajero sepa
  -- que el problema es el Z Report, no el cierre en sí.
  -- ═══════════════════════════════════════════════════════════════════════
  BEGIN
    -- Generar número secuencial
    v_z_number := public.next_document_number(v_closure.store_id, 'z_report', v_caller_uid);

    -- Agregar datos fiscales adicionales
    SELECT COALESCE(SUM(tax_amount), 0) INTO v_tax_total
      FROM public.transactions
      WHERE store_id = v_closure.store_id AND status = 'completed'
        AND created_at > v_closure.created_at AND created_at <= NOW();

    SELECT COALESCE(SUM(total_amount), 0) INTO v_devolutions_total
      FROM public.devolutions
      WHERE store_id = v_closure.store_id AND status = 'completed'
        AND created_at > v_closure.created_at AND created_at <= NOW();

    -- INSERT Z Report
    INSERT INTO public.z_reports (
      cash_closure_id, store_id, z_report_number, report_date,
      total_sales, total_cash, total_transfer, total_zelle, total_tax,
      total_devolutions, total_commissions_paid, total_payments_suppliers,
      opening_balance, declared_cash, difference, metadata, generated_by
    ) VALUES (
      p_closure_id, v_closure.store_id, v_z_number, CURRENT_DATE,
      v_cash_sales + v_transfer_sales + v_zelle_sales,
      v_cash_sales, v_transfer_sales, v_zelle_sales, v_tax_total,
      v_devolutions_total, v_cash_commissions, v_cash_payments,
      COALESCE(v_closure.opening_balance, 0), p_declared_cash, v_difference,
      jsonb_build_object('transaction_count', v_tx_count, 'cash_closure_id', p_closure_id),
      v_caller_uid
    )
    RETURNING id INTO v_z_id;

    -- Audit log del Z Report
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('Z_REPORT_GENERATED', 'z_reports', v_z_id, v_closure.store_id, v_caller_uid,
      jsonb_build_object('z_report_number', v_z_number, 'cash_closure_id', p_closure_id,
        'total_sales', v_cash_sales + v_transfer_sales + v_zelle_sales, 'total_tax', v_tax_total));

  EXCEPTION WHEN OTHERS THEN
    -- Aclaración 2: error específico para Z Report
    RAISE EXCEPTION 'ERR_Z_REPORT_GENERATION_FAILED: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'status', 'success', 'closure_id', p_closure_id,
    'system_expected_total', v_system_expected_total, 'difference', v_difference,
    'z_report_number', v_z_number, 'z_report_id', v_z_id
  );
END;

$function$;

-- ═══════════════════════════════════════════════════════════════════════
-- REM-SEC-1 · FIX EF2-16a (P0) — Escalada de privilegios por self-update
-- ═══════════════════════════════════════════════════════════════════════
-- profiles_tenant_update permite la rama (id = auth.uid()) en AMBAS ramas del
-- CASE (GUC activo o no), sin restricción de columnas: cualquier usuario
-- autenticado podía elevar su propio role a 'admin' (EF2-16a, E2E-2).
--
-- Barrera canónica a nivel DB (el modelo del codebase usa triggers/ RPC como
-- boundary: validate_active_store, fn_sync_profile_role, managed_update_user):
-- un self-update (actor == objetivo) solo puede tocar campos de perfil
-- permitidos. Las vías administrativas legítimas NO se ven afectadas:
--   * managed_update_user (RPC SECURITY DEFINER vía /api/users/[id], service
--     role sin sub en JWT ⇒ auth.uid() = NULL ⇒ NEW.id <> auth.uid()).
--   * Administrador actualizando a OTRO usuario ⇒ NEW.id <> auth.uid().
-- Campos de servicio self-service preservados: full_name, logo_url,
-- ai_provider, ai_api_key, active_store_id (validado por
-- trigger_validate_active_store), plan y email.
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
$function$;

DROP TRIGGER IF EXISTS trg_prevent_self_privilege_escalation ON public.profiles;

CREATE TRIGGER trg_prevent_self_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_privilege_escalation();

-- ═══════════════════════════════════════════════════════════════════════
-- REM-SEC-1 · FIX EF2-11a (sub-defecto, descubierto durante la recert) —
-- Vía administrativa de reapertura funcional
-- ═══════════════════════════════════════════════════════════════════════
-- reopen_cash_shift (RPC administrativa admin/manager, única vía legítima de
-- corrección post-cierre) referenciaba la columna inexistente
-- cash_closures.updated_at ⇒ el UPDATE SIEMPRE fallaba con "column does not
-- exist" y el mecanismo administrativo exigido por la inmutabilidad era
-- inoperante. Sin este fix, el cierre quedaría congelado sin vía de
-- corrección (EF2-11a exige inmutabilidad + vía administrativa preservada).
-- Fix: eliminar la línea updated_at = NOW() del UPDATE (el sello de
-- reapertura ya queda registrado en notes y por el trigger de auditoría).
CREATE OR REPLACE FUNCTION public.reopen_cash_shift(p_closure_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_closure RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED: reason must be at least 3 characters';
  END IF;

  SELECT * INTO v_closure FROM public.cash_closures WHERE id = p_closure_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_FOUND';
  END IF;

  IF v_closure.status <> 'cerrado' THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_CLOSED: status=%', v_closure.status;
  END IF;

  -- Auth: solo admin/manager del store
  IF v_caller_uid IS NULL OR NOT public.has_store_role_as(v_caller_uid, v_closure.store_id, ARRAY['admin', 'manager']) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins/managers can reopen cash closures';
  END IF;

  -- Bypass del trigger de inmutabilidad
  PERFORM set_config('app.bypass_closure_lock', 'true', false);

  UPDATE public.cash_closures SET
    status = 'pendiente',
    notes = COALESCE(notes, '') || E'\n[REOPENED ' || NOW()::text || E'] ' || p_reason
  WHERE id = p_closure_id;

  PERFORM set_config('app.bypass_closure_lock', 'false', false);

  -- Audit log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CASH_CLOSURE_REOPENED', 'cash_closures', p_closure_id, v_closure.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'old_status', 'cerrado', 'reopened_at', NOW()));

  RETURN jsonb_build_object('status', 'success', 'closure_id', p_closure_id);
END;
$function$

