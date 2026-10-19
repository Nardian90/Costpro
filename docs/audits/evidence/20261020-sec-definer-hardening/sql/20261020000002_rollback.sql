-- =====================================================================
-- ROLLBACK de 20261020000002_sec_definer_hardening.sql (CP-SEC-027 F7)
-- Restaura el estado exacto previo. Transaccional e idempotente.
-- Definiciones previas capturadas VIVAS antes del cambio.
-- =====================================================================
BEGIN;

-- Restaurar e2e_hard_delete_store (definición previa exacta)
CREATE OR REPLACE FUNCTION public.e2e_hard_delete_store(p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
  v_is_test boolean;
  r record;
BEGIN
  -- ── Guarda 1: tiendas protegidas (FASE 18) ─────────────────────────────
  IF p_store_id::text IN (
    'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', -- TIENDA CENTRAL COSTPRO
    '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1', -- Puerto Padre VITALLCONS
    '5e6fe821-5465-48b1-b3f1-3aa3182edc38'  -- ENERVIDA-VITALLCONS
  ) THEN
    RAISE EXCEPTION 'E2E_HARD_DELETE_PROTECTED: la tienda % está protegida', p_store_id;
  END IF;

  SELECT name INTO v_name FROM public.stores WHERE id = p_store_id;
  IF v_name IS NULL THEN
    RETURN false; -- ya no existe (idempotente)
  END IF;

  -- Serializar llamadas concurrentes (el par DISABLE/ENABLE TRIGGER es
  -- global: dos llamadas simultáneas solaparían su ventana)
  PERFORM pg_advisory_xact_lock(918273645);

  -- ── Guarda 2: solo artefactos de test (nombre) ─────────────────────────
  v_is_test := v_name ~* '^(E2E|E2E2|ESEC TEST|FASE-D TEST|AUDIT|HOT|REM-F4|TEST-|Test |Updated Name E2E)'
            OR v_name ILIKE 'e2e80-%' OR v_name ILIKE 'e2e %' OR v_name ILIKE 'e2e-%'
            OR v_name ILIKE '%updated name e2e%'
            OR v_name ILIKE '%playwright%'
            OR v_name ILIKE '%probe%';
  IF NOT v_is_test THEN
    RAISE EXCEPTION 'E2E_HARD_DELETE_NOT_A_TEST_STORE: % no coincide con patrón de test', v_name;
  END IF;

  -- ── Desactivar triggers user-level de las tablas afectadas ─────────────
  CREATE TEMP TABLE IF NOT EXISTS _e2e_disabled_triggers(table_name text, trg_name text) ON COMMIT DROP;
  DELETE FROM _e2e_disabled_triggers WHERE true;

  FOR r IN
    SELECT DISTINCT cl.relname AS tbl, t.tgname
    FROM pg_trigger t
    JOIN pg_class cl ON cl.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND cl.relname IN (
        'z_reports','cash_movements','cash_register_sessions','cash_closures',
        'fiscal_closings','cost_sheet_templates','report_runs','report_definitions',
        'sync_log','inventory_batches','inventory_adjustments','audit_logs',
        'payment_transactions','receipt_items','receipt_tasa_audit','transfers',
        'profiles','transaction_item_lots','transaction_items','sale_items','sales',
        'sales_transactions','commission_reception_links','service_reception_links',
        'service_cost_distributions','receipts','commission_payments','commission_rules',
        'purchase_items','purchase_order_items','purchase_orders','production_order_items',
        'production_orders','physical_count_items','physical_counts','issue_slip_items',
        'issue_slips','devolution_items','devolutions','quotation_items','quotations',
        'inventory_adjustment_items','product_variants','commission_rule_products',
        'kardex_entries','stock_movements','inventory_movements','inventory',
        'warehouse_stock','warehouses','product_lots','product_cost_sheets','cost_sheets',
        'ofertas','price_change_history','price_commit_log','abc_classifications',
        'categories','customers','suppliers','workers','service_types','received_services',
        'document_sequences','tax_configurations','store_cost_templates',
        'store_exchange_rates','store_notifications','store_reset_snapshots',
        'restore_sessions','saved_analytics_views','user_store_memberships',
        'user_invitations','telegram_configs','telegram_contacts','telegram_invitations',
        'telegram_messages','telegram_product_posts','whatsapp_configs','whatsapp_contacts',
        'whatsapp_invitations','whatsapp_messages','whatsapp_product_posts',
        'whatsapp_risk_state','inventory_reservations','inventory_snapshots','products',
        'bank_statements','stores'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', r.tbl, r.tgname);
      INSERT INTO _e2e_disabled_triggers VALUES (r.tbl, r.tgname);
    EXCEPTION WHEN OTHERS THEN NULL; -- trigger ya deshabilitado, etc.
    END;
  END LOOP;

  -- ── Deletes en orden dependiente (RI interno sigue activo) ─────────────
  BEGIN
    DELETE FROM public.z_reports               WHERE store_id = p_store_id OR cash_closure_id IN (SELECT id FROM public.cash_closures WHERE store_id = p_store_id);
    DELETE FROM public.cash_movements          WHERE store_id = p_store_id OR session_id IN (SELECT id FROM public.cash_register_sessions WHERE store_id = p_store_id);
    DELETE FROM public.cash_register_sessions  WHERE store_id = p_store_id;
    DELETE FROM public.cash_closures           WHERE store_id = p_store_id;
    DELETE FROM public.fiscal_closings         WHERE store_id = p_store_id;
    DELETE FROM public.cost_sheet_templates    WHERE store_id = p_store_id;
    DELETE FROM public.report_runs             WHERE store_id = p_store_id;
    DELETE FROM public.report_definitions      WHERE store_id = p_store_id;
    DELETE FROM public.sync_log                WHERE store_id = p_store_id;
    DELETE FROM public.inventory_batches       WHERE store_id = p_store_id;
    DELETE FROM public.inventory_adjustments   WHERE store_id = p_store_id;
    DELETE FROM public.audit_logs              WHERE store_id = p_store_id;
    DELETE FROM public.payment_transactions    WHERE store_id = p_store_id
      OR transaction_id IN (SELECT id FROM public.transactions WHERE store_id = p_store_id);
    DELETE FROM public.receipt_items           WHERE receipt_id IN (SELECT id FROM public.receipts WHERE store_id = p_store_id);
    DELETE FROM public.receipt_tasa_audit      WHERE receipt_item_id IN (SELECT id FROM public.receipt_items WHERE receipt_id IN (SELECT id FROM public.receipts WHERE store_id = p_store_id));
    DELETE FROM public.transfers               WHERE origin_store_id = p_store_id OR destination_store_id = p_store_id;

    UPDATE public.profiles SET store_id = NULL WHERE store_id = p_store_id;

    DELETE FROM public.transaction_item_lots       WHERE transaction_item_id IN (SELECT id FROM public.transaction_items WHERE transaction_id IN (SELECT id FROM public.transactions WHERE store_id = p_store_id));
    DELETE FROM public.transaction_items           WHERE transaction_id IN (SELECT id FROM public.transactions WHERE store_id = p_store_id) OR product_id IN (SELECT id FROM public.products WHERE store_id = p_store_id);
    DELETE FROM public.sales_transactions          WHERE store_id = p_store_id;
    -- Nota: `sales`/`sale_items` no tienen vínculo de store (scoped por
    -- cashier) — se limpian en hardDeleteRunUser del teardown de usuarios.
    DELETE FROM public.commission_reception_links  WHERE receipt_id IN (SELECT id FROM public.receipts WHERE store_id = p_store_id) OR product_id IN (SELECT id FROM public.products WHERE store_id = p_store_id);
    DELETE FROM public.service_reception_links     WHERE receipt_id IN (SELECT id FROM public.receipts WHERE store_id = p_store_id) OR service_id IN (SELECT id FROM public.received_services WHERE store_id = p_store_id);
    DELETE FROM public.service_cost_distributions  WHERE receipt_id IN (SELECT id FROM public.receipts WHERE store_id = p_store_id) OR service_id IN (SELECT id FROM public.received_services WHERE store_id = p_store_id);
    DELETE FROM public.receipts                    WHERE store_id = p_store_id;
    DELETE FROM public.commission_payments         WHERE store_id = p_store_id;
    DELETE FROM public.commission_rules            WHERE store_id = p_store_id;
    DELETE FROM public.purchase_items              WHERE purchase_order_id IN (SELECT id FROM public.purchase_orders WHERE store_id = p_store_id);
    DELETE FROM public.purchase_order_items        WHERE po_id IN (SELECT id FROM public.purchase_orders WHERE store_id = p_store_id);
    DELETE FROM public.purchase_orders             WHERE store_id = p_store_id;
    DELETE FROM public.production_order_items      WHERE order_id IN (SELECT id FROM public.production_orders WHERE store_id = p_store_id);
    DELETE FROM public.production_orders           WHERE store_id = p_store_id;
    DELETE FROM public.physical_count_items        WHERE count_id IN (SELECT id FROM public.physical_counts WHERE store_id = p_store_id);
    DELETE FROM public.physical_counts             WHERE store_id = p_store_id;
    DELETE FROM public.issue_slip_items            WHERE slip_id IN (SELECT id FROM public.issue_slips WHERE store_id = p_store_id);
    DELETE FROM public.issue_slips                 WHERE store_id = p_store_id;
    DELETE FROM public.devolution_items            WHERE devolution_id IN (SELECT id FROM public.devolutions WHERE store_id = p_store_id);
    DELETE FROM public.devolutions                 WHERE store_id = p_store_id;
    DELETE FROM public.quotation_items             WHERE quotation_id IN (SELECT id FROM public.quotations WHERE store_id = p_store_id);
    DELETE FROM public.quotations                  WHERE store_id = p_store_id;
    DELETE FROM public.inventory_adjustment_items  WHERE adjustment_id IN (SELECT id FROM public.inventory_adjustments WHERE store_id = p_store_id);
    DELETE FROM public.product_variants            WHERE product_id IN (SELECT id FROM public.products WHERE store_id = p_store_id);
    DELETE FROM public.commission_rule_products    WHERE rule_id IN (SELECT id FROM public.commission_rules WHERE store_id = p_store_id);
    DELETE FROM public.kardex_entries              WHERE store_id = p_store_id;
    DELETE FROM public.stock_movements             WHERE store_id = p_store_id;
    DELETE FROM public.inventory_movements         WHERE product_id IN (SELECT id FROM public.products WHERE store_id = p_store_id);
    DELETE FROM public.inventory                   WHERE store_id = p_store_id;
    DELETE FROM public.warehouse_stock             WHERE store_id = p_store_id;
    DELETE FROM public.warehouses                  WHERE store_id = p_store_id;
    DELETE FROM public.product_lots                WHERE store_id = p_store_id;
    DELETE FROM public.product_cost_sheets         WHERE store_id = p_store_id;
    DELETE FROM public.ofertas                     WHERE store_id = p_store_id;
    DELETE FROM public.price_change_history        WHERE store_id = p_store_id;
    DELETE FROM public.price_commit_log            WHERE store_id = p_store_id;
    DELETE FROM public.abc_classifications         WHERE store_id = p_store_id;
    DELETE FROM public.categories                  WHERE store_id = p_store_id;
    DELETE FROM public.customers                   WHERE store_id = p_store_id;
    DELETE FROM public.suppliers                   WHERE store_id = p_store_id;
    DELETE FROM public.workers                     WHERE store_id = p_store_id;
    DELETE FROM public.service_types               WHERE store_id = p_store_id;
    DELETE FROM public.received_services           WHERE store_id = p_store_id;
    DELETE FROM public.document_sequences          WHERE store_id = p_store_id;
    DELETE FROM public.tax_configurations          WHERE store_id = p_store_id;
    DELETE FROM public.store_cost_templates        WHERE store_id = p_store_id;
    DELETE FROM public.store_exchange_rates        WHERE store_id = p_store_id;
    DELETE FROM public.store_notifications         WHERE store_id = p_store_id;
    DELETE FROM public.store_reset_snapshots       WHERE store_id = p_store_id;
    DELETE FROM public.restore_sessions            WHERE store_id = p_store_id;
    DELETE FROM public.saved_analytics_views       WHERE store_id = p_store_id;
    DELETE FROM public.user_store_memberships      WHERE store_id = p_store_id;
    DELETE FROM public.user_invitations            WHERE store_id = p_store_id;
    DELETE FROM public.telegram_configs            WHERE store_id = p_store_id;
    DELETE FROM public.telegram_contacts           WHERE store_id = p_store_id;
    DELETE FROM public.telegram_invitations        WHERE store_id = p_store_id;
    DELETE FROM public.telegram_messages           WHERE store_id = p_store_id;
    DELETE FROM public.telegram_product_posts      WHERE store_id = p_store_id;
    DELETE FROM public.whatsapp_configs            WHERE store_id = p_store_id;
    DELETE FROM public.whatsapp_contacts           WHERE store_id = p_store_id;
    DELETE FROM public.whatsapp_invitations        WHERE store_id = p_store_id;
    DELETE FROM public.whatsapp_messages           WHERE store_id = p_store_id;
    DELETE FROM public.whatsapp_product_posts      WHERE store_id = p_store_id;
    DELETE FROM public.whatsapp_risk_state         WHERE store_id = p_store_id;
    DELETE FROM public.inventory_reservations      WHERE store_id = p_store_id;
    DELETE FROM public.inventory_snapshots         WHERE store_id = p_store_id;
    DELETE FROM public.products                    WHERE store_id = p_store_id;
    DELETE FROM public.bank_statements             WHERE store_id = p_store_id;
    DELETE FROM public.audit_logs                  WHERE store_id = p_store_id;
    DELETE FROM public.stores                      WHERE id = p_store_id;

    IF NOT FOUND THEN
      RETURN false;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Re-habilitar triggers antes de propagar el error (nunca dejar el
    -- esquema con triggers deshabilitados)
    FOR r IN SELECT table_name, trg_name FROM _e2e_disabled_triggers LOOP
      BEGIN EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', r.table_name, r.trg_name); EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
    RAISE;
  END;

  -- ── Re-habilitar triggers ──────────────────────────────────────────────
  FOR r IN SELECT table_name, trg_name FROM _e2e_disabled_triggers LOOP
    BEGIN EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', r.table_name, r.trg_name); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  RETURN true;
END;
$function$;
-- Restaurar e2e_hard_delete_user (definición previa exacta)
CREATE OR REPLACE FUNCTION public.e2e_hard_delete_user(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_is_test boolean;
  r record;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RETURN false; -- ya no existe
  END IF;

  -- Serializar con la limpieza de tiendas (mismo lock family)
  PERFORM pg_advisory_xact_lock(918273645);

  -- ── Guarda: solo emails de test ────────────────────────────────────────
  v_is_test := v_email ~* '(@costpro\.test|@costpro-test\.|@costpro\.local|@fixture\.local|@fixture\.costpro|@audit\.costpro\.test|@test\.local|@example\.com|@anonymized\.local|@costpro\.loc$)'
            OR v_email ILIKE 'e2e80-%'
            OR v_email ILIKE 'e2e-%'
            OR v_email ILIKE 'e2e2-%'
            OR v_email ILIKE 'fase-d-%'
            OR v_email ILIKE 'esec-%'
            OR v_email ILIKE 'hot-test-%'
            OR v_email ILIKE 'fc.e2e.%'
            OR v_email ILIKE 'fc-access-e2e-%';
  IF NOT v_is_test THEN
    RAISE EXCEPTION 'E2E_HARD_DELETE_NOT_A_TEST_USER: % no es un email de test', v_email;
  END IF;

  -- ── Desactivar triggers user-level de las tablas afectadas ─────────────
  CREATE TEMP TABLE IF NOT EXISTS _e2e_disabled_triggers_u(table_name text, trg_name text) ON COMMIT DROP;
  DELETE FROM _e2e_disabled_triggers_u WHERE true;

  -- Deshabilitado efectivo (loop correcto)
  FOR r IN
    SELECT n.nspname AS sch, cl.relname AS tbl, t.tgname
    FROM pg_trigger t
    JOIN pg_class cl ON cl.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname IN ('public', 'auth')
      AND NOT t.tgisinternal
      AND cl.relname IN ('profiles', 'users')
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.%I DISABLE TRIGGER %I', r.sch, r.tbl, r.tgname);
      INSERT INTO _e2e_disabled_triggers_u VALUES (r.sch || '.' || r.tbl, r.tgname);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  BEGIN
    -- Bypass de trg_validate_payment_invariants: el trigger bloquea TODO
    -- DELETE de payment_transactions salvo current_user postgres/snapshot
    -- restorer + app.restore_mode='true'. SECURITY DEFINER corre como
    -- postgres (owner), así que el toggle LOCAL a la transacción basta.
    -- Patrón canónico: reset_store_data / restore_transaction_snapshot.
    PERFORM set_config('app.restore_mode', 'true', true);

    -- Datos user-scoped (mismo conjunto que e2e/fixtures/hard-cleanup.ts)
    DELETE FROM public.user_store_memberships WHERE user_id = p_user_id;
    DELETE FROM public.user_preferences       WHERE user_id = p_user_id;
    DELETE FROM public.user_usage             WHERE user_id = p_user_id;
    DELETE FROM public.user_progress          WHERE user_id = p_user_id;
    DELETE FROM public.user_strategy_feedback WHERE user_id = p_user_id;
    DELETE FROM public.saved_analytics_views  WHERE user_id = p_user_id;
    DELETE FROM public.ai_api_keys            WHERE user_id = p_user_id;
    DELETE FROM public.idempotency_keys       WHERE user_id = p_user_id;
    DELETE FROM public.bulk_ops_log           WHERE user_id = p_user_id;
    DELETE FROM public.pick3_profiles         WHERE user_id = p_user_id;
    DELETE FROM public.pick3_subscriptions    WHERE user_id = p_user_id;
    DELETE FROM public.pick3_usage            WHERE user_id = p_user_id;
    DELETE FROM public.pick3_user_plays       WHERE user_id = p_user_id;
    DELETE FROM public.wallet_accounts        WHERE user_id = p_user_id;
    DELETE FROM public.audit_logs             WHERE user_id = p_user_id;
    DELETE FROM public.cost_sheets            WHERE created_by = p_user_id;
    DELETE FROM public.cost_sheet_templates   WHERE created_by = p_user_id;
    DELETE FROM public.purchase_orders        WHERE created_by = p_user_id;
    DELETE FROM public.report_definitions     WHERE created_by = p_user_id;
    DELETE FROM public.report_runs            WHERE executed_by = p_user_id;
    DELETE FROM public.sync_log               WHERE user_id = p_user_id;
    DELETE FROM public.telegram_product_posts WHERE published_by = p_user_id;
    DELETE FROM public.whatsapp_product_posts WHERE published_by = p_user_id;
    DELETE FROM public.pick3_simulations      WHERE user_id = p_user_id;
    DELETE FROM public.inventory_movements    WHERE user_id = p_user_id;

    -- Cadena v2 (checkout V2): el RPC v1 solo cubría sales/sale_items (v1).
    -- Gap detectado en FASE 2 de e2e-incremental-stabilization: el usuario
    -- qa.h1.sup tenía ventas en transactions (v2) + payment_transactions +
    -- kardex_entries que bloqueaban el DELETE del profile/auth user con
    -- FK violations (23503).
    -- Orden: payment_transactions (FK RESTRICT a transactions) → items →
    -- transactions (seller_id) → kardex_entries.
    DELETE FROM public.payment_transactions
      WHERE paid_by = p_user_id
         OR transaction_id IN (SELECT id FROM public.transactions WHERE seller_id = p_user_id);
    DELETE FROM public.transaction_items
      WHERE transaction_id IN (SELECT id FROM public.transactions WHERE seller_id = p_user_id);
    DELETE FROM public.transactions WHERE seller_id = p_user_id;
    DELETE FROM public.kardex_entries WHERE created_by = p_user_id;

    DELETE FROM public.sale_items             WHERE sale_id IN (SELECT id FROM public.sales WHERE cashier_id = p_user_id);
    DELETE FROM public.sales                  WHERE cashier_id = p_user_id;

    -- Profile (hard delete — solo usuarios de TEST; ver guarda de email)
    DELETE FROM public.profiles WHERE id = p_user_id;

    -- Identidad Auth (auth-schema: hijos primero, FK internos CASCADE)
    DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
    DELETE FROM auth.sessions       WHERE user_id = p_user_id;
    DELETE FROM auth.identities     WHERE user_id = p_user_id;
    DELETE FROM auth.mfa_factors    WHERE user_id = p_user_id;
    DELETE FROM auth.users          WHERE id = p_user_id;

    IF NOT FOUND THEN
      RETURN false;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    FOR r IN SELECT table_name, trg_name FROM _e2e_disabled_triggers_u LOOP
      BEGIN
        EXECUTE format('ALTER TABLE %s ENABLE TRIGGER %I', r.table_name, r.trg_name);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;
    RAISE;
  END;

  -- Re-habilitar triggers
  FOR r IN SELECT table_name, trg_name FROM _e2e_disabled_triggers_u LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE TRIGGER %I', r.table_name, r.trg_name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  RETURN true;
END;
$function$;

-- Restaurar grants: PUBLIC tiene EXECUTE por defecto donde proacl era NULL;
-- para el resto, grants explícitos previos según volcado.
GRANT EXECUTE ON FUNCTION public.e2e_hard_delete_store TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.e2e_hard_delete_user TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.is_admin_with_access TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.adjust_total_amount TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.bulk_update_products TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.calculate_receipt_total_cup TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.calculate_service_distribution TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.can_admin_reverse_transaction TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.can_create_user_with_role TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.can_pos_undo_transaction TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.can_reverse_document TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.can_safely_delete_user TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.can_void_receipt TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.check_bulk_ops_hourly_limit TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.check_idempotency TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.check_tenant_store_quota TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.cleanup_expired_idempotency_keys TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.cleanup_old_aggregates TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.create_pre_restore_snapshot TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.create_purchase_order TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.detect_orphan_users TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.discover_backup_tables TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.ensure_fiscal_period TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.fn_log_system_health TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.fn_void_receipt TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.generate_confirmation_token TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.generate_internal_barcode TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.generate_inventory_snapshot TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_available_stock TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_backup_table_list TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_batch_store_daily_kpis TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_cash_closures TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_cash_shift_expected TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_current_user_store_id TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_daily_expenses_aggregated TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_daily_income_aggregated TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_global_max_operation_date TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_inventory_report TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_inventory_report TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_inventory_with_costs TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_low_stock_count TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_new_academy_cards TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_or_create_product_cost_sheet TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_paginated_products TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_product_cost_analysis TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_product_stock_ledger TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_product_stock_ledger_paginated TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_product_variants_counts TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_products_for_reception TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_profit_report TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_purchases_book TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_sales_book TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_sales_since_last_closure TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_store_analytics_advanced TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_table_writable_columns TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_tax_report TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_transfers TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_usage_forecast TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_usage_summary TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_user_audit_history TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.get_worker_commission_summary TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.has_management_access_as TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.has_role TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.has_store_access_as TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.has_store_role_as TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.increment_user_usage TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.is_admin_check TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.is_role_not_changed TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.is_tenant_member TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.mark_expired_lots TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.next_document_number TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.process_inventory_adjustment TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.process_pick3_transaction TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.process_stock_adjustment TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.purge_old_reset_snapshots TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.receive_against_po TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.receive_production_output_deprecated_4arg TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.register_idempotency TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.register_stock_movement TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.register_supplier_payment TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.regularize_sale_payment TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.release_expired_reservations TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.restore_transaction_snapshot TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.save_product_cost_sheet TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.sync_inventory_from_products TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.transfer_requires_approval TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.update_transaction_taxes TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.upsert_manual_exchange_rate_with_audit TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.upsert_store_cost_template TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.upsert_usage_aggregate TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.validate_backup_registry_drift TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.validate_operation_date TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.validate_post_restore TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.validate_pre_restore_fk_integrity TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.validate_store_can_be_modified TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.validate_tenant_access TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.validate_transfer_operation_date TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.verify_audit_chain TO PUBLIC, anon;  -- acl explícita previa
GRANT EXECUTE ON FUNCTION public.void_reception_with_reversal TO PUBLIC, anon;  -- acl explícita previa

-- Quitar los GRANT explícitos a authenticated añadidos por la migración

COMMIT;
