-- ============================================================================
-- Migration: 20260902231200_w9_f45_h4_reverse_receipt_v2_reconcile.sql
-- W9.4.5 — H-4: reconcile reverse_receipt_v2 drift (P1 security + integrity)
-- ============================================================================
-- CANONICAL BASE: W7 audited release S2.6
--   (audit-evidence/20260830-w7/release/sql/01-df01-wac-singleton.sql, lines 406-454)
--   = the definition currently live in production; the ONLY version compatible
--   with trg_guard_wac_writer (ERR_WAC_SINGLE_WRITER_VIOLATION) introduced by
--   W7 DF-01 "WAC single writer". supabase/migrations PR-4 body (20260810000040)
--   is pre-W7 and INCOMPATIBLE with the current trigger guard (inline
--   cost_average UPDATE would be rejected) -> NOT used as base.
--
-- REPAIRS APPLIED ON TOP OF THE W7 BASE (each independently justified):
--   R1 [P1 SECURITY] restore v_caller_uid guard + has_store_access_as tenant/store
--      check. Proof of defect (W9.4.5): live body has NO auth.uid()/auth.role()/
--      has_store_access_as reference and trusts p_user_id blindly; dynamic probe
--      as simulated 'authenticated' role reached the function body with zero
--      prechecks. ACL keeps authenticated EXECUTE (legitimate browser path
--      useVoidReception -> PostgREST, F-06 documented exception) => guard is the
--      correct fix; ACL unchanged.
--   R2 [INTEGRITY] exact-inverse WAC: remove GREATEST(0,...) clamp and always
--      call fn_recalc_wac (W7 D-01 design: ERR_WAC_REVERSE_NEGATIVE_STOCK when
--      S+q <= 0). The clamp silently zeroed stock and skipped WAC recalc,
--      hiding inventory inconsistencies (PR-4/B-12 contract: RAISE, not silence).
--   R3 [FUNCTIONAL] payment reset restored (PR-4 + void_pending_reception
--      canonical pattern): receipts.payment_status='unpaid', paid_amount=0,
--      paid_at=NULL + payment_transactions notes '[REVERSED by ...]' + count.
--   R4 [AUDIT] action unified to 'REVERSE_RECEIPT_V2' (36 historical rows +
--      B-12 test contract). Live drift string 'RECEIPT_REVERSED_V2' has 0 rows.
--   R5 [H-1] search_path 'public, pg_temp' (explicit, pg_temp last).
--   R6 [AUDIT INTEGRITY] all audit fields use v_caller_uid (real caller
--      identity); p_user_id honored ONLY for service_role (server-verified via
--      /api/reverse session.user.id).
--
-- UNCHANGED: signature (uuid, text, uuid) -> jsonb; owner postgres;
-- SECURITY DEFINER; ACL/proacl; status transition to 'reversed' (W7 semantics);
-- return keys of W7 ({status, receipt_id, items_processed}) kept, additive
-- 'payments_reversed' only. V1 (reverse_receipt) untouched. H-2 remains BACKLOG.
-- ROLLBACK: reverse_receipt_v2 is definition-only; rollback = re-apply prior
-- body captured in audit-evidence/20260902-w9.4.5-h4/raw/h4_live_catalog.json
-- (prosrc). No data migration involved.
-- ============================================================================

-- ─── PRECONDITION GUARDS (fail-closed; abort before any change) ─────────────
DO $h4_guard$
DECLARE
  v_def text;
  v_identity_args text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'reverse_receipt_v2'
    AND pg_get_function_identity_arguments(p.oid) = 'p_receipt_id uuid, p_reason text, p_user_id uuid';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'H4-GUARD-FAIL: public.reverse_receipt_v2(p_receipt_id uuid, p_reason text, p_user_id uuid) not found with expected signature';
  END IF;

  IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'H4-GUARD-FAIL: live function is not SECURITY DEFINER';
  END IF;

  IF to_regprocedure('public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'H4-GUARD-FAIL: public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb) not found';
  END IF;

  IF to_regprocedure('public.has_store_access_as(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'H4-GUARD-FAIL: public.has_store_access_as(uuid,uuid) not found';
  END IF;

  IF to_regclass('public.payment_transactions') IS NULL THEN
    RAISE EXCEPTION 'H4-GUARD-FAIL: public.payment_transactions not found';
  END IF;

  IF to_regclass('public.wac_change_log') IS NULL THEN
    RAISE EXCEPTION 'H4-GUARD-FAIL: public.wac_change_log not found (W7 DF-01 expected)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname='public' AND c.relname='products'
                   AND t.tgname='trg_guard_wac_writer' AND NOT t.tgisinternal) THEN
    RAISE EXCEPTION 'H4-GUARD-FAIL: trg_guard_wac_writer on products not found (W7 DF-01 expected)';
  END IF;

  RAISE NOTICE 'H4-GUARD: all preconditions OK';
END
$h4_guard$;

-- ─── RECONCILED CANONICAL IMPLEMENTATION ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_receipt_v2(
  p_receipt_id uuid,
  p_reason text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  -- R1/R6: real caller identity. service_role callers are server-side actors
  -- (/api/reverse injects session.user.id); every other role is pinned to
  -- auth.uid() so p_user_id cannot forge authorship.
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid())
                            ELSE auth.uid() END;
  v_current_stock numeric;
  v_new_stock numeric;
  v_unit_cost_cup numeric;
  v_items_processed int := 0;
  v_reversed_payments int := 0;
BEGIN
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status <> 'active' THEN
    RAISE EXCEPTION 'ERR_RECEIPT_NOT_ACTIVE: status=%', v_receipt.status;
  END IF;

  -- R1 [P1]: tenant/store isolation. Mirrors V1 model + PR-4 guard.
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN SELECT * FROM public.receipt_items WHERE receipt_id = p_receipt_id LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);

    SELECT stock_current INTO v_current_stock
    FROM public.products
    WHERE id = v_item.product_id AND store_id = v_receipt.store_id
    FOR UPDATE;
    v_current_stock := COALESCE(v_current_stock, 0);

    -- R2: exact inverse. fn_recalc_wac raises ERR_WAC_REVERSE_NEGATIVE_STOCK
    -- when S + q <= 0 (detection over silence — W7 D-01 / PR-4 / B-12 contract).
    -- fn_recalc_wac locks the product row and updates cost_average with the
    -- app.wac_writer token (single writer).
    PERFORM public.fn_recalc_wac(
      v_receipt.store_id, v_item.product_id, 'reception_reverse',
      -v_item.quantity, v_unit_cost_cup,
      jsonb_build_object('rpc', 'reverse_receipt_v2', 'receipt_id', p_receipt_id));

    v_new_stock := v_current_stock - v_item.quantity;

    UPDATE public.products
    SET stock_current = v_new_stock, updated_at = now()
    WHERE id = v_item.product_id AND store_id = v_receipt.store_id;

    INSERT INTO public.stock_movements
      (product_id, store_id, movement_type, quantity_change, unit_cost,
       reference_doc, created_at, created_by, movement_date)
    VALUES
      (v_item.product_id, v_receipt.store_id, 'purchase_reverse'::movement_type,
       -v_item.quantity, v_unit_cost_cup,
       'Reversión recepción: ' || COALESCE(p_reason, ''), now(), v_caller_uid, now());

    v_items_processed := v_items_processed + 1;
  END LOOP;

  UPDATE public.receipts
  SET status = 'reversed',
      reversed_at = now(),
      reversed_by = v_caller_uid,
      reversal_reason = p_reason,
      -- R3: payment reset (PR-4 / void_pending_reception canonical pattern)
      payment_status = 'unpaid',
      paid_amount = 0,
      paid_at = NULL
  WHERE id = p_receipt_id;

  -- R3: mark related payment transactions (notes marker, canonical pattern)
  UPDATE public.payment_transactions
  SET notes = COALESCE(notes, '') || ' [REVERSED by reverse_receipt_v2 '
              || p_receipt_id::text || ' at ' || now()::text || ']'
  WHERE ref_type = 'receipt' AND ref_id = p_receipt_id;
  GET DIAGNOSTICS v_reversed_payments = ROW_COUNT;

  -- R4/R6: unified historical action string + real caller identity
  INSERT INTO public.audit_logs
    (user_id, store_id, action, table_name, record_id, metadata)
  VALUES
    (v_caller_uid, v_receipt.store_id, 'REVERSE_RECEIPT_V2', 'receipts', p_receipt_id,
     jsonb_build_object('reason', p_reason,
                        'items_processed', v_items_processed,
                        'payments_reversed', v_reversed_payments,
                        'v2_reverse', true));

  RETURN jsonb_build_object('status', 'success',
                            'receipt_id', p_receipt_id,
                            'items_processed', v_items_processed,
                            'payments_reversed', v_reversed_payments);
END
$fn$;

COMMENT ON FUNCTION public.reverse_receipt_v2(uuid, text, uuid) IS
'W9.4.5-H4 reconciled: W7 DF-01 single-writer base + restored v_caller_uid/has_store_access_as guard (P1) + payment reset + exact-inverse WAC (no clamp) + audit REVERSE_RECEIPT_V2 + search_path public,pg_temp. Signature/owner/ACL unchanged. Rollback body: audit-evidence/20260902-w9.4.5-h4/raw/h4_live_catalog.json';
