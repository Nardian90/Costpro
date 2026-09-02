DO $guard$
DECLARE
  v_cnt int;
  v_oid oid;
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
    RAISE EXCEPTION 'W9-F06 GUARD: estado W9.2 de reset_store_data alterado (%)', v_cnt;
  END IF;

  -- 2) W9.3 intacto: cero tablas public con RLS OFF
  SELECT count(*) INTO v_cnt
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'W9-F06 GUARD: RLS OFF en % tablas public (W9.3 alterado)', v_cnt;
  END IF;

  -- 3) Estado PRE de exposición global (detección de deriva)
  SELECT count(*) INTO v_cnt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_cnt <> 65 THEN
    RAISE EXCEPTION 'W9-F06 GUARD: SD ejecutables por anon = % (esperado 65)', v_cnt;
  END IF;

  SELECT count(*) INTO v_cnt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_cnt <> 222 THEN
    RAISE EXCEPTION 'W9-F06 GUARD: SD expuestas = % (esperado 222)', v_cnt;
  END IF;

  -- 4) Las 119 candidatas: firma completa, owner postgres, SECURITY DEFINER,
  --    exposición PRE exacta (PUBLIC/anon/authenticated) y service_role OK
  -- patrón PRE: PUBLIC=no anon=no auth=sí (79 fns)
  FOR r IN SELECT * FROM (VALUES
    ('apply_physical_count', 'p_count_id uuid, p_user_id uuid, p_apply_zero_diffs boolean', false, false, true),
    ('approve_transfer', 'p_transfer_id uuid, p_user_id uuid', false, false, true),
    ('audit_backup_restore_protected_change', '', false, false, true),
    ('audit_product_changes', '', false, false, true),
    ('audit_profile_changes', '', false, false, true),
    ('audit_role_changes', '', false, false, true),
    ('audit_store_access_changes', '', false, false, true),
    ('audit_store_changes', '', false, false, true),
    ('auto_kardex_on_stock_movement', '', false, false, true),
    ('can_create_user_with_role', 'p_creator_id uuid, p_role_name text', false, false, true),
    ('can_safely_delete_user', 'p_user_id uuid', false, false, true),
    ('can_void_receipt', 'p_receipt_id uuid', false, false, true),
    ('cancel_reception', 'p_reception_id uuid', false, false, true),
    ('cleanup_expired_idempotency_keys', '', false, false, true),
    ('compensate_inventory_error', 'p_store_id uuid, p_original_movement_id uuid, p_reason text, p_user_id uuid', false, false, true),
    ('create_physical_count', 'p_store_id uuid, p_user_id uuid, p_notes text', false, false, true),
    ('create_pre_restore_snapshot', 'p_store_id uuid', false, false, true),
    ('create_vale_salida', 'p_store_id uuid, p_items jsonb, p_production_order_id uuid, p_notes text, p_idempotency_key text', false, false, true),
    ('create_vale_salida', 'p_store_id uuid, p_items jsonb, p_production_order_id uuid, p_notes text, p_idempotency_key text, p_user_id uuid', false, false, true),
    ('deduct_stock', 'p_store_id uuid, p_product_id uuid, p_quantity numeric', false, false, true),
    ('ensure_fiscal_period', 'p_store_id uuid, p_year integer, p_month integer', false, false, true),
    ('fn_log_system_health', 'p_payload jsonb', false, false, true),
    ('fn_process_receipt', 'p_items jsonb, p_user_id uuid, p_reference text', false, false, true),
    ('fn_process_receipt', 'p_items jsonb, p_user_id uuid, p_store_id uuid, p_reference text', false, false, true),
    ('fn_process_sale', 'p_items jsonb, p_cashier_id uuid, p_payment_method text', false, false, true),
    ('fn_sync_inventory_on_movement', '', false, false, true),
    ('fn_void_receipt', 'p_receipt_id uuid, p_user_id uuid', false, false, true),
    ('generate_confirmation_token', 'p_session_id uuid', false, false, true),
    ('generate_inventory_snapshot', 'p_store_id uuid', false, false, true),
    ('get_ai_api_key', 'p_user_id uuid, p_provider text', false, false, true),
    ('get_available_stock', 'p_store_id uuid, p_product_id uuid', false, false, true),
    ('get_inventory_report', 'p_from_date timestamp with time zone, p_to_date timestamp with time zone', false, false, true),
    ('get_inventory_report', 'p_store_id uuid, p_from_date timestamp with time zone, p_to_date timestamp with time zone', false, false, true),
    ('get_inventory_with_costs', 'p_store_id uuid', false, false, true),
    ('get_my_sales', 'p_search_query text, p_status text, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_min_amount numeric, p_max_amount numeric, p_sort_column text, p_sort_direction text, p_limit integer, p_offset integer', false, false, true),
    ('get_my_sales', 'p_search_query text, p_status text, p_payment_method text, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_min_amount numeric, p_max_amount numeric, p_sort_column text, p_sort_direction text, p_limit integer, p_offset integer', false, false, true),
    ('get_my_sales_summary', 'p_period text', false, false, true),
    ('get_or_create_product_cost_sheet', 'p_product_id uuid, p_store_id uuid, p_template_id text, p_modalidad text, p_pdf_format text', false, false, true),
    ('get_product_stock_ledger', 'p_product_id uuid, p_store_id uuid', false, false, true),
    ('get_product_variants_counts', '', false, false, true),
    ('get_transactions_with_profit', 'p_store_id uuid, p_search_term text, p_date_from timestamp without time zone, p_date_to timestamp without time zone, p_limit integer', false, false, true),
    ('get_usage_forecast', '', false, false, true),
    ('get_user_role', '', false, false, true),
    ('has_store_access_as', 'p_user_id uuid, p_store_id uuid', false, false, true),
    ('is_admin_check', 'p_user_id uuid', false, false, true),
    ('is_manager_of_store', 'p_store_id uuid', false, false, true),
    ('is_role_not_changed', 'p_user_id uuid, p_new_role user_role, p_new_role_id uuid', false, false, true),
    ('is_store_manager', 'p_store_id uuid', false, false, true),
    ('is_user_creator', 'p_target_user_id uuid', false, false, true),
    ('log_audit_event', 'p_action text, p_payload jsonb, p_store_id uuid', false, false, true),
    ('log_transaction_changes', '', false, false, true),
    ('managed_create_store', 'p_name text, p_address text', false, false, true),
    ('managed_create_user', 'p_max_users integer, p_max_stores integer, p_role text, p_full_name text, p_email text, p_creator_id uuid, p_target_user_id uuid, p_store_id uuid, p_memberships jsonb', false, false, true),
    ('managed_delete_user', 'p_user_id uuid', false, false, true),
    ('mark_expired_lots', 'p_store_id uuid', false, false, true),
    ('on_auth_user_created', '', false, false, true),
    ('on_pick3_profile_initial_bankroll', '', false, false, true),
    ('prevent_direct_inventory_modification', '', false, false, true),
    ('process_stock_adjustment', 'p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_operation_date timestamp with time zone', false, false, true),
    ('reconcile_stock', 'p_store_id uuid, p_fix boolean, p_user_id uuid', false, false, true),
    ('record_counted_quantity', 'p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid, p_notes text', false, false, true),
    ('record_sale_movement', 'p_store_id uuid, p_product_id uuid, p_variant_id uuid, p_quantity integer, p_reference text', false, false, true),
    ('reject_transfer', 'p_transfer_id uuid, p_reason text, p_user_id uuid', false, false, true),
    ('reverse_vale_salida', 'p_slip_id uuid, p_reason text, p_user_id uuid', false, false, true),
    ('save_ai_api_key', 'p_provider text, p_api_key text, p_label text', false, false, true),
    ('set_transfer_approval_rule', 'p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric, p_threshold_quantity numeric, p_approver_roles text[], p_is_active boolean, p_user_id uuid', false, false, true),
    ('snapshot_commission_rule', '', false, false, true),
    ('sync_inventory_from_products', 'p_store_id uuid', false, false, true),
    ('sync_product_has_movements', '', false, false, true),
    ('sync_product_stock', '', false, false, true),
    ('touch_updated_at', '', false, false, true),
    ('transfer_requires_approval', 'p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb', false, false, true),
    ('upsert_store_cost_template', 'p_store_id uuid, p_template_id text, p_template_data jsonb, p_modalidad text, p_pdf_format text, p_created_by uuid', false, false, true),
    ('validate_active_store', '', false, false, true),
    ('validate_backup_registry_drift', '', false, false, true),
    ('validate_post_restore', 'p_store_id uuid, p_backup_payload jsonb', false, false, true),
    ('validate_transfer_operation_date', 'p_new_date timestamp with time zone, p_origin_store_id uuid, p_destination_store_id uuid', false, false, true),
    ('verify_audit_chain', '', false, false, true),
    ('withdraw_production_item_v3', 'p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text, p_reference_id uuid, p_reference_doc text', false, false, true)
  ) AS t(fn, args, epub, eanon, eauth) LOOP
    -- eanon/eauth = privilegio efectivo (entrada explícita O herencia de PUBLIC)
    SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname = r.fn
      AND lower(regexp_replace(pg_get_function_identity_arguments(p.oid), '\s+', ' ', 'g'))
          = lower(regexp_replace(r.args, '\s+', ' ', 'g'));
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'W9-F06 GUARD: candidata no encontrada: %(%)', r.fn, r.args;
    END IF;
    SELECT count(*) INTO v_cnt FROM pg_proc p
    WHERE p.oid = v_oid AND p.prosecdef
      AND p.proowner = 'postgres'::regrole
      AND has_function_privilege('public', p.oid, 'EXECUTE') = r.epub
      AND has_function_privilege('anon', p.oid, 'EXECUTE') = r.eanon
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE') = r.eauth
      AND has_function_privilege('service_role', p.oid, 'EXECUTE');
    IF v_cnt <> 1 THEN
      RAISE EXCEPTION 'W9-F06 GUARD: estado PRE inesperado para %(%)', r.fn, r.args;
    END IF;
  END LOOP;

  -- patrón PRE: PUBLIC=sí anon=no auth=sí (24 fns)
  FOR r IN SELECT * FROM (VALUES
    ('calculate_receipt_total_cup', 'p_receipt_id uuid', true, true, true),
    ('check_tenant_store_quota', 'p_tenant_id uuid, p_plan plan_t', true, true, true),
    ('close_cash_shift', 'p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_notes text, p_user_id uuid', true, true, true),
    ('create_store_with_membership', 'p_name text, p_address text, p_created_by uuid, p_max_stores integer, p_logo_url text, p_reeup text, p_nit text, p_bank_account text, p_phone text, p_email text, p_slug text, p_plantilla text, p_signature_url text, p_stamp_url text, p_latitude double precision, p_longitude double precision, p_tenant_id uuid', true, true, true),
    ('detect_orphan_users', '', true, true, true),
    ('get_purchases_book', 'p_store_id uuid, p_year integer, p_month integer', true, true, true),
    ('get_sales_book', 'p_store_id uuid, p_year integer, p_month integer', true, true, true),
    ('get_tax_report', 'p_store_id uuid, p_year integer, p_month integer', true, true, true),
    ('get_tenant_cash_report', 'p_tenant_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone', true, true, true),
    ('get_tenant_sales_summary', 'p_tenant_id uuid, p_days integer', true, true, true),
    ('get_user_audit_history', 'p_user_id uuid, p_limit integer, p_offset integer', true, true, true),
    ('managed_create_user_v2', 'p_email text, p_full_name text, p_role user_role, p_plan plan_t, p_store_id uuid, p_memberships jsonb, p_max_stores integer, p_max_users integer, p_target_user_id uuid, p_creator_id uuid', true, true, true),
    ('managed_reset_password', 'p_user_id uuid, p_caller_id uuid', true, true, true),
    ('managed_revoke_membership', 'p_membership_id uuid, p_caller_id uuid', true, true, true),
    ('managed_soft_delete_user', 'p_user_id uuid, p_reason text, p_caller_id uuid', true, true, true),
    ('managed_toggle_user_status', 'p_user_id uuid, p_is_active boolean, p_caller_id uuid', true, true, true),
    ('managed_update_membership', 'p_membership_id uuid, p_role user_role, p_status text, p_caller_id uuid', true, true, true),
    ('managed_update_tenant_plan', 'p_tenant_id uuid, p_plan plan_t, p_subscription_status text, p_caller_id uuid', true, true, true),
    ('managed_update_user', 'p_user_id uuid, p_full_name text, p_role user_role, p_role_id uuid, p_is_active boolean, p_max_stores_limit integer, p_max_users_limit integer, p_plan plan_t, p_caller_id uuid', true, true, true),
    ('reconcile_orphan_user', 'p_auth_user_id uuid, p_action text, p_reason text, p_caller_id uuid', true, true, true),
    ('reopen_cash_shift', 'p_closure_id uuid, p_reason text, p_user_id uuid', true, true, true),
    ('update_receipt_item_tasa', 'p_receipt_item_id uuid, p_new_tasa_cambio_recepcion numeric, p_new_moneda_recepcion text, p_motivo text, p_user_id uuid', true, true, true),
    ('validate_operation_date', 'p_new_date timestamp with time zone, p_store_id uuid', true, true, true),
    ('validate_tenant_access', 'p_user_id uuid, p_store_id uuid', true, true, true)
  ) AS t(fn, args, epub, eanon, eauth) LOOP
    -- eanon/eauth = privilegio efectivo (entrada explícita O herencia de PUBLIC)
    SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname = r.fn
      AND lower(regexp_replace(pg_get_function_identity_arguments(p.oid), '\s+', ' ', 'g'))
          = lower(regexp_replace(r.args, '\s+', ' ', 'g'));
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'W9-F06 GUARD: candidata no encontrada: %(%)', r.fn, r.args;
    END IF;
    SELECT count(*) INTO v_cnt FROM pg_proc p
    WHERE p.oid = v_oid AND p.prosecdef
      AND p.proowner = 'postgres'::regrole
      AND has_function_privilege('public', p.oid, 'EXECUTE') = r.epub
      AND has_function_privilege('anon', p.oid, 'EXECUTE') = r.eanon
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE') = r.eauth
      AND has_function_privilege('service_role', p.oid, 'EXECUTE');
    IF v_cnt <> 1 THEN
      RAISE EXCEPTION 'W9-F06 GUARD: estado PRE inesperado para %(%)', r.fn, r.args;
    END IF;
  END LOOP;

  -- patrón PRE: PUBLIC=sí anon=sí auth=sí (15 fns)
  FOR r IN SELECT * FROM (VALUES
    ('audit_cash_closures_changes', '', true, true, true),
    ('audit_commission_payments_changes', '', true, true, true),
    ('audit_fiscal_closings_changes', '', true, true, true),
    ('audit_payment_transactions_changes', '', true, true, true),
    ('bulk_update_products', '_products jsonb', true, true, true),
    ('close_service_order_as_sale', 'p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid', true, true, true),
    ('enforce_ledger_append_only', '', true, true, true),
    ('ensure_product_barcode', '', true, true, true),
    ('generate_internal_barcode', '', true, true, true),
    ('has_management_access_as', 'p_user_id uuid, p_store_id uuid', true, true, true),
    ('link_receipts_to_service', 'p_service_id uuid, p_receipt_ids jsonb, p_user_id uuid', true, true, true),
    ('prevent_received_service_edit', '', true, true, true),
    ('register_idempotency', 'p_key text, p_operation text, p_record_id uuid, p_param_hash text, p_result jsonb', true, true, true),
    ('release_expired_reservations', '', true, true, true),
    ('reverse_commissions_on_sale_void', '', true, true, true)
  ) AS t(fn, args, epub, eanon, eauth) LOOP
    -- eanon/eauth = privilegio efectivo (entrada explícita O herencia de PUBLIC)
    SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname = r.fn
      AND lower(regexp_replace(pg_get_function_identity_arguments(p.oid), '\s+', ' ', 'g'))
          = lower(regexp_replace(r.args, '\s+', ' ', 'g'));
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'W9-F06 GUARD: candidata no encontrada: %(%)', r.fn, r.args;
    END IF;
    SELECT count(*) INTO v_cnt FROM pg_proc p
    WHERE p.oid = v_oid AND p.prosecdef
      AND p.proowner = 'postgres'::regrole
      AND has_function_privilege('public', p.oid, 'EXECUTE') = r.epub
      AND has_function_privilege('anon', p.oid, 'EXECUTE') = r.eanon
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE') = r.eauth
      AND has_function_privilege('service_role', p.oid, 'EXECUTE');
    IF v_cnt <> 1 THEN
      RAISE EXCEPTION 'W9-F06 GUARD: estado PRE inesperado para %(%)', r.fn, r.args;
    END IF;
  END LOOP;

  -- patrón PRE: PUBLIC=no anon=no auth=sí extra=costpro_snapshot_restorer (1 fns)
  FOR r IN SELECT * FROM (VALUES
    ('validate_pre_restore_fk_integrity', 'p_store_id uuid', false, false, true)
  ) AS t(fn, args, epub, eanon, eauth) LOOP
    -- eanon/eauth = privilegio efectivo (entrada explícita O herencia de PUBLIC)
    SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname = r.fn
      AND lower(regexp_replace(pg_get_function_identity_arguments(p.oid), '\s+', ' ', 'g'))
          = lower(regexp_replace(r.args, '\s+', ' ', 'g'));
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'W9-F06 GUARD: candidata no encontrada: %(%)', r.fn, r.args;
    END IF;
    SELECT count(*) INTO v_cnt FROM pg_proc p
    WHERE p.oid = v_oid AND p.prosecdef
      AND p.proowner = 'postgres'::regrole
      AND has_function_privilege('public', p.oid, 'EXECUTE') = r.epub
      AND has_function_privilege('anon', p.oid, 'EXECUTE') = r.eanon
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE') = r.eauth
      AND has_function_privilege('service_role', p.oid, 'EXECUTE');
    IF v_cnt <> 1 THEN
      RAISE EXCEPTION 'W9-F06 GUARD: estado PRE inesperado para %(%)', r.fn, r.args;
    END IF;
  END LOOP;

END
$guard$;
