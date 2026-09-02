-- ═══════════════════════════════════════════════════════════════════════
-- W9.4.2 — F-06 CIERRE: HARDENING DE FUNCIONES C2 (CONTEXTO MIXTO) + TEST-ONLY
-- Orden: GO W9.4.2 · Fecha: 2026-09-02 20:09 UTC · Base: 7b1bafcd (W9.4.1)
-- ═══════════════════════════════════════════════════════════════════════
-- ALCANCE: únicamente proacl (EXECUTE) de 33 funciones SECURITY DEFINER
--   * 31 C2-B: consumidores runtime 100% service_role (verificado por call-site:
--     getSupabaseAdminSafe() o createClient con SUPABASE_SERVICE_ROLE_KEY).
--     Cero consumidores authenticated/anon/browser en todo el repositorio.
--   *  2 C2-E test-only (is_tenant_member, has_store_role_as): sin call-sites
--     runtime; tests leen archivos de migración (readFileSync), no invocan RPC.
--     has_store_role_as tiene llamadores BD internos SD (create_sale_v2,
--     reopen_cash_shift) ⇒ contexto definer=postgres, EXECUTE interno intacto.
-- NO modifica: cuerpos, SECURITY DEFINER, owners, search_path, datos, triggers,
-- policies, tablas, reset_store_data (W9.2), RLS (W9.3), las 119 de W9.4.1.
-- REGLA FUNDAMENTAL: NO es un REVOKE masivo; cada función fue analizada
-- individualmente (FASE 3-6) y su estado PRE queda verificado por firma
-- completa en el GUARD inferior. Rollback: GRANTs inversos 1:1 (FASE 8/17).
-- POST esperado por función: {postgres(owner), service_role}.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── GUARD de seguridad (solo lectura de catálogo; no muta nada) ─────────
-- Aborta si el estado real difiere del PRE documentado en
-- w9-readiness/evidence/f06c2/pre/ (W9.4.2 FASE 1-9).
DO $guard$
DECLARE
  v_cnt int;
  v_oid oid;
  v_own name;
  r record;
BEGIN
  -- 1) W9.2 intacto: reset_store_data sigue service/postgres-only (2 overloads)
  SELECT count(*) INTO v_cnt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='reset_store_data'
    AND NOT has_function_privilege('public', p.oid, 'EXECUTE')
    AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND has_function_privilege('service_role', p.oid, 'EXECUTE')
    AND has_function_privilege('postgres', p.oid, 'EXECUTE');
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'W9.4.2 GUARD: estado W9.2 de reset_store_data alterado (%)', v_cnt;
  END IF;

  -- 2) W9.3 intacto: cero tablas public con RLS OFF
  SELECT count(*) INTO v_cnt
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'W9.4.2 GUARD: RLS OFF en % tablas public (W9.3 alterado)', v_cnt;
  END IF;

  -- 3) W9.4.1 intacto: exposición SD global = PRE de W9.4.2 (PUBLIC=26, anon=26, auth=103)
  SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND has_function_privilege('public', p.oid, 'EXECUTE');
  IF v_cnt <> 26 THEN
    RAISE EXCEPTION 'W9.4.2 GUARD: exposición SD PUBLIC=% (esperado 26)', v_cnt;
  END IF;
  SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_cnt <> 26 THEN
    RAISE EXCEPTION 'W9.4.2 GUARD: exposición SD anon=% (esperado 26)', v_cnt;
  END IF;
  SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_cnt <> 103 THEN
    RAISE EXCEPTION 'W9.4.2 GUARD: exposición SD authenticated=% (esperado 103)', v_cnt;
  END IF;

  -- 4) PROTECCIÓN GUARD-LAYER RLS: ninguna de las 33 puede estar referenciada
  --    por expresiones de policies (protección C2-1 permanente en apply-time)
  FOR r IN
    SELECT unnest(ARRAY['auto_match_bank_items','bulk_assign_memberships','calculate_abc',
      'calculate_service_distribution','cleanup_old_aggregates','close_fiscal_period',
      'create_devolution_v2','create_production_order_v2','create_quotation',
      'create_received_service_v2','distribute_service_cost_v2','duplicate_inventory_adjustment',
      'duplicate_inventory_adjustment_v2','get_product_cost_analysis','get_reorder_suggestions',
      'get_usage_summary','lock_fiscal_period','purge_old_reset_snapshots','receive_to_warehouse',
      'reverse_adjustment','reverse_devolution','reverse_production_order','reverse_receipt',
      'reverse_transaction','reverse_transaction_v2','reverse_transfer','set_received_service_status',
      'soft_delete_store','upsert_usage_aggregate','validate_store_can_be_modified',
      'void_received_service_with_reversal','is_tenant_member','has_store_role_as']) AS name
  LOOP
    SELECT count(*) INTO v_cnt
    FROM pg_policy pol
    WHERE pg_get_expr(pol.polqual, pol.polrelid) LIKE '%' || r.name || '%'
       OR pg_get_expr(pol.polwithcheck, pol.polrelid) LIKE '%' || r.name || '%';
    IF v_cnt <> 0 THEN
      RAISE EXCEPTION 'W9.4.2 GUARD: % referenciada por % policy(ies) RLS — función guard-layer', r.name, v_cnt;
    END IF;
  END LOOP;

  -- 5) Verificación PRE por firma completa: existencia, owner y patrón de exposición
  FOR r IN
    SELECT * FROM (VALUES
      ('public.auto_match_bank_items(uuid,uuid)', false, false, true),
      ('public.bulk_assign_memberships(uuid,jsonb)', true, true, true),
      ('public.calculate_abc(uuid,integer,integer,uuid)', false, false, true),
      ('public.calculate_service_distribution(uuid)', false, false, true),
      ('public.cleanup_old_aggregates(integer)', false, false, true),
      ('public.close_fiscal_period(uuid,integer,integer,uuid)', false, false, true),
      ('public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text)', true, true, true),
      ('public.create_production_order_v2(uuid,text,text,text,text,text,numeric,text,text,text,jsonb,numeric,text,text,uuid,text)', true, true, true),
      ('public.create_quotation(uuid,jsonb,uuid,uuid,text,text,text,numeric,text,date)', false, false, true),
      ('public.create_received_service_v2(uuid,text,numeric,uuid,text,date,text,numeric,integer,text,text,text,jsonb,uuid)', true, true, true),
      ('public.distribute_service_cost_v2(uuid,uuid)', true, true, true),
      ('public.duplicate_inventory_adjustment(uuid,uuid)', false, false, true),
      ('public.duplicate_inventory_adjustment_v2(uuid,uuid)', true, true, true),
      ('public.get_product_cost_analysis(uuid,uuid)', false, false, true),
      ('public.get_reorder_suggestions(uuid,uuid)', false, false, true),
      ('public.get_usage_summary(integer)', false, false, true),
      ('public.has_store_role_as(uuid,uuid,text[])', true, true, true),
      ('public.is_tenant_member(uuid)', true, true, true),
      ('public.lock_fiscal_period(uuid,integer,integer)', false, false, true),
      ('public.purge_old_reset_snapshots(integer)', false, false, true),
      ('public.receive_to_warehouse(uuid,uuid,numeric,numeric,uuid,text,date,uuid,text)', false, false, true),
      ('public.reverse_adjustment(uuid,text,uuid)', false, false, true),
      ('public.reverse_devolution(uuid,text,uuid)', false, false, true),
      ('public.reverse_production_order(uuid,text,uuid)', true, true, true),
      ('public.reverse_receipt(uuid,text,uuid)', false, false, true),
      ('public.reverse_transaction(uuid,text,uuid)', false, false, true),
      ('public.reverse_transaction_v2(uuid,text,uuid)', true, true, true),
      ('public.reverse_transfer(uuid,text,uuid)', false, false, true),
      ('public.set_received_service_status(uuid,text,uuid,text)', true, true, true),
      ('public.soft_delete_store(uuid,uuid)', false, false, true),
      ('public.upsert_usage_aggregate(timestamp with time zone,timestamp with time zone,text,text,text,integer,double precision)', false, false, true),
      ('public.validate_store_can_be_modified(uuid,text)', false, false, true),
      ('public.void_received_service_with_reversal(uuid,uuid,text,timestamp with time zone)', true, true, true)
    ) AS t(sig, e_pub, e_anon, e_auth)
  LOOP
    v_oid := to_regprocedure(r.sig);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'W9.4.2 GUARD: firma PRE no encontrada: %', r.sig;
    END IF;
    SELECT proowner::regrole::text INTO v_own FROM pg_proc WHERE oid = v_oid;
    IF v_own <> 'postgres' THEN
      RAISE EXCEPTION 'W9.4.2 GUARD: % owner=% (esperado postgres)', r.sig, v_own;
    END IF;
    IF has_function_privilege('public', v_oid, 'EXECUTE') <> r.e_pub
       OR has_function_privilege('anon', v_oid, 'EXECUTE') <> r.e_anon
       OR has_function_privilege('authenticated', v_oid, 'EXECUTE') <> r.e_auth
       OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE')
       OR NOT has_function_privilege('postgres', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'W9.4.2 GUARD: patrón de exposición PRE inesperado: %', r.sig;
    END IF;
  END LOOP;
END
$guard$;

/* ─────────────────────────────────────────────────────────────────────────
   (A) REVOKE/GRANT por función — 33 secciones explícitas, firma completa.
   POST por función: {postgres(owner), service_role}.
   ───────────────────────────────────────────────────────────────────────── */

-- [C2-B] public.auto_match_bank_items(p_statement_id uuid, p_user_id uuid) · PRE=authenticated · consumidores: bank-reconciliation/match
REVOKE EXECUTE ON FUNCTION public.auto_match_bank_items(uuid,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.auto_match_bank_items(uuid,uuid) TO service_role;

-- [C2-B] public.bulk_assign_memberships(p_user_id uuid, p_assignments jsonb) · PRE=PUBLIC+anon+authenticated · consumidores: users/[id]/memberships/bulk
REVOKE EXECUTE ON FUNCTION public.bulk_assign_memberships(uuid,jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_assign_memberships(uuid,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bulk_assign_memberships(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_assign_memberships(uuid,jsonb) TO service_role;

-- [C2-B] public.calculate_abc(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) · PRE=authenticated · consumidores: abc-analysis
REVOKE EXECUTE ON FUNCTION public.calculate_abc(uuid,integer,integer,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_abc(uuid,integer,integer,uuid) TO service_role;

-- [C2-B] public.calculate_service_distribution(p_service_id uuid) · PRE=authenticated · consumidores: received-services/distribute
REVOKE EXECUTE ON FUNCTION public.calculate_service_distribution(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_service_distribution(uuid) TO service_role;

-- [C2-B] public.cleanup_old_aggregates(p_days integer) · PRE=authenticated · consumidores: cron/usage-sync
REVOKE EXECUTE ON FUNCTION public.cleanup_old_aggregates(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_aggregates(integer) TO service_role;

-- [C2-B] public.close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) · PRE=authenticated · consumidores: (ninguno runtime)
REVOKE EXECUTE ON FUNCTION public.close_fiscal_period(uuid,integer,integer,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.close_fiscal_period(uuid,integer,integer,uuid) TO service_role;

-- [C2-B] public.create_devolution_v2(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text, p_idempotency_key text) · PRE=PUBLIC+anon+authenticated · consumidores: (ninguno runtime)
REVOKE EXECUTE ON FUNCTION public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text) TO service_role;

-- [C2-B] public.create_production_order_v2(p_store_id uuid, p_order_type text, p_customer_name text, p_customer_ci text, p_customer_phone text, p_customer_address text, p_budget_total numeric, p_budget_currency text, p_description text, p_notes text, p_items jsonb, p_advance_amount numeric, p_advance_method text, p_advance_currency text, p_created_by uuid, p_idempotency_key text) · PRE=PUBLIC+anon+authenticated · consumidores: production-orders
REVOKE EXECUTE ON FUNCTION public.create_production_order_v2(uuid,text,text,text,text,text,numeric,text,text,text,jsonb,numeric,text,text,uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_production_order_v2(uuid,text,text,text,text,text,numeric,text,text,text,jsonb,numeric,text,text,uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_production_order_v2(uuid,text,text,text,text,text,numeric,text,text,text,jsonb,numeric,text,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_production_order_v2(uuid,text,text,text,text,text,numeric,text,text,text,jsonb,numeric,text,text,uuid,text) TO service_role;

-- [C2-B] public.create_quotation(p_store_id uuid, p_items jsonb, p_user_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_discount_type text, p_discount_value numeric, p_notes text, p_valid_until date) · PRE=authenticated · consumidores: quotations
REVOKE EXECUTE ON FUNCTION public.create_quotation(uuid,jsonb,uuid,uuid,text,text,text,numeric,text,date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_quotation(uuid,jsonb,uuid,uuid,text,text,text,numeric,text,date) TO service_role;

-- [C2-B] public.create_received_service_v2(p_store_id uuid, p_supplier text, p_total_amount numeric, p_service_type_id uuid, p_service_type_name text, p_service_date date, p_currency text, p_exchange_rate numeric, p_payment_terms_days integer, p_distribution_method text, p_reference_doc text, p_observations text, p_receipt_ids jsonb, p_created_by uuid) · PRE=PUBLIC+anon+authenticated · consumidores: received-services
REVOKE EXECUTE ON FUNCTION public.create_received_service_v2(uuid,text,numeric,uuid,text,date,text,numeric,integer,text,text,text,jsonb,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_received_service_v2(uuid,text,numeric,uuid,text,date,text,numeric,integer,text,text,text,jsonb,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_received_service_v2(uuid,text,numeric,uuid,text,date,text,numeric,integer,text,text,text,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_received_service_v2(uuid,text,numeric,uuid,text,date,text,numeric,integer,text,text,text,jsonb,uuid) TO service_role;

-- [C2-B] public.distribute_service_cost_v2(p_service_id uuid, p_user_id uuid) · PRE=PUBLIC+anon+authenticated · consumidores: received-services/distribute
REVOKE EXECUTE ON FUNCTION public.distribute_service_cost_v2(uuid,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.distribute_service_cost_v2(uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.distribute_service_cost_v2(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.distribute_service_cost_v2(uuid,uuid) TO service_role;

-- [C2-B] public.duplicate_inventory_adjustment(p_original_id uuid, p_user_id uuid) · PRE=authenticated · consumidores: scripts/test_adjustments_e2e.mjs; inventory/adjustments/duplicate
REVOKE EXECUTE ON FUNCTION public.duplicate_inventory_adjustment(uuid,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_inventory_adjustment(uuid,uuid) TO service_role;

-- [C2-B] public.duplicate_inventory_adjustment_v2(p_original_id uuid, p_user_id uuid) · PRE=PUBLIC+anon+authenticated · consumidores: (ninguno runtime)
REVOKE EXECUTE ON FUNCTION public.duplicate_inventory_adjustment_v2(uuid,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.duplicate_inventory_adjustment_v2(uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.duplicate_inventory_adjustment_v2(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.duplicate_inventory_adjustment_v2(uuid,uuid) TO service_role;

-- [C2-B] public.get_product_cost_analysis(p_product_id uuid, p_store_id uuid) · PRE=authenticated · consumidores: received-services/analysis
REVOKE EXECUTE ON FUNCTION public.get_product_cost_analysis(uuid,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_cost_analysis(uuid,uuid) TO service_role;

-- [C2-B] public.get_reorder_suggestions(p_store_id uuid, p_user_id uuid) · PRE=authenticated · consumidores: reorder-suggestions
REVOKE EXECUTE ON FUNCTION public.get_reorder_suggestions(uuid,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_reorder_suggestions(uuid,uuid) TO service_role;

-- [C2-B] public.get_usage_summary(p_hours integer) · PRE=authenticated · consumidores: usage/summary
REVOKE EXECUTE ON FUNCTION public.get_usage_summary(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_usage_summary(integer) TO service_role;

-- [C2-E] public.has_store_role_as(p_user_id uuid, p_store_id uuid, p_roles text[]) · PRE=PUBLIC+anon+authenticated · consumidores: (ninguno runtime)
--     llamadores BD internos (SD, contexto definer=postgres): create_sale_v2 (SD, definer=postgres); reopen_cash_shift (SD, definer=postgres)
REVOKE EXECUTE ON FUNCTION public.has_store_role_as(uuid,uuid,text[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_store_role_as(uuid,uuid,text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_store_role_as(uuid,uuid,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_store_role_as(uuid,uuid,text[]) TO service_role;

-- [C2-E] public.is_tenant_member(p_tenant_id uuid) · PRE=PUBLIC+anon+authenticated · consumidores: (ninguno runtime)
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid) TO service_role;

-- [C2-B] public.lock_fiscal_period(p_store_id uuid, p_year integer, p_month integer) · PRE=authenticated · consumidores: (ninguno runtime)
REVOKE EXECUTE ON FUNCTION public.lock_fiscal_period(uuid,integer,integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lock_fiscal_period(uuid,integer,integer) TO service_role;

-- [C2-B] public.purge_old_reset_snapshots(p_days integer) · PRE=authenticated · consumidores: cron/purge-snapshots
REVOKE EXECUTE ON FUNCTION public.purge_old_reset_snapshots(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_reset_snapshots(integer) TO service_role;

-- [C2-B] public.receive_to_warehouse(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost numeric, p_warehouse_id uuid, p_lot_number text, p_expiration_date date, p_user_id uuid, p_reason text) · PRE=authenticated · consumidores: receive-to-warehouse
REVOKE EXECUTE ON FUNCTION public.receive_to_warehouse(uuid,uuid,numeric,numeric,uuid,text,date,uuid,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.receive_to_warehouse(uuid,uuid,numeric,numeric,uuid,text,date,uuid,text) TO service_role;

-- [C2-B] public.reverse_adjustment(p_adjustment_id uuid, p_reason text, p_user_id uuid) · PRE=authenticated · consumidores: scripts/test_adjustments_e2e.mjs; scripts/test_reverse_all_live.mjs; scripts/test_reverse_e2e_full.mjs
REVOKE EXECUTE ON FUNCTION public.reverse_adjustment(uuid,text,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_adjustment(uuid,text,uuid) TO service_role;

-- [C2-B] public.reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid) · PRE=authenticated · consumidores: scripts/test_reverse_all_live.mjs; scripts/test_reverse_e2e_full.mjs
REVOKE EXECUTE ON FUNCTION public.reverse_devolution(uuid,text,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_devolution(uuid,text,uuid) TO service_role;

-- [C2-B] public.reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid) · PRE=PUBLIC+anon+authenticated · consumidores: scripts/test_reverse_all_live.mjs; scripts/test_reverse_e2e_full.mjs
REVOKE EXECUTE ON FUNCTION public.reverse_production_order(uuid,text,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_production_order(uuid,text,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reverse_production_order(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_production_order(uuid,text,uuid) TO service_role;

-- [C2-B] public.reverse_receipt(p_receipt_id uuid, p_reason text, p_user_id uuid) · PRE=authenticated · consumidores: scripts/test_reverse_all_live.mjs; scripts/test_reverse_e2e_full.mjs
--     llamadores BD internos (SD, contexto definer=postgres): reverse_receipt_v2 (SD, definer=postgres)
REVOKE EXECUTE ON FUNCTION public.reverse_receipt(uuid,text,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_receipt(uuid,text,uuid) TO service_role;

-- [C2-B] public.reverse_transaction(p_transaction_id uuid, p_reason text, p_user_id uuid) · PRE=authenticated · consumidores: scripts/test_reverse_all_live.mjs; scripts/test_reverse_e2e_full.mjs
REVOKE EXECUTE ON FUNCTION public.reverse_transaction(uuid,text,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(uuid,text,uuid) TO service_role;

-- [C2-B] public.reverse_transaction_v2(p_transaction_id uuid, p_reason text, p_user_id uuid) · PRE=PUBLIC+anon+authenticated · consumidores: (ninguno runtime)
REVOKE EXECUTE ON FUNCTION public.reverse_transaction_v2(uuid,text,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_transaction_v2(uuid,text,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reverse_transaction_v2(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_transaction_v2(uuid,text,uuid) TO service_role;

-- [C2-B] public.reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) · PRE=authenticated · consumidores: scripts/test_reverse_all_live.mjs; scripts/test_reverse_e2e_full.mjs
REVOKE EXECUTE ON FUNCTION public.reverse_transfer(uuid,text,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transfer(uuid,text,uuid) TO service_role;

-- [C2-B] public.set_received_service_status(p_service_id uuid, p_new_status text, p_user_id uuid, p_reason text) · PRE=PUBLIC+anon+authenticated · consumidores: received-services
REVOKE EXECUTE ON FUNCTION public.set_received_service_status(uuid,text,uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_received_service_status(uuid,text,uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_received_service_status(uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_received_service_status(uuid,text,uuid,text) TO service_role;

-- [C2-B] public.soft_delete_store(p_store_id uuid, p_deleted_by uuid) · PRE=authenticated · consumidores: docs/ITERATION_8_BULK_STORE_AUDIT.md; stores/bulk; stores
--     llamadores BD internos (SD, contexto definer=postgres): bulk_soft_delete_stores (SD, definer=postgres)
REVOKE EXECUTE ON FUNCTION public.soft_delete_store(uuid,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_store(uuid,uuid) TO service_role;

-- [C2-B] public.upsert_usage_aggregate(p_bucket_start timestamp with time zone, p_bucket_end timestamp with time zone, p_metric_type text, p_service text, p_endpoint text, p_count integer, p_sum_value double precision) · PRE=authenticated · consumidores: src/lib/usage-tracker.ts
REVOKE EXECUTE ON FUNCTION public.upsert_usage_aggregate(timestamp with time zone,timestamp with time zone,text,text,text,integer,double precision) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_usage_aggregate(timestamp with time zone,timestamp with time zone,text,text,text,integer,double precision) TO service_role;

-- [C2-B] public.validate_store_can_be_modified(p_store_id uuid, p_check_type text) · PRE=authenticated · consumidores: stores/bulk/preview
--     llamadores BD internos (SD, contexto definer=postgres): bulk_soft_delete_stores (SD, definer=postgres); reset_store_data (SD, definer=postgres)
REVOKE EXECUTE ON FUNCTION public.validate_store_can_be_modified(uuid,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_store_can_be_modified(uuid,text) TO service_role;

-- [C2-B] public.void_received_service_with_reversal(p_service_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone) · PRE=PUBLIC+anon+authenticated · consumidores: received-services
REVOKE EXECUTE ON FUNCTION public.void_received_service_with_reversal(uuid,uuid,text,timestamp with time zone) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.void_received_service_with_reversal(uuid,uuid,text,timestamp with time zone) FROM anon;
REVOKE EXECUTE ON FUNCTION public.void_received_service_with_reversal(uuid,uuid,text,timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_received_service_with_reversal(uuid,uuid,text,timestamp with time zone) TO service_role;

-- ── (B) Recarga del schema cache de PostgREST (canal estándar Supabase) ─
NOTIFY pgrst, 'reload schema';

COMMIT;
