# W9.4-D — Rol ejecutor por función consumida en src/

| función | roles src | archivos (roles por archivo) |
|---|---|---|
| adjust_sale_payment | browser,session | app/api/transactions/[id]/adjust/route.ts[browser,session] |
| auto_match_bank_items | browser,service | app/api/bank-reconciliation/match/route.ts[browser,service] |
| bulk_assign_memberships | indirect,service | app/api/users/[id]/memberships/bulk/route.ts[indirect,service] |
| bulk_soft_delete_stores | browser,service | app/api/stores/bulk/execute/route.ts[browser,service] |
| calculate_abc | browser,service | app/api/abc-analysis/route.ts[browser,service] |
| calculate_service_distribution | indirect,service | app/api/received-services/distribute/route.ts[indirect,service] |
| cancel_transfer | browser | services/transfer-service.ts[browser] |
| check_bulk_ops_hourly_limit | browser,service | app/api/stores/bulk/execute/route.ts[browser,service] |
| cleanup_old_aggregates | indirect,service | app/api/cron/usage-sync/route.ts[indirect,service] |
| close_cash_shift | service | app/api/cash-closures/close/route.ts[service] |
| close_fiscal_period | browser,service | app/api/fiscal-close/route.ts[browser,service] |
| close_production_order_v2 | browser,session | app/api/production-orders/[id]/route.ts[browser,session] |
| confirm_inventory_adjustment | browser | components/views/terminal/views/inventory/InventoryAdjustmentsView.tsx[browser] |
| confirm_pending_reception | browser | hooks/api/useReceptions.ts[browser] |
| confirm_transfer | browser,service | app/api/transfers/[transferId]/confirm/route.ts[service]; services/transfer-service.ts[browser] |
| create_devolution | browser,service | app/api/devolutions/route.ts[browser,service] |
| create_devolution_v2 | browser,service | app/api/devolutions/route.ts[browser,service] |
| create_production_order_v2 | browser,service,session | app/api/production-orders/route.ts[browser,service,session] |
| create_purchase_order | browser,session | app/api/purchase-orders/route.ts[browser,session] |
| create_quotation | browser,service | app/api/quotations/route.ts[browser,service] |
| create_received_service_v2 | indirect,service | app/api/received-services/route.ts[indirect,service] |
| create_sale | browser | hooks/api/useTransactions.ts[browser] |
| create_sale_v2 | browser,service,user | app/api/pos/checkout/route.ts[service]; app/api/sync/batch/route.ts[browser,user] |
| create_store_with_membership | service | app/api/stores/route.ts[service] |
| create_transfer | browser,service,user | app/api/sync/batch/route.ts[browser,user]; app/api/transfers/route.ts[browser,service]; services/transfer-service.ts[browser] |
| create_vale_salida | service | app/api/vale-salida/route.ts[service] |
| detect_orphan_users | service | app/api/users/orphans/route.ts[service] |
| discover_backup_tables | browser,unknown | lib/backup/backup-service.ts[browser,unknown] |
| distribute_service_cost_v2 | indirect,service | app/api/received-services/distribute/route.ts[indirect,service] |
| duplicate_inventory_adjustment | browser,service | app/api/inventory/adjustments/duplicate/route.ts[browser,service] |
| duplicate_inventory_adjustment_v2 | browser,service | app/api/reverse/route.ts[browser,service] |
| generate_bulk_confirmation_token | browser,service | app/api/stores/bulk/generate-token/route.ts[browser,service] |
| generate_bulk_override_token | browser,service | app/api/stores/bulk/generate-override/route.ts[browser,service] |
| get_audit_logs | browser,unknown | lib/reports/data-fetcher.ts[browser,unknown] |
| get_backup_table_list | browser,unknown | lib/backup/backup-service.ts[browser,unknown] |
| get_batch_store_daily_kpis | browser | hooks/api/useMultiStoreDashboard.ts[browser] |
| get_cash_closures | browser,unknown | lib/reports/data-fetcher.ts[browser,unknown] |
| get_cash_report | browser,session | app/api/cash-report/route.ts[browser,session] |
| get_daily_expenses_aggregated | browser,unknown | lib/reports/data-fetcher.ts[browser,unknown] |
| get_daily_income_aggregated | browser,unknown | lib/reports/data-fetcher.ts[browser,unknown] |
| get_dashboard_kpis | browser | hooks/api/useDashboard.ts[browser] |
| get_global_max_operation_date | browser | hooks/api/useGlobalOperationDate.ts[browser] |
| get_low_stock_count | browser | components/views/terminal/views/sales_hub/SalesHubView.tsx[browser]; hooks/api/useStoreNotifications.ts[browser] |
| get_new_academy_cards | browser | app/api/academy/review/route.ts[browser] |
| get_paginated_products | anon,browser,service,unknown | app/tienda/[slug]/page.tsx[anon,browser,service]; hooks/api/useInventory.ts[browser]; lib/reports/data-fetcher.ts[browser,unknown] |
| get_paginated_products_v2 | browser | hooks/api/useCatalogProducts.ts[browser] |
| get_product_cost_analysis | indirect,service | app/api/received-services/analysis/route.ts[indirect,service] |
| get_product_stock_ledger_paginated | browser,unknown,user | app/api/inventory/[productId]/history/route.ts[browser,user]; hooks/api/useKardex.ts[browser]; lib/reports/data-fetcher.ts[browser,unknown] |
| get_products_for_pos | browser,user | app/api/inventory/products/route.ts[browser,user]; components/views/terminal/views/ipv/CatalogTable.tsx[browser]; hooks/api/useProducts.ts[browser] |
| get_products_for_reception | browser | hooks/api/useReceptionProductSearch.ts[browser] |
| get_profit_report | browser,unknown | lib/reports/data-fetcher.ts[browser,unknown] |
| get_purchases_book | service | app/api/fiscal/purchases-book/route.ts[service] |
| get_reorder_suggestions | browser,service | app/api/reorder-suggestions/route.ts[browser,service] |
| get_sales_book | service | app/api/fiscal/sales-book/route.ts[service] |
| get_sales_since_last_closure | browser | services/cash-service.ts[browser] |
| get_store_analytics_advanced | browser | hooks/api/useStoreAnalytics.ts[browser] |
| get_tax_report | service | app/api/fiscal/tax-report/route.ts[service] |
| get_tenant_cash_report | service | app/api/tenants/[id]/reports/cash/route.ts[service] |
| get_tenant_sales_summary | service | app/api/tenants/[id]/reports/sales/route.ts[service] |
| get_transactions | browser,unknown | hooks/api/useTransactions.ts[browser]; lib/reports/data-fetcher.ts[browser,unknown] |
| get_transferable_stores | browser | services/transfer-service.ts[browser] |
| get_transfers | browser,unknown | lib/reports/data-fetcher.ts[browser,unknown] |
| get_usage_summary | indirect,service | app/api/usage/summary/route.ts[indirect,service] |
| get_user_audit_history | service | app/api/users/[id]/audit-history/route.ts[service] |
| get_worker_commission_summary | browser,session,user | app/api/commissions/summary/route.ts[browser,session,user] |
| increment_user_usage | browser | services/usage-service.ts[browser] |
| lock_fiscal_period | browser,service | app/api/fiscal-close/route.ts[browser,service] |
| manage_user_memberships | browser | hooks/api/useUsers.ts[browser] |
| managed_create_user_v2 | service | app/api/users/managed-create/route.ts[service] |
| managed_delete_product | browser | hooks/api/useProducts.ts[browser] |
| managed_reset_password | service | app/api/users/reset-password/route.ts[service] |
| managed_revoke_membership | service | app/api/users/[id]/memberships/[membershipId]/route.ts[service] |
| managed_soft_delete_user | service | app/api/users/delete/route.ts[service] |
| managed_toggle_product_active | browser | hooks/api/useProducts.ts[browser] |
| managed_toggle_user_status | service | app/api/users/toggle-status/route.ts[service] |
| managed_update_membership | service | app/api/users/[id]/memberships/[membershipId]/route.ts[service] |
| managed_update_tenant_plan | service | app/api/billing/webhook/route.ts[service] |
| managed_update_user | service | app/api/users/[id]/route.ts[service] |
| perform_inventory_adjustment | browser,user | app/api/sync/batch/route.ts[browser,user]; hooks/api/useDocumentActions.ts[browser]; hooks/api/useInventory.ts[browser] |
| process_inventory_adjustment | browser,user | app/api/inventory/adjustments/route.ts[browser,user] |
| process_pick3_transaction | browser | components/views/terminal/views/pick3/BetEntryDialog.tsx[browser] |
| purge_old_reset_snapshots | browser,service | app/api/cron/purge-snapshots/route.ts[browser,service] |
| receive_against_po | browser,session | app/api/purchase-orders/[id]/route.ts[browser,session] |
| receive_production_output | browser,session | app/api/production-orders/[id]/route.ts[browser,session] |
| receive_to_warehouse | browser,service | app/api/receive-to-warehouse/route.ts[browser,service] |
| reconcile_orphan_user | service | app/api/users/[id]/reconcile/route.ts[service] |
| register_reception | browser,user | app/api/inventory/receptions/route.ts[browser,user]; app/api/sync/batch/route.ts[browser,user]; hooks/api/useInventory.ts[browser] |
| register_stock_movement | browser,user | app/api/inventory/adjust/route.ts[browser,user] |
| register_supplier_payment | browser,session | app/api/accounts-payable/bulk-pay/route.ts[browser,session]; app/api/payments/route.ts[browser,session]; app/api/production-orders/[id]/payments/route.ts[browse |
| reopen_cash_shift | service | app/api/cash-closures/reopen/route.ts[service] |
| reset_store_data | service | app/api/stores/reset/route.ts[service] |
| reverse_adjustment | browser,service | app/api/reverse/route.ts[browser,service] |
| reverse_devolution | browser,service | app/api/reverse/route.ts[browser,service] |
| reverse_production_order | browser,service | app/api/reverse/route.ts[browser,service] |
| reverse_receipt | browser,service | app/api/reverse/route.ts[browser,service] |
| reverse_receipt_v2 | browser,service | app/api/reverse/route.ts[browser,service]; hooks/api/useReceptions.ts[browser] |
| reverse_transaction | browser,service | app/api/reverse/route.ts[browser,service] |
| reverse_transaction_v2 | browser,service | app/api/reverse/route.ts[browser,service] |
| reverse_transfer | browser,service | app/api/reverse/route.ts[browser,service] |
| reverse_vale_salida | service | app/api/vale-salida/[id]/reverse/route.ts[service] |
| save_product_cost_sheet | service | app/api/product-cost-sheets/auto-generate/route.ts[service] |
| set_config | service | lib/rls-middleware.ts[service] |
| set_purchase_order_status | browser,session | app/api/purchase-orders/[id]/route.ts[browser,session] |
| set_received_service_status | indirect,service | app/api/received-services/route.ts[indirect,service] |
| soft_delete_store | indirect,service | app/api/stores/bulk/route.ts[indirect,service]; app/api/stores/route.ts[service] |
| update_reception_items | browser,session | app/api/inventory/receptions/[id]/route.ts[browser,session] |
| update_transaction_taxes | browser | components/views/terminal/views/sales/TransactionDetailsModal.tsx[browser] |
| upsert_manual_exchange_rate_with_audit | indirect,service | app/api/exchange-rates/manual/route.ts[indirect,service] |
| upsert_usage_aggregate | indirect,service | lib/usage-tracker.ts[indirect,service] |
| validate_store_can_be_modified | browser,service | app/api/stores/bulk/preview/route.ts[browser,service] |
| void_closed_production_order | browser,session | app/api/production-orders/[id]/void/route.ts[browser,session] |
| void_inventory_adjustment | browser | components/views/terminal/views/inventory/InventoryAdjustmentsView.tsx[browser] |
| void_pending_reception | browser | hooks/api/useReceptions.ts[browser] |
| void_received_service_with_reversal | indirect,service | app/api/received-services/route.ts[indirect,service] |
| void_transaction | browser | hooks/api/useDocumentActions.ts[browser] |
| withdraw_production_item | browser,session | app/api/production-orders/[id]/withdraw/route.ts[browser,session] |
