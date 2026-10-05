-- E2E DATA HYGIENE (chore/e2e-data-hygiene) — FASE 11/12
-- ============================================================================
-- Helper de infraestructura de testing (NO es lógica de negocio):
-- hard-delete seguro de una tienda de PRUEBA y todos sus datos asociados.
--
-- POR QUÉ EXISTE:
--   El cleanup E2E histórico era soft (archive) y el endpoint productivo
--   DELETE /api/stores también lo es (correcto para negocio real). Eso
--   acumuló 2600+ tiendas residuales. Los triggers de integridad fiscal
--   (prevent_z_report_edit, prevent_fiscal_closing_edit,
--   prevent_cash_closure_edit, ERR_PAYMENT_DELETE_FORBIDDEN) impiden borrar
--   por REST las filas fiscales de una tienda de prueba.
--
-- MECANISMO:
--   Desactiva temporalmente SOLO los triggers user-level de las tablas
--   afectadas (los triggers internos de RI/FK/CASCADE siguen activos, por lo
--   que la integridad referencial se mantiene) y re-habilita todo al final
--   — incluso ante error (bloque EXCEPTION).
--
-- GARANTÍAS:
--   1. Niega tiendas protegidas (ids explícitos) — FASE 18 aislamiento.
--   2. Niega tiendas cuyo nombre NO sea artefacto de test.
--   3. SECURITY DEFINER + search_path fijado.
--   4. Borra en orden dependiente (hijos FK NO ACTION/RESTRICT primero).
--   5. Idempotente: re-ejecutar sobre una tienda ya borrada devuelve FALSE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.e2e_hard_delete_store(p_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
$fn$;

-- service_role puede ejecutarlo; anon/authenticated NO.
REVOKE ALL ON FUNCTION public.e2e_hard_delete_store(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_hard_delete_store(uuid) TO service_role;
