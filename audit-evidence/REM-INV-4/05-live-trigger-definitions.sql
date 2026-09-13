-- REM-INV-4 LIVE trigger definitions (pg_get_triggerdef verbatim)
-- captured 2026-09-13T05:44:05.471Z
-- count: 82

-- ===== public.audit_logs :: trg_set_audit_log_trace_id =====
CREATE TRIGGER trg_set_audit_log_trace_id BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION set_audit_log_trace_id();

-- ===== public.audit_logs :: update_audit_logs_updated_at =====
CREATE TRIGGER update_audit_logs_updated_at BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===== public.cash_closures :: prevent_cash_closure_edit =====
CREATE TRIGGER prevent_cash_closure_edit BEFORE DELETE OR UPDATE ON public.cash_closures FOR EACH ROW EXECUTE FUNCTION prevent_cash_closure_edit();

-- ===== public.cash_closures :: trg_audit_cash_closures =====
CREATE TRIGGER trg_audit_cash_closures AFTER INSERT OR DELETE OR UPDATE ON public.cash_closures FOR EACH ROW EXECUTE FUNCTION audit_cash_closures_changes();

-- ===== public.cash_register_sessions :: trg_check_cash_session_closed =====
CREATE TRIGGER trg_check_cash_session_closed BEFORE UPDATE ON public.cash_register_sessions FOR EACH ROW EXECUTE FUNCTION check_cash_session_open();

-- ===== public.commission_payments :: commission_payments_touch_updated_at =====
CREATE TRIGGER commission_payments_touch_updated_at BEFORE UPDATE ON public.commission_payments FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ===== public.commission_payments :: trg_audit_commission_payments =====
CREATE TRIGGER trg_audit_commission_payments AFTER INSERT OR DELETE OR UPDATE ON public.commission_payments FOR EACH ROW EXECUTE FUNCTION audit_commission_payments_changes();

-- ===== public.commission_payments :: trg_calc_commission_cup =====
CREATE TRIGGER trg_calc_commission_cup BEFORE INSERT OR UPDATE ON public.commission_payments FOR EACH ROW EXECUTE FUNCTION calculate_commission_amount_cup();

-- ===== public.commission_payments :: trg_set_default_due_date_commission =====
CREATE TRIGGER trg_set_default_due_date_commission BEFORE INSERT OR UPDATE OF period_end ON public.commission_payments FOR EACH ROW EXECUTE FUNCTION set_default_due_date_commission();

-- ===== public.commission_rule_products :: commission_rule_products_touch_updated_at =====
CREATE TRIGGER commission_rule_products_touch_updated_at BEFORE UPDATE ON public.commission_rule_products FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ===== public.commission_rules :: commission_rules_snapshot =====
CREATE TRIGGER commission_rules_snapshot AFTER INSERT OR UPDATE ON public.commission_rules FOR EACH ROW EXECUTE FUNCTION snapshot_commission_rule();

-- ===== public.commission_rules :: commission_rules_touch_updated_at =====
CREATE TRIGGER commission_rules_touch_updated_at BEFORE UPDATE ON public.commission_rules FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ===== public.cost_sheets :: update_cost_sheets_updated_at =====
CREATE TRIGGER update_cost_sheets_updated_at BEFORE UPDATE ON public.cost_sheets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===== public.devolutions :: trg_validate_devolution_transition =====
CREATE TRIGGER trg_validate_devolution_transition BEFORE UPDATE OF status ON public.devolutions FOR EACH ROW EXECUTE FUNCTION fn_validate_document_transition('devolutions');

-- ===== public.fiscal_closings :: prevent_fiscal_closing_edit =====
CREATE TRIGGER prevent_fiscal_closing_edit BEFORE DELETE OR UPDATE ON public.fiscal_closings FOR EACH ROW EXECUTE FUNCTION prevent_fiscal_closing_edit();

-- ===== public.fiscal_closings :: trg_audit_fiscal_closings =====
CREATE TRIGGER trg_audit_fiscal_closings AFTER INSERT OR UPDATE ON public.fiscal_closings FOR EACH ROW EXECUTE FUNCTION audit_fiscal_closings_changes();

-- ===== public.inventory :: trg_alert_low_stock =====
CREATE TRIGGER trg_alert_low_stock AFTER UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION alert_low_stock();

-- ===== public.inventory :: trg_prevent_negative_inventory =====
CREATE TRIGGER trg_prevent_negative_inventory BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION prevent_negative_inventory();

-- ===== public.inventory :: trg_sync_products_stock_current =====
CREATE TRIGGER trg_sync_products_stock_current AFTER INSERT OR UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION sync_products_stock_current();

-- ===== public.inventory :: trigger_prevent_inventory_update =====
CREATE TRIGGER trigger_prevent_inventory_update BEFORE UPDATE OF quantity ON public.inventory FOR EACH ROW EXECUTE FUNCTION prevent_direct_inventory_modification();

-- ===== public.inventory_adjustments :: trg_validate_adjustment_transition =====
CREATE TRIGGER trg_validate_adjustment_transition BEFORE UPDATE OF status ON public.inventory_adjustments FOR EACH ROW EXECUTE FUNCTION fn_validate_document_transition('inventory_adjustments');

-- ===== public.inventory_movements :: trg_sync_has_movements_inv =====
CREATE TRIGGER trg_sync_has_movements_inv AFTER INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION sync_product_has_movements();

-- ===== public.ofertas :: set_ofertas_updated_at =====
CREATE TRIGGER set_ofertas_updated_at BEFORE UPDATE ON public.ofertas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===== public.orphaned_users_log :: update_orphaned_users_log_updated_at =====
CREATE TRIGGER update_orphaned_users_log_updated_at BEFORE UPDATE ON public.orphaned_users_log FOR EACH ROW EXECUTE FUNCTION update_orphaned_users_log_updated_at();

-- ===== public.payment_transactions :: trg_audit_payment_transactions =====
CREATE TRIGGER trg_audit_payment_transactions AFTER INSERT OR UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION audit_payment_transactions_changes();

-- ===== public.payment_transactions :: trg_update_payment_status =====
CREATE TRIGGER trg_update_payment_status AFTER INSERT OR DELETE OR UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION update_payment_status();

-- ===== public.payment_transactions :: trg_validate_payment_invariants =====
CREATE TRIGGER trg_validate_payment_invariants BEFORE INSERT OR DELETE OR UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION validate_payment_transactions_invariants();

-- ===== public.physical_counts :: trg_generate_physical_count_number =====
CREATE TRIGGER trg_generate_physical_count_number BEFORE INSERT ON public.physical_counts FOR EACH ROW EXECUTE FUNCTION fn_generate_physical_count_number();

-- ===== public.pick3_profiles :: tr_pick3_initial_bankroll =====
CREATE TRIGGER tr_pick3_initial_bankroll AFTER INSERT OR UPDATE OF initial_bankroll ON public.pick3_profiles FOR EACH ROW EXECUTE FUNCTION on_pick3_profile_initial_bankroll();

-- ===== public.pick3_referrals :: trigger_pick3_referrals_updated_at =====
CREATE TRIGGER trigger_pick3_referrals_updated_at BEFORE UPDATE ON public.pick3_referrals FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ===== public.pick3_subscriptions :: trigger_pick3_subscriptions_updated_at =====
CREATE TRIGGER trigger_pick3_subscriptions_updated_at BEFORE UPDATE ON public.pick3_subscriptions FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ===== public.pick3_usage :: trigger_pick3_usage_updated_at =====
CREATE TRIGGER trigger_pick3_usage_updated_at BEFORE UPDATE ON public.pick3_usage FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ===== public.product_cost_sheets :: set_product_cost_sheets_updated_at =====
CREATE TRIGGER set_product_cost_sheets_updated_at BEFORE UPDATE ON public.product_cost_sheets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===== public.production_orders :: trg_generate_po_number =====
CREATE TRIGGER trg_generate_po_number BEFORE INSERT ON public.production_orders FOR EACH ROW EXECUTE FUNCTION generate_production_order_number();

-- ===== public.production_orders :: trg_validate_production_transition =====
CREATE TRIGGER trg_validate_production_transition BEFORE UPDATE OF status ON public.production_orders FOR EACH ROW EXECUTE FUNCTION fn_validate_document_transition('production_orders');

-- ===== public.products :: trg_ensure_product_barcode =====
CREATE TRIGGER trg_ensure_product_barcode BEFORE INSERT OR UPDATE OF barcode ON public.products FOR EACH ROW EXECUTE FUNCTION ensure_product_barcode();

-- ===== public.products :: trg_guard_wac_writer =====
CREATE TRIGGER trg_guard_wac_writer BEFORE UPDATE OF cost_average ON public.products FOR EACH ROW EXECUTE FUNCTION w62_guard_wac_writer();

-- ===== public.products :: trg_maintain_product_completeness =====
CREATE TRIGGER trg_maintain_product_completeness BEFORE INSERT OR UPDATE OF price ON public.products FOR EACH ROW EXECUTE FUNCTION fn_maintain_product_completeness();

-- ===== public.products :: trigger_audit_product_changes =====
CREATE TRIGGER trigger_audit_product_changes AFTER UPDATE ON public.products FOR EACH ROW WHEN (((old.name IS DISTINCT FROM new.name) OR (old.price IS DISTINCT FROM new.price) OR (old.cost_price IS DISTINCT FROM new.cost_price) OR (old.sku IS DISTINCT FROM new.sku) OR (old.price_currency IS DISTINCT FROM new.price_currency))) EXECUTE FUNCTION audit_product_changes();

-- ===== public.profiles :: prevent_hard_delete_profile =====
CREATE TRIGGER prevent_hard_delete_profile BEFORE DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete_profile();

-- ===== public.profiles :: trg_prevent_self_privilege_escalation =====
CREATE TRIGGER trg_prevent_self_privilege_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION prevent_self_privilege_escalation();

-- ===== public.profiles :: trg_sync_profile_role =====
CREATE TRIGGER trg_sync_profile_role BEFORE INSERT OR UPDATE OF role_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION fn_sync_profile_role();

-- ===== public.profiles :: trigger_audit_profile_changes =====
CREATE TRIGGER trigger_audit_profile_changes AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION audit_profile_changes();

-- ===== public.profiles :: trigger_enforce_encargado_user_limit =====
CREATE TRIGGER trigger_enforce_encargado_user_limit BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION enforce_encargado_user_limit();

-- ===== public.profiles :: trigger_validate_active_store =====
CREATE TRIGGER trigger_validate_active_store BEFORE INSERT OR UPDATE OF active_store_id, role ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_active_store();

-- ===== public.purchase_orders :: trg_po_updated =====
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION update_po_updated_at();

-- ===== public.purchase_orders :: trg_purchase_orders_updated_at =====
CREATE TRIGGER trg_purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION update_purchase_orders_updated_at();

-- ===== public.receipt_items :: trg_check_reception_cost_variation =====
CREATE TRIGGER trg_check_reception_cost_variation BEFORE INSERT ON public.receipt_items FOR EACH ROW EXECUTE FUNCTION check_reception_cost_variation();

-- ===== public.receipt_items :: trg_sync_has_movements_receipt =====
CREATE TRIGGER trg_sync_has_movements_receipt AFTER INSERT ON public.receipt_items FOR EACH ROW EXECUTE FUNCTION sync_product_has_movements();

-- ===== public.receipts :: trg_audit_receipt_changes =====
CREATE TRIGGER trg_audit_receipt_changes AFTER UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION log_transaction_changes();

-- ===== public.receipts :: trg_set_due_date_receipt =====
CREATE TRIGGER trg_set_due_date_receipt BEFORE INSERT ON public.receipts FOR EACH ROW EXECUTE FUNCTION set_default_due_date_receipt();

-- ===== public.receipts :: trg_validate_receipt_transition =====
CREATE TRIGGER trg_validate_receipt_transition BEFORE UPDATE OF status ON public.receipts FOR EACH ROW EXECUTE FUNCTION fn_validate_document_transition('receipts');

-- ===== public.received_services :: trg_prevent_received_service_edit =====
CREATE TRIGGER trg_prevent_received_service_edit BEFORE UPDATE ON public.received_services FOR EACH ROW EXECUTE FUNCTION prevent_received_service_edit();

-- ===== public.received_services :: trg_set_due_date_service =====
CREATE TRIGGER trg_set_due_date_service BEFORE INSERT ON public.received_services FOR EACH ROW EXECUTE FUNCTION set_default_due_date_service();

-- ===== public.roles :: tr_audit_role_changes =====
CREATE TRIGGER tr_audit_role_changes AFTER INSERT OR DELETE OR UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION audit_role_changes();

-- ===== public.roles :: update_roles_updated_at =====
CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===== public.sales_transactions :: sales_transactions_touch_updated_at =====
CREATE TRIGGER sales_transactions_touch_updated_at BEFORE UPDATE ON public.sales_transactions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ===== public.stock_movements :: tr_sync_inventory_after_movement =====
CREATE TRIGGER tr_sync_inventory_after_movement BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION fn_sync_inventory_on_movement();

-- ===== public.stock_movements :: trg_auto_kardex =====
CREATE TRIGGER trg_auto_kardex AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION auto_kardex_on_stock_movement();

-- ===== public.stock_movements :: trg_sync_product_stock =====
CREATE TRIGGER trg_sync_product_stock AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION sync_product_stock();

-- ===== public.store_cost_templates :: set_store_cost_templates_updated_at =====
CREATE TRIGGER set_store_cost_templates_updated_at BEFORE UPDATE ON public.store_cost_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===== public.stores :: trg_audit_backup_restore_protected =====
CREATE TRIGGER trg_audit_backup_restore_protected AFTER UPDATE OF backup_restore_protected ON public.stores FOR EACH ROW EXECUTE FUNCTION audit_backup_restore_protected_change();

-- ===== public.stores :: trg_stores_soft_delete_cleanup =====
CREATE TRIGGER trg_stores_soft_delete_cleanup BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION stores_soft_delete_cleanup();

-- ===== public.stores :: trigger_audit_store_changes =====
CREATE TRIGGER trigger_audit_store_changes AFTER INSERT OR DELETE OR UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION audit_store_changes();

-- ===== public.stores :: trigger_auto_assign_store_to_creator =====
CREATE TRIGGER trigger_auto_assign_store_to_creator AFTER INSERT ON public.stores FOR EACH ROW EXECUTE FUNCTION auto_assign_store_to_creator();

-- ===== public.stores :: trigger_enforce_encargado_store_limit =====
CREATE TRIGGER trigger_enforce_encargado_store_limit BEFORE INSERT ON public.stores FOR EACH ROW EXECUTE FUNCTION enforce_encargado_store_limit();

-- ===== public.suppliers :: trg_suppliers_updated_at =====
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION update_suppliers_updated_at();

-- ===== public.transaction_items :: trg_sync_has_movements_sale =====
CREATE TRIGGER trg_sync_has_movements_sale AFTER INSERT ON public.transaction_items FOR EACH ROW EXECUTE FUNCTION sync_product_has_movements();

-- ===== public.transaction_recovery_ledger :: trg_ledger_append_only =====
CREATE TRIGGER trg_ledger_append_only BEFORE DELETE OR UPDATE ON public.transaction_recovery_ledger FOR EACH ROW EXECUTE FUNCTION enforce_ledger_append_only();

-- ===== public.transactions :: reverse_commissions_on_sale_void =====
CREATE TRIGGER reverse_commissions_on_sale_void AFTER UPDATE OF status ON public.transactions FOR EACH ROW EXECUTE FUNCTION reverse_commissions_on_sale_void();

-- ===== public.transactions :: trg_audit_transaction_changes =====
CREATE TRIGGER trg_audit_transaction_changes AFTER UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION log_transaction_changes();

-- ===== public.transactions :: trg_check_active_user =====
CREATE TRIGGER trg_check_active_user BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION check_active_user();

-- ===== public.transactions :: trg_protect_transactions_total_amount =====
CREATE TRIGGER trg_protect_transactions_total_amount BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION protect_transactions_total_amount();

-- ===== public.transactions :: trg_validate_tx_transition =====
CREATE TRIGGER trg_validate_tx_transition BEFORE UPDATE OF status ON public.transactions FOR EACH ROW EXECUTE FUNCTION fn_validate_document_transition('transactions');

-- ===== public.transfers :: trg_validate_transfer_stores =====
CREATE TRIGGER trg_validate_transfer_stores BEFORE INSERT OR UPDATE ON public.transfers FOR EACH ROW EXECUTE FUNCTION validate_transfer_stores();

-- ===== public.transfers :: trg_validate_transfer_transition =====
CREATE TRIGGER trg_validate_transfer_transition BEFORE UPDATE OF status ON public.transfers FOR EACH ROW EXECUTE FUNCTION fn_validate_document_transition('transfers');

-- ===== public.user_invitations :: update_user_invitations_updated_at =====
CREATE TRIGGER update_user_invitations_updated_at BEFORE UPDATE ON public.user_invitations FOR EACH ROW EXECUTE FUNCTION update_user_invitations_updated_at();

-- ===== public.user_store_memberships :: update_user_store_memberships_updated_at =====
CREATE TRIGGER update_user_store_memberships_updated_at BEFORE UPDATE ON public.user_store_memberships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===== public.wallet_accounts :: trigger_wallet_accounts_updated =====
CREATE TRIGGER trigger_wallet_accounts_updated BEFORE UPDATE ON public.wallet_accounts FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ===== public.wallet_transactions :: trigger_wallet_tx_updated =====
CREATE TRIGGER trigger_wallet_tx_updated BEFORE UPDATE ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ===== public.workers :: workers_touch_updated_at =====
CREATE TRIGGER workers_touch_updated_at BEFORE UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ===== public.z_reports :: prevent_z_report_edit =====
CREATE TRIGGER prevent_z_report_edit BEFORE DELETE OR UPDATE ON public.z_reports FOR EACH ROW EXECUTE FUNCTION prevent_z_report_edit();
