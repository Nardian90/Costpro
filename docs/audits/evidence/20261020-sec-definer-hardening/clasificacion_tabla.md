## Clasificación viva (2026-10-20) — hallazgos §3.4

Fuente: volcado read-only vía Management API (pg_proc/pg_trigger/proacl) + grep de uso en `src/` y `e2e/`.

### Check 2 — SECURITY DEFINER con EXECUTE anon/PUBLIC (10)

| Función | Categoría | Descripción | Acción | Estado post |
|---|---|---|---|---|
| `profiles_block_privileged_update` | a-trigger | Trigger de protección con guard auth.uid — REVOKE PUBLIC/anon (grants irrelevantes al disparo) | REVOKE PUBLIC/anon | intacto (explicit auth) |
| `get_paginated_products_v2` | b | RPC catálogo UI autenticada | REVOKE PUBLIC/anon; authenticated intacto | intacto (explicit auth) |
| `get_products_for_pos` | b | RPC POS UI autenticada | REVOKE PUBLIC/anon; authenticated intacto | intacto (explicit auth) |
| `get_transactions` | b | RPC reportes UI autenticada | REVOKE PUBLIC/anon; authenticated intacto | intacto (explicit auth) |
| `register_reception` | b | RPC recepciones | REVOKE PUBLIC/anon; authenticated intacto | intacto (explicit auth) |
| `reverse_receipt_v2` | b | RPC reversas | REVOKE PUBLIC/anon; authenticated intacto | intacto (explicit auth) |
| `void_pending_reception` | b | RPC anulaciones | REVOKE PUBLIC/anon; authenticated intacto | intacto (explicit auth) |
| `e2e_hard_delete_store` | a | E2E borrado duro de tiendas | DROP FUNCTION | eliminada |
| `e2e_hard_delete_user` | a | E2E borrado duro de usuarios | DROP FUNCTION | eliminada |
| `is_admin_with_access` | b (ratificada) | RPC admin UI, guard is_admin()\|\|has_store_access, 0 llamadores BD | REVOKE PUBLIC/anon; authenticated intacto | intacto (explicit auth) |

### Check 1 — SECURITY DEFINER sin marcador auth.uid/ERR_PERMISSION_DENIED, no-trigger (97 tras 2 DROP)

| Función | anon_exec | auth_exec | llamadores BD | uso app (rpc) | muta | categoría |
|---|---|---|---|---|---|---|
| `e2e_hard_delete_store` | True | True | 0 | 0 | sí | a — DROP |
| `e2e_hard_delete_user` | True | True | 0 | 0 | sí | a — DROP |
| `is_admin_with_access` | True | True | 0 | 0 | no | b (ratificada) |
| `adjust_total_amount` | False | True | 0 | 0 | sí | helper-interno |
| `bulk_update_products` | False | False | 0 | 0 | sí | helper-interno |
| `calculate_receipt_total_cup` | False | False | 0 | 0 | no | helper-interno |
| `calculate_service_distribution` | False | False | 0 | 1 | no | helper-interno |
| `can_admin_reverse_transaction` | False | False | 0 | 0 | no | helper-interno |
| `can_create_user_with_role` | False | False | 0 | 0 | no | helper-interno |
| `can_pos_undo_transaction` | False | False | 0 | 0 | no | helper-interno |
| `can_reverse_document` | False | False | 0 | 0 | no | helper-interno |
| `can_safely_delete_user` | False | False | 0 | 0 | no | helper-interno |
| `can_void_receipt` | False | False | 0 | 0 | no | helper-interno |
| `check_bulk_ops_hourly_limit` | False | False | 0 | 1 | no | helper-interno |
| `check_idempotency` | False | False | 0 | 0 | sí | helper-interno |
| `check_tenant_store_quota` | False | False | 0 | 0 | no | helper-interno |
| `cleanup_expired_idempotency_keys` | False | False | 0 | 0 | sí | helper-interno |
| `cleanup_old_aggregates` | False | False | 0 | 1 | sí | helper-interno |
| `create_pre_restore_snapshot` | False | False | 0 | 0 | no | helper-interno |
| `create_purchase_order` | False | True | 0 | 1 | sí | helper-interno |
| `detect_orphan_users` | False | False | 0 | 1 | sí | helper-interno |
| `discover_backup_tables` | False | True | 0 | 1 | no | helper-interno |
| `ensure_fiscal_period` | False | False | 0 | 0 | sí | helper-interno |
| `fn_log_system_health` | False | False | 0 | 0 | sí | helper-interno |
| `fn_void_receipt` | False | False | 0 | 0 | sí | helper-interno |
| `generate_confirmation_token` | False | False | 0 | 0 | no | helper-interno |
| `generate_internal_barcode` | False | False | 0 | 0 | no | helper-interno |
| `generate_inventory_snapshot` | False | False | 0 | 0 | sí | helper-interno |
| `get_available_stock` | False | False | 0 | 0 | no | helper-interno |
| `get_backup_table_list` | False | True | 0 | 1 | no | helper-interno |
| `get_batch_store_daily_kpis` | False | True | 0 | 1 | no | helper-interno |
| `get_cash_closures` | False | True | 0 | 1 | no | helper-interno |
| `get_cash_shift_expected` | False | True | 0 | 1 | no | helper-interno |
| `get_current_user_store_id` | False | True | 0 | 0 | no | helper-interno |
| `get_daily_expenses_aggregated` | False | True | 0 | 1 | no | helper-interno |
| `get_daily_income_aggregated` | False | True | 0 | 1 | no | helper-interno |
| `get_global_max_operation_date` | False | True | 0 | 2 | no | helper-interno |
| `get_inventory_report` | False | False | 0 | 0 | no | helper-interno |
| `get_inventory_report` | False | False | 0 | 0 | no | helper-interno |
| `get_inventory_with_costs` | False | False | 0 | 0 | no | helper-interno |
| `get_low_stock_count` | False | True | 0 | 2 | no | helper-interno |
| `get_new_academy_cards` | False | True | 0 | 1 | no | helper-interno |
| `get_or_create_product_cost_sheet` | False | False | 0 | 0 | no | helper-interno |
| `get_paginated_products` | False | True | 0 | 2 | no | helper-interno |
| `get_product_cost_analysis` | False | False | 0 | 1 | no | helper-interno |
| `get_product_stock_ledger` | False | False | 0 | 0 | no | helper-interno |
| `get_product_stock_ledger_paginated` | False | True | 0 | 2 | no | helper-interno |
| `get_product_variants_counts` | False | False | 0 | 0 | no | helper-interno |
| `get_products_for_reception` | False | True | 0 | 0 | no | helper-interno |
| `get_profit_report` | False | True | 0 | 1 | no | helper-interno |
| `get_purchases_book` | False | False | 0 | 1 | no | helper-interno |
| `get_sales_book` | False | False | 0 | 1 | no | helper-interno |
| `get_sales_since_last_closure` | False | True | 0 | 1 | no | helper-interno |
| `get_store_analytics_advanced` | False | True | 0 | 1 | no | helper-interno |
| `get_table_writable_columns` | False | False | 0 | 0 | no | helper-interno |
| `get_tax_report` | False | False | 0 | 1 | no | helper-interno |
| `get_transfers` | False | True | 0 | 1 | no | helper-interno |
| `get_usage_forecast` | False | False | 0 | 0 | no | helper-interno |
| `get_usage_summary` | False | False | 0 | 1 | no | helper-interno |
| `get_user_audit_history` | False | False | 0 | 1 | no | helper-interno |
| `get_worker_commission_summary` | False | True | 0 | 1 | no | helper-interno |
| `has_management_access_as` | False | False | 0 | 0 | no | helper-interno |
| `has_role` | False | True | 0 | 0 | no | helper-interno |
| `has_store_access_as` | False | False | 0 | 0 | no | helper-interno |
| `has_store_role_as` | False | False | 0 | 0 | no | helper-interno |
| `increment_user_usage` | False | True | 0 | 1 | sí | helper-interno |
| `is_admin_check` | False | False | 0 | 0 | no | helper-interno |
| `is_role_not_changed` | False | False | 0 | 0 | no | helper-interno |
| `is_tenant_member` | False | False | 0 | 0 | no | helper-interno |
| `mark_expired_lots` | False | False | 0 | 0 | no | helper-interno |
| `next_document_number` | False | False | 0 | 0 | sí | helper-interno |
| `process_inventory_adjustment` | False | True | 0 | 1 | sí | helper-interno |
| `process_pick3_transaction` | False | True | 0 | 2 | sí | helper-interno |
| `process_stock_adjustment` | False | False | 0 | 0 | no | helper-interno |
| `purge_old_reset_snapshots` | False | False | 0 | 1 | sí | helper-interno |
| `receive_against_po` | False | True | 0 | 1 | sí | helper-interno |
| `receive_production_output_deprecated_4arg` | False | False | 0 | 0 | no | helper-interno |
| `register_idempotency` | False | False | 0 | 0 | no | helper-interno |
| `register_stock_movement` | False | False | 0 | 1 | sí | helper-interno |
| `register_supplier_payment` | False | True | 0 | 4 | sí | helper-interno |
| `regularize_sale_payment` | False | False | 0 | 0 | sí | helper-interno |
| `release_expired_reservations` | False | False | 0 | 0 | sí | helper-interno |
| `restore_transaction_snapshot` | False | False | 0 | 0 | sí | helper-interno |
| `save_product_cost_sheet` | False | True | 0 | 1 | sí | helper-interno |
| `sync_inventory_from_products` | False | False | 0 | 0 | sí | helper-interno |
| `transfer_requires_approval` | False | False | 0 | 0 | no | helper-interno |
| `update_transaction_taxes` | False | True | 0 | 1 | sí | helper-interno |
| `upsert_manual_exchange_rate_with_audit` | False | False | 0 | 1 | sí | helper-interno |
| `upsert_store_cost_template` | False | False | 0 | 0 | sí | helper-interno |
| `upsert_usage_aggregate` | False | False | 0 | 1 | sí | helper-interno |
| `validate_backup_registry_drift` | False | False | 0 | 0 | no | helper-interno |
| `validate_operation_date` | False | False | 0 | 0 | no | helper-interno |
| `validate_post_restore` | False | False | 0 | 0 | no | helper-interno |
| `validate_pre_restore_fk_integrity` | False | False | 0 | 0 | no | helper-interno |
| `validate_store_can_be_modified` | False | False | 0 | 1 | no | helper-interno |
| `validate_tenant_access` | False | False | 0 | 0 | no | helper-interno |
| `validate_transfer_operation_date` | False | False | 0 | 0 | no | helper-interno |
| `verify_audit_chain` | False | False | 0 | 0 | no | helper-interno |
| `void_reception_with_reversal` | False | False | 0 | 0 | sí | helper-interno |
