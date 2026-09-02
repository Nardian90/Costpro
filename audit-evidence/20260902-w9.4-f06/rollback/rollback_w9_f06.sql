-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK W9-F06.1 — restitución 1:1 de los EXECUTE revocados
-- Uso: SOLO con orden explícita del usuario. Espejo exacto del PRE capturado
-- en w9-readiness/evidence/f06/pre/ (b02_acl_expanded.json).
-- Nota física: en las 119 el proacl PRE ya era explícito, por lo que esta
-- restitución es textualmente idéntica al estado PRE.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- public.apply_physical_count(p_count_id uuid, p_user_id uuid, p_apply_zero_diffs boolean)
GRANT EXECUTE ON FUNCTION public.apply_physical_count(p_count_id uuid, p_user_id uuid, p_apply_zero_diffs boolean) TO authenticated;
-- public.approve_transfer(p_transfer_id uuid, p_user_id uuid)
GRANT EXECUTE ON FUNCTION public.approve_transfer(p_transfer_id uuid, p_user_id uuid) TO authenticated;
-- public.audit_backup_restore_protected_change()
GRANT EXECUTE ON FUNCTION public.audit_backup_restore_protected_change() TO authenticated;
-- public.audit_cash_closures_changes()
GRANT EXECUTE ON FUNCTION public.audit_cash_closures_changes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_cash_closures_changes() TO anon;
GRANT EXECUTE ON FUNCTION public.audit_cash_closures_changes() TO PUBLIC;
-- public.audit_commission_payments_changes()
GRANT EXECUTE ON FUNCTION public.audit_commission_payments_changes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_commission_payments_changes() TO anon;
GRANT EXECUTE ON FUNCTION public.audit_commission_payments_changes() TO PUBLIC;
-- public.audit_fiscal_closings_changes()
GRANT EXECUTE ON FUNCTION public.audit_fiscal_closings_changes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_fiscal_closings_changes() TO anon;
GRANT EXECUTE ON FUNCTION public.audit_fiscal_closings_changes() TO PUBLIC;
-- public.audit_payment_transactions_changes()
GRANT EXECUTE ON FUNCTION public.audit_payment_transactions_changes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_payment_transactions_changes() TO anon;
GRANT EXECUTE ON FUNCTION public.audit_payment_transactions_changes() TO PUBLIC;
-- public.audit_product_changes()
GRANT EXECUTE ON FUNCTION public.audit_product_changes() TO authenticated;
-- public.audit_profile_changes()
GRANT EXECUTE ON FUNCTION public.audit_profile_changes() TO authenticated;
-- public.audit_role_changes()
GRANT EXECUTE ON FUNCTION public.audit_role_changes() TO authenticated;
-- public.audit_store_access_changes()
GRANT EXECUTE ON FUNCTION public.audit_store_access_changes() TO authenticated;
-- public.audit_store_changes()
GRANT EXECUTE ON FUNCTION public.audit_store_changes() TO authenticated;
-- public.auto_kardex_on_stock_movement()
GRANT EXECUTE ON FUNCTION public.auto_kardex_on_stock_movement() TO authenticated;
-- public.bulk_update_products(_products jsonb)
GRANT EXECUTE ON FUNCTION public.bulk_update_products(_products jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_products(_products jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_products(_products jsonb) TO PUBLIC;
-- public.calculate_receipt_total_cup(p_receipt_id uuid)
GRANT EXECUTE ON FUNCTION public.calculate_receipt_total_cup(p_receipt_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_receipt_total_cup(p_receipt_id uuid) TO PUBLIC;
-- public.can_create_user_with_role(p_creator_id uuid, p_role_name text)
GRANT EXECUTE ON FUNCTION public.can_create_user_with_role(p_creator_id uuid, p_role_name text) TO authenticated;
-- public.can_safely_delete_user(p_user_id uuid)
GRANT EXECUTE ON FUNCTION public.can_safely_delete_user(p_user_id uuid) TO authenticated;
-- public.can_void_receipt(p_receipt_id uuid)
GRANT EXECUTE ON FUNCTION public.can_void_receipt(p_receipt_id uuid) TO authenticated;
-- public.cancel_reception(p_reception_id uuid)
GRANT EXECUTE ON FUNCTION public.cancel_reception(p_reception_id uuid) TO authenticated;
-- public.check_tenant_store_quota(p_tenant_id uuid, p_plan plan_t)
GRANT EXECUTE ON FUNCTION public.check_tenant_store_quota(p_tenant_id uuid, p_plan plan_t) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_tenant_store_quota(p_tenant_id uuid, p_plan plan_t) TO PUBLIC;
-- public.cleanup_expired_idempotency_keys()
GRANT EXECUTE ON FUNCTION public.cleanup_expired_idempotency_keys() TO authenticated;
-- public.close_cash_shift(p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_notes text, p_user_id uuid)
GRANT EXECUTE ON FUNCTION public.close_cash_shift(p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_notes text, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_shift(p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_notes text, p_user_id uuid) TO PUBLIC;
-- public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid)
GRANT EXECUTE ON FUNCTION public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid) TO PUBLIC;
-- public.compensate_inventory_error(p_store_id uuid, p_original_movement_id uuid, p_reason text, p_user_id uuid)
GRANT EXECUTE ON FUNCTION public.compensate_inventory_error(p_store_id uuid, p_original_movement_id uuid, p_reason text, p_user_id uuid) TO authenticated;
-- public.create_physical_count(p_store_id uuid, p_user_id uuid, p_notes text)
GRANT EXECUTE ON FUNCTION public.create_physical_count(p_store_id uuid, p_user_id uuid, p_notes text) TO authenticated;
-- public.create_pre_restore_snapshot(p_store_id uuid)
GRANT EXECUTE ON FUNCTION public.create_pre_restore_snapshot(p_store_id uuid) TO authenticated;
-- public.create_store_with_membership(p_name text, p_address text, p_created_by uuid, p_max_stores integer, p_logo_url text, p_reeup text, p_nit text, p_bank_account text, p_phone text, p_email text, p_slug text, p_plantilla text, p_signature_url text, p_stamp_url text, p_latitude double precision, p_longitude double precision, p_tenant_id uuid)
GRANT EXECUTE ON FUNCTION public.create_store_with_membership(p_name text, p_address text, p_created_by uuid, p_max_stores integer, p_logo_url text, p_reeup text, p_nit text, p_bank_account text, p_phone text, p_email text, p_slug text, p_plantilla text, p_signature_url text, p_stamp_url text, p_latitude double precision, p_longitude double precision, p_tenant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_store_with_membership(p_name text, p_address text, p_created_by uuid, p_max_stores integer, p_logo_url text, p_reeup text, p_nit text, p_bank_account text, p_phone text, p_email text, p_slug text, p_plantilla text, p_signature_url text, p_stamp_url text, p_latitude double precision, p_longitude double precision, p_tenant_id uuid) TO PUBLIC;
-- public.create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid, p_notes text, p_idempotency_key text)
GRANT EXECUTE ON FUNCTION public.create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid, p_notes text, p_idempotency_key text) TO authenticated;
-- public.create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid, p_notes text, p_idempotency_key text, p_user_id uuid)
GRANT EXECUTE ON FUNCTION public.create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid, p_notes text, p_idempotency_key text, p_user_id uuid) TO authenticated;
-- public.deduct_stock(p_store_id uuid, p_product_id uuid, p_quantity numeric)
GRANT EXECUTE ON FUNCTION public.deduct_stock(p_store_id uuid, p_product_id uuid, p_quantity numeric) TO authenticated;
-- public.detect_orphan_users()
GRANT EXECUTE ON FUNCTION public.detect_orphan_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_orphan_users() TO PUBLIC;
-- public.enforce_ledger_append_only()
GRANT EXECUTE ON FUNCTION public.enforce_ledger_append_only() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_ledger_append_only() TO anon;
GRANT EXECUTE ON FUNCTION public.enforce_ledger_append_only() TO PUBLIC;
-- public.ensure_fiscal_period(p_store_id uuid, p_year integer, p_month integer)
GRANT EXECUTE ON FUNCTION public.ensure_fiscal_period(p_store_id uuid, p_year integer, p_month integer) TO authenticated;
-- public.ensure_product_barcode()
GRANT EXECUTE ON FUNCTION public.ensure_product_barcode() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_product_barcode() TO anon;
GRANT EXECUTE ON FUNCTION public.ensure_product_barcode() TO PUBLIC;
-- public.fn_log_system_health(p_payload jsonb)
GRANT EXECUTE ON FUNCTION public.fn_log_system_health(p_payload jsonb) TO authenticated;
-- public.fn_process_receipt(p_items jsonb, p_user_id uuid, p_reference text)
GRANT EXECUTE ON FUNCTION public.fn_process_receipt(p_items jsonb, p_user_id uuid, p_reference text) TO authenticated;
-- public.fn_process_receipt(p_items jsonb, p_user_id uuid, p_store_id uuid, p_reference text)
GRANT EXECUTE ON FUNCTION public.fn_process_receipt(p_items jsonb, p_user_id uuid, p_store_id uuid, p_reference text) TO authenticated;
-- public.fn_process_sale(p_items jsonb, p_cashier_id uuid, p_payment_method text)
GRANT EXECUTE ON FUNCTION public.fn_process_sale(p_items jsonb, p_cashier_id uuid, p_payment_method text) TO authenticated;
-- public.fn_sync_inventory_on_movement()
GRANT EXECUTE ON FUNCTION public.fn_sync_inventory_on_movement() TO authenticated;
-- public.fn_void_receipt(p_receipt_id uuid, p_user_id uuid)
GRANT EXECUTE ON FUNCTION public.fn_void_receipt(p_receipt_id uuid, p_user_id uuid) TO authenticated;
-- public.generate_confirmation_token(p_session_id uuid)
GRANT EXECUTE ON FUNCTION public.generate_confirmation_token(p_session_id uuid) TO authenticated;
-- public.generate_internal_barcode()
GRANT EXECUTE ON FUNCTION public.generate_internal_barcode() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_internal_barcode() TO anon;
GRANT EXECUTE ON FUNCTION public.generate_internal_barcode() TO PUBLIC;
-- public.generate_inventory_snapshot(p_store_id uuid)
GRANT EXECUTE ON FUNCTION public.generate_inventory_snapshot(p_store_id uuid) TO authenticated;
-- public.get_ai_api_key(p_user_id uuid, p_provider text)
GRANT EXECUTE ON FUNCTION public.get_ai_api_key(p_user_id uuid, p_provider text) TO authenticated;
-- public.get_available_stock(p_store_id uuid, p_product_id uuid)
GRANT EXECUTE ON FUNCTION public.get_available_stock(p_store_id uuid, p_product_id uuid) TO authenticated;
-- public.get_inventory_report(p_from_date timestamp with time zone, p_to_date timestamp with time zone)
GRANT EXECUTE ON FUNCTION public.get_inventory_report(p_from_date timestamp with time zone, p_to_date timestamp with time zone) TO authenticated;
-- public.get_inventory_report(p_store_id uuid, p_from_date timestamp with time zone, p_to_date timestamp with time zone)
GRANT EXECUTE ON FUNCTION public.get_inventory_report(p_store_id uuid, p_from_date timestamp with time zone, p_to_date timestamp with time zone) TO authenticated;
-- public.get_inventory_with_costs(p_store_id uuid)
GRANT EXECUTE ON FUNCTION public.get_inventory_with_costs(p_store_id uuid) TO authenticated;
-- public.get_my_sales(p_search_query text, p_status text, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_min_amount numeric, p_max_amount numeric, p_sort_column text, p_sort_direction text, p_limit integer, p_offset integer)
GRANT EXECUTE ON FUNCTION public.get_my_sales(p_search_query text, p_status text, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_min_amount numeric, p_max_amount numeric, p_sort_column text, p_sort_direction text, p_limit integer, p_offset integer) TO authenticated;
-- public.get_my_sales(p_search_query text, p_status text, p_payment_method text, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_min_amount numeric, p_max_amount numeric, p_sort_column text, p_sort_direction text, p_limit integer, p_offset integer)
GRANT EXECUTE ON FUNCTION public.get_my_sales(p_search_query text, p_status text, p_payment_method text, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_min_amount numeric, p_max_amount numeric, p_sort_column text, p_sort_direction text, p_limit integer, p_offset integer) TO authenticated;
-- public.get_my_sales_summary(p_period text)
GRANT EXECUTE ON FUNCTION public.get_my_sales_summary(p_period text) TO authenticated;
-- public.get_or_create_product_cost_sheet(p_product_id uuid, p_store_id uuid, p_template_id text, p_modalidad text, p_pdf_format text)
GRANT EXECUTE ON FUNCTION public.get_or_create_product_cost_sheet(p_product_id uuid, p_store_id uuid, p_template_id text, p_modalidad text, p_pdf_format text) TO authenticated;
-- public.get_product_stock_ledger(p_product_id uuid, p_store_id uuid)
GRANT EXECUTE ON FUNCTION public.get_product_stock_ledger(p_product_id uuid, p_store_id uuid) TO authenticated;
-- public.get_product_variants_counts()
GRANT EXECUTE ON FUNCTION public.get_product_variants_counts() TO authenticated;
-- public.get_purchases_book(p_store_id uuid, p_year integer, p_month integer)
GRANT EXECUTE ON FUNCTION public.get_purchases_book(p_store_id uuid, p_year integer, p_month integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_purchases_book(p_store_id uuid, p_year integer, p_month integer) TO PUBLIC;
-- public.get_sales_book(p_store_id uuid, p_year integer, p_month integer)
GRANT EXECUTE ON FUNCTION public.get_sales_book(p_store_id uuid, p_year integer, p_month integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_book(p_store_id uuid, p_year integer, p_month integer) TO PUBLIC;
-- public.get_tax_report(p_store_id uuid, p_year integer, p_month integer)
GRANT EXECUTE ON FUNCTION public.get_tax_report(p_store_id uuid, p_year integer, p_month integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tax_report(p_store_id uuid, p_year integer, p_month integer) TO PUBLIC;
-- public.get_tenant_cash_report(p_tenant_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)
GRANT EXECUTE ON FUNCTION public.get_tenant_cash_report(p_tenant_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_cash_report(p_tenant_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone) TO PUBLIC;
-- public.get_tenant_sales_summary(p_tenant_id uuid, p_days integer)
GRANT EXECUTE ON FUNCTION public.get_tenant_sales_summary(p_tenant_id uuid, p_days integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_sales_summary(p_tenant_id uuid, p_days integer) TO PUBLIC;
-- public.get_transactions_with_profit(p_store_id uuid, p_search_term text, p_date_from timestamp without time zone, p_date_to timestamp without time zone, p_limit integer)
GRANT EXECUTE ON FUNCTION public.get_transactions_with_profit(p_store_id uuid, p_search_term text, p_date_from timestamp without time zone, p_date_to timestamp without time zone, p_limit integer) TO authenticated;
-- public.get_usage_forecast()
GRANT EXECUTE ON FUNCTION public.get_usage_forecast() TO authenticated;
-- public.get_user_audit_history(p_user_id uuid, p_limit integer, p_offset integer)
GRANT EXECUTE ON FUNCTION public.get_user_audit_history(p_user_id uuid, p_limit integer, p_offset integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_audit_history(p_user_id uuid, p_limit integer, p_offset integer) TO PUBLIC;
-- public.get_user_role()
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
-- public.has_management_access_as(p_user_id uuid, p_store_id uuid)
GRANT EXECUTE ON FUNCTION public.has_management_access_as(p_user_id uuid, p_store_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_management_access_as(p_user_id uuid, p_store_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.has_management_access_as(p_user_id uuid, p_store_id uuid) TO PUBLIC;
-- public.has_store_access_as(p_user_id uuid, p_store_id uuid)
GRANT EXECUTE ON FUNCTION public.has_store_access_as(p_user_id uuid, p_store_id uuid) TO authenticated;
-- public.is_admin_check(p_user_id uuid)
GRANT EXECUTE ON FUNCTION public.is_admin_check(p_user_id uuid) TO authenticated;
-- public.is_manager_of_store(p_store_id uuid)
GRANT EXECUTE ON FUNCTION public.is_manager_of_store(p_store_id uuid) TO authenticated;
-- public.is_role_not_changed(p_user_id uuid, p_new_role user_role, p_new_role_id uuid)
GRANT EXECUTE ON FUNCTION public.is_role_not_changed(p_user_id uuid, p_new_role user_role, p_new_role_id uuid) TO authenticated;
-- public.is_store_manager(p_store_id uuid)
GRANT EXECUTE ON FUNCTION public.is_store_manager(p_store_id uuid) TO authenticated;
-- public.is_user_creator(p_target_user_id uuid)
GRANT EXECUTE ON FUNCTION public.is_user_creator(p_target_user_id uuid) TO authenticated;
-- public.link_receipts_to_service(p_service_id uuid, p_receipt_ids jsonb, p_user_id uuid)
GRANT EXECUTE ON FUNCTION public.link_receipts_to_service(p_service_id uuid, p_receipt_ids jsonb, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_receipts_to_service(p_service_id uuid, p_receipt_ids jsonb, p_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.link_receipts_to_service(p_service_id uuid, p_receipt_ids jsonb, p_user_id uuid) TO PUBLIC;
-- public.log_audit_event(p_action text, p_payload jsonb, p_store_id uuid)
GRANT EXECUTE ON FUNCTION public.log_audit_event(p_action text, p_payload jsonb, p_store_id uuid) TO authenticated;
-- public.log_transaction_changes()
GRANT EXECUTE ON FUNCTION public.log_transaction_changes() TO authenticated;
-- public.managed_create_store(p_name text, p_address text)
GRANT EXECUTE ON FUNCTION public.managed_create_store(p_name text, p_address text) TO authenticated;
-- public.managed_create_user(p_max_users integer, p_max_stores integer, p_role text, p_full_name text, p_email text, p_creator_id uuid, p_target_user_id uuid, p_store_id uuid, p_memberships jsonb)
GRANT EXECUTE ON FUNCTION public.managed_create_user(p_max_users integer, p_max_stores integer, p_role text, p_full_name text, p_email text, p_creator_id uuid, p_target_user_id uuid, p_store_id uuid, p_memberships jsonb) TO authenticated;
-- public.managed_create_user_v2(p_email text, p_full_name text, p_role user_role, p_plan plan_t, p_store_id uuid, p_memberships jsonb, p_max_stores integer, p_max_users integer, p_target_user_id uuid, p_creator_id uuid)
GRANT EXECUTE ON FUNCTION public.managed_create_user_v2(p_email text, p_full_name text, p_role user_role, p_plan plan_t, p_store_id uuid, p_memberships jsonb, p_max_stores integer, p_max_users integer, p_target_user_id uuid, p_creator_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_create_user_v2(p_email text, p_full_name text, p_role user_role, p_plan plan_t, p_store_id uuid, p_memberships jsonb, p_max_stores integer, p_max_users integer, p_target_user_id uuid, p_creator_id uuid) TO PUBLIC;
-- public.managed_delete_user(p_user_id uuid)
GRANT EXECUTE ON FUNCTION public.managed_delete_user(p_user_id uuid) TO authenticated;
-- public.managed_reset_password(p_user_id uuid, p_caller_id uuid)
GRANT EXECUTE ON FUNCTION public.managed_reset_password(p_user_id uuid, p_caller_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_reset_password(p_user_id uuid, p_caller_id uuid) TO PUBLIC;
-- public.managed_revoke_membership(p_membership_id uuid, p_caller_id uuid)
GRANT EXECUTE ON FUNCTION public.managed_revoke_membership(p_membership_id uuid, p_caller_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_revoke_membership(p_membership_id uuid, p_caller_id uuid) TO PUBLIC;
-- public.managed_soft_delete_user(p_user_id uuid, p_reason text, p_caller_id uuid)
GRANT EXECUTE ON FUNCTION public.managed_soft_delete_user(p_user_id uuid, p_reason text, p_caller_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_soft_delete_user(p_user_id uuid, p_reason text, p_caller_id uuid) TO PUBLIC;
-- public.managed_toggle_user_status(p_user_id uuid, p_is_active boolean, p_caller_id uuid)
GRANT EXECUTE ON FUNCTION public.managed_toggle_user_status(p_user_id uuid, p_is_active boolean, p_caller_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_toggle_user_status(p_user_id uuid, p_is_active boolean, p_caller_id uuid) TO PUBLIC;
-- public.managed_update_membership(p_membership_id uuid, p_role user_role, p_status text, p_caller_id uuid)
GRANT EXECUTE ON FUNCTION public.managed_update_membership(p_membership_id uuid, p_role user_role, p_status text, p_caller_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_update_membership(p_membership_id uuid, p_role user_role, p_status text, p_caller_id uuid) TO PUBLIC;
-- public.managed_update_tenant_plan(p_tenant_id uuid, p_plan plan_t, p_subscription_status text, p_caller_id uuid)
GRANT EXECUTE ON FUNCTION public.managed_update_tenant_plan(p_tenant_id uuid, p_plan plan_t, p_subscription_status text, p_caller_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_update_tenant_plan(p_tenant_id uuid, p_plan plan_t, p_subscription_status text, p_caller_id uuid) TO PUBLIC;
-- public.managed_update_user(p_user_id uuid, p_full_name text, p_role user_role, p_role_id uuid, p_is_active boolean, p_max_stores_limit integer, p_max_users_limit integer, p_plan plan_t, p_caller_id uuid)
GRANT EXECUTE ON FUNCTION public.managed_update_user(p_user_id uuid, p_full_name text, p_role user_role, p_role_id uuid, p_is_active boolean, p_max_stores_limit integer, p_max_users_limit integer, p_plan plan_t, p_caller_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_update_user(p_user_id uuid, p_full_name text, p_role user_role, p_role_id uuid, p_is_active boolean, p_max_stores_limit integer, p_max_users_limit integer, p_plan plan_t, p_caller_id uuid) TO PUBLIC;
-- public.mark_expired_lots(p_store_id uuid)
GRANT EXECUTE ON FUNCTION public.mark_expired_lots(p_store_id uuid) TO authenticated;
-- public.on_auth_user_created()
GRANT EXECUTE ON FUNCTION public.on_auth_user_created() TO authenticated;
-- public.on_pick3_profile_initial_bankroll()
GRANT EXECUTE ON FUNCTION public.on_pick3_profile_initial_bankroll() TO authenticated;
-- public.prevent_direct_inventory_modification()
GRANT EXECUTE ON FUNCTION public.prevent_direct_inventory_modification() TO authenticated;
-- public.prevent_received_service_edit()
GRANT EXECUTE ON FUNCTION public.prevent_received_service_edit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_received_service_edit() TO anon;
GRANT EXECUTE ON FUNCTION public.prevent_received_service_edit() TO PUBLIC;
-- public.process_stock_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_operation_date timestamp with time zone)
GRANT EXECUTE ON FUNCTION public.process_stock_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_operation_date timestamp with time zone) TO authenticated;
-- public.reconcile_orphan_user(p_auth_user_id uuid, p_action text, p_reason text, p_caller_id uuid)
GRANT EXECUTE ON FUNCTION public.reconcile_orphan_user(p_auth_user_id uuid, p_action text, p_reason text, p_caller_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_orphan_user(p_auth_user_id uuid, p_action text, p_reason text, p_caller_id uuid) TO PUBLIC;
-- public.reconcile_stock(p_store_id uuid, p_fix boolean, p_user_id uuid)
GRANT EXECUTE ON FUNCTION public.reconcile_stock(p_store_id uuid, p_fix boolean, p_user_id uuid) TO authenticated;
-- public.record_counted_quantity(p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid, p_notes text)
GRANT EXECUTE ON FUNCTION public.record_counted_quantity(p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid, p_notes text) TO authenticated;
-- public.record_sale_movement(p_store_id uuid, p_product_id uuid, p_variant_id uuid, p_quantity integer, p_reference text)
GRANT EXECUTE ON FUNCTION public.record_sale_movement(p_store_id uuid, p_product_id uuid, p_variant_id uuid, p_quantity integer, p_reference text) TO authenticated;
-- public.register_idempotency(p_key text, p_operation text, p_record_id uuid, p_param_hash text, p_result jsonb)
GRANT EXECUTE ON FUNCTION public.register_idempotency(p_key text, p_operation text, p_record_id uuid, p_param_hash text, p_result jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_idempotency(p_key text, p_operation text, p_record_id uuid, p_param_hash text, p_result jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.register_idempotency(p_key text, p_operation text, p_record_id uuid, p_param_hash text, p_result jsonb) TO PUBLIC;
-- public.reject_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid)
GRANT EXECUTE ON FUNCTION public.reject_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) TO authenticated;
-- public.release_expired_reservations()
GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO anon;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO PUBLIC;
-- public.reopen_cash_shift(p_closure_id uuid, p_reason text, p_user_id uuid)
GRANT EXECUTE ON FUNCTION public.reopen_cash_shift(p_closure_id uuid, p_reason text, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_cash_shift(p_closure_id uuid, p_reason text, p_user_id uuid) TO PUBLIC;
-- public.reverse_commissions_on_sale_void()
GRANT EXECUTE ON FUNCTION public.reverse_commissions_on_sale_void() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_commissions_on_sale_void() TO anon;
GRANT EXECUTE ON FUNCTION public.reverse_commissions_on_sale_void() TO PUBLIC;
-- public.reverse_vale_salida(p_slip_id uuid, p_reason text, p_user_id uuid)
GRANT EXECUTE ON FUNCTION public.reverse_vale_salida(p_slip_id uuid, p_reason text, p_user_id uuid) TO authenticated;
-- public.save_ai_api_key(p_provider text, p_api_key text, p_label text)
GRANT EXECUTE ON FUNCTION public.save_ai_api_key(p_provider text, p_api_key text, p_label text) TO authenticated;
-- public.set_transfer_approval_rule(p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric, p_threshold_quantity numeric, p_approver_roles text[], p_is_active boolean, p_user_id uuid)
GRANT EXECUTE ON FUNCTION public.set_transfer_approval_rule(p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric, p_threshold_quantity numeric, p_approver_roles text[], p_is_active boolean, p_user_id uuid) TO authenticated;
-- public.snapshot_commission_rule()
GRANT EXECUTE ON FUNCTION public.snapshot_commission_rule() TO authenticated;
-- public.sync_inventory_from_products(p_store_id uuid)
GRANT EXECUTE ON FUNCTION public.sync_inventory_from_products(p_store_id uuid) TO authenticated;
-- public.sync_product_has_movements()
GRANT EXECUTE ON FUNCTION public.sync_product_has_movements() TO authenticated;
-- public.sync_product_stock()
GRANT EXECUTE ON FUNCTION public.sync_product_stock() TO authenticated;
-- public.touch_updated_at()
GRANT EXECUTE ON FUNCTION public.touch_updated_at() TO authenticated;
-- public.transfer_requires_approval(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb)
GRANT EXECUTE ON FUNCTION public.transfer_requires_approval(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb) TO authenticated;
-- public.update_receipt_item_tasa(p_receipt_item_id uuid, p_new_tasa_cambio_recepcion numeric, p_new_moneda_recepcion text, p_motivo text, p_user_id uuid)
GRANT EXECUTE ON FUNCTION public.update_receipt_item_tasa(p_receipt_item_id uuid, p_new_tasa_cambio_recepcion numeric, p_new_moneda_recepcion text, p_motivo text, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_receipt_item_tasa(p_receipt_item_id uuid, p_new_tasa_cambio_recepcion numeric, p_new_moneda_recepcion text, p_motivo text, p_user_id uuid) TO PUBLIC;
-- public.upsert_store_cost_template(p_store_id uuid, p_template_id text, p_template_data jsonb, p_modalidad text, p_pdf_format text, p_created_by uuid)
GRANT EXECUTE ON FUNCTION public.upsert_store_cost_template(p_store_id uuid, p_template_id text, p_template_data jsonb, p_modalidad text, p_pdf_format text, p_created_by uuid) TO authenticated;
-- public.validate_active_store()
GRANT EXECUTE ON FUNCTION public.validate_active_store() TO authenticated;
-- public.validate_backup_registry_drift()
GRANT EXECUTE ON FUNCTION public.validate_backup_registry_drift() TO authenticated;
-- public.validate_operation_date(p_new_date timestamp with time zone, p_store_id uuid)
GRANT EXECUTE ON FUNCTION public.validate_operation_date(p_new_date timestamp with time zone, p_store_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_operation_date(p_new_date timestamp with time zone, p_store_id uuid) TO PUBLIC;
-- public.validate_post_restore(p_store_id uuid, p_backup_payload jsonb)
GRANT EXECUTE ON FUNCTION public.validate_post_restore(p_store_id uuid, p_backup_payload jsonb) TO authenticated;
-- public.validate_pre_restore_fk_integrity(p_store_id uuid)
GRANT EXECUTE ON FUNCTION public.validate_pre_restore_fk_integrity(p_store_id uuid) TO authenticated;
-- public.validate_tenant_access(p_user_id uuid, p_store_id uuid)
GRANT EXECUTE ON FUNCTION public.validate_tenant_access(p_user_id uuid, p_store_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_tenant_access(p_user_id uuid, p_store_id uuid) TO PUBLIC;
-- public.validate_transfer_operation_date(p_new_date timestamp with time zone, p_origin_store_id uuid, p_destination_store_id uuid)
GRANT EXECUTE ON FUNCTION public.validate_transfer_operation_date(p_new_date timestamp with time zone, p_origin_store_id uuid, p_destination_store_id uuid) TO authenticated;
-- public.verify_audit_chain()
GRANT EXECUTE ON FUNCTION public.verify_audit_chain() TO authenticated;
-- public.withdraw_production_item_v3(p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text, p_reference_id uuid, p_reference_doc text)
GRANT EXECUTE ON FUNCTION public.withdraw_production_item_v3(p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text, p_reference_id uuid, p_reference_doc text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

