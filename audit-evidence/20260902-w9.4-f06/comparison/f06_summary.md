# W9.4-C/D/E/F — Resumen clasificación F-06

SD total: 242
- C0 (sin exposición, no tocar): 20
- C1 (exposición legítima usuario/BD): 30
- C1B (consumidor solo BD interno): 55
- C2 (limitable a service_role): 53
- C3 (exposición peligrosa): 23
- C4 (legacy sin consumidores): 61

## TOP 40 por riesgo técnico

| # | Firma | exp(P/A/Auth) | peligro | guard | consumidor | clase |
|---|-------|---------------|---------|-------|------------|-------|
| 1 | `public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_p` | PAU | MUT | si:has_store_access_as | NINGUNO | C4 |
| 2 | `public.link_receipts_to_service(p_service_id uuid, p_receipt_ids jsonb, p_user_id uuid)` | PAU | MUT | si:has_store_access | NINGUNO | C4 |
| 3 | `public.release_expired_reservations()` | PAU | MUT | NO | NINGUNO | C4 |
| 4 | `public.update_receipt_item_tasa(p_receipt_item_id uuid, p_new_tasa_cambio_recepcion numeri` | PAU | MUT | si:has_store_access_as | NINGUNO | C4 |
| 5 | `public.bulk_assign_memberships(p_user_id uuid, p_assignments jsonb)` | PAU | MUT | si:has_store_role,is_admin | src(service) | C2 |
| 6 | `public.close_cash_shift(p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers nu` | PAU | MUT | si:has_store_access_as | src(service) | C2 |
| 7 | `public.create_devolution_v2(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid,` | PAU | MUT | si:has_store_access_as | src(service) | C2 |
| 8 | `public.create_production_order_v2(p_store_id uuid, p_order_type text, p_customer_name text` | PAU | MUT | si:check_idempotency,has_store_access_as | src(service) | C2 |
| 9 | `public.create_received_service_v2(p_store_id uuid, p_supplier text, p_total_amount numeric` | PAU | MUT | si:has_store_access | src(service) | C2 |
| 10 | `public.create_store_with_membership(p_name text, p_address text, p_created_by uuid, p_max_` | PAU | MUT | auth.uid | src(service) | C2 |
| 11 | `public.detect_orphan_users()` | PAU | MUT | si:is_admin | src(service) | C2 |
| 12 | `public.distribute_service_cost_v2(p_service_id uuid, p_user_id uuid)` | PAU | MUT | si:has_store_access | src(service) | C2 |
| 13 | `public.duplicate_inventory_adjustment_v2(p_original_id uuid, p_user_id uuid)` | PAU | MUT | si:has_store_access_as | src(service) | C2 |
| 14 | `public.managed_create_user_v2(p_email text, p_full_name text, p_role user_role, p_plan pla` | PAU | MUT | si:has_store_access | src(service) | C2 |
| 15 | `public.managed_reset_password(p_user_id uuid, p_caller_id uuid)` | PAU | MUT | auth.uid | src(service) | C2 |
| 16 | `public.managed_revoke_membership(p_membership_id uuid, p_caller_id uuid)` | PAU | MUT | si:has_store_role | src(service) | C2 |
| 17 | `public.managed_soft_delete_user(p_user_id uuid, p_reason text, p_caller_id uuid)` | PAU | MUT | auth.uid | src(service) | C2 |
| 18 | `public.managed_toggle_user_status(p_user_id uuid, p_is_active boolean, p_caller_id uuid)` | PAU | MUT | auth.uid | src(service) | C2 |
| 19 | `public.managed_update_membership(p_membership_id uuid, p_role user_role, p_status text, p_` | PAU | MUT | si:has_store_role | src(service) | C2 |
| 20 | `public.managed_update_tenant_plan(p_tenant_id uuid, p_plan plan_t, p_subscription_status t` | PAU | MUT | auth.uid | src(service) | C2 |
| 21 | `public.managed_update_user(p_user_id uuid, p_full_name text, p_role user_role, p_role_id u` | PAU | MUT | auth.uid | src(service) | C2 |
| 22 | `public.reconcile_orphan_user(p_auth_user_id uuid, p_action text, p_reason text, p_caller_i` | PAU | MUT | si:is_admin | src(service) | C2 |
| 23 | `public.reopen_cash_shift(p_closure_id uuid, p_reason text, p_user_id uuid)` | PAU | MUT | si:has_store_role_as | src(service) | C2 |
| 24 | `public.reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid)` | PAU | MUT | si:has_store_access_as | src(service);scripts | C2 |
| 25 | `public.reverse_transaction_v2(p_transaction_id uuid, p_reason text, p_user_id uuid)` | PAU | MUT | si:has_store_access_as | src(service) | C2 |
| 26 | `public.set_received_service_status(p_service_id uuid, p_new_status text, p_user_id uuid, p` | PAU | MUT | si:has_store_access | src(service) | C2 |
| 27 | `public.void_received_service_with_reversal(p_service_id uuid, p_user_id uuid, p_reason tex` | PAU | MUT | si:has_store_access | src(service) | C2 |
| 28 | `public.audit_cash_closures_changes()` | PAU | MUT | auth.uid | TRIGGER | C1B |
| 29 | `public.audit_commission_payments_changes()` | PAU | MUT | auth.uid | TRIGGER | C1B |
| 30 | `public.audit_fiscal_closings_changes()` | PAU | MUT | auth.uid | TRIGGER | C1B |
| 31 | `public.audit_payment_transactions_changes()` | PAU | MUT | NO | TRIGGER | C1B |
| 32 | `public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method t` | PAU | MUT | si:has_store_access_as,has_store_role_as | src(service,user) | C3 |
| 33 | `public.receive_against_po(p_po_id uuid, p_received_items jsonb, p_user_id uuid, p_receptio` | PAU | MUT | si:has_store_access | src(indirect) | C3 |
| 34 | `public.register_reception(p_store_id uuid, p_supplier text, p_reception_date timestamp wit` | PAU | MUT | si:has_store_access_as | src(user);scripts;bd:receive_against_po | C3 |
| 35 | `public.reverse_commissions_on_sale_void()` | PAU | MUT | NO | TRIGGER | C1B |
| 36 | `public.reverse_receipt_v2(p_receipt_id uuid, p_reason text, p_user_id uuid)` | PAU | MUT | NO | src(service,user) | C3 |
| 37 | `public.set_purchase_order_status(p_po_id uuid, p_new_status purchase_status_enum, p_user_i` | PAU | MUT | si:has_store_access | src(indirect) | C3 |
| 38 | `public.void_closed_production_order(p_order_id uuid, p_reason text, p_user_id uuid)` | PAU | MUT | si:has_store_access_as | src(indirect) | C3 |
| 39 | `public.void_pending_reception(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operatio` | PAU | MUT | si:has_store_access_as | src(user) | C3 |
| 40 | `public.void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp w` | PAU | MUT | si:has_store_access_as | src(user);scripts | C3 |

## Desglose por clase (listas)

### C3 (23)
- `public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_dis` [PAU] sens:audit_logs; guard:has_store_access_as,has_store_role_as; auth.uid ← src=src/app/api/pos/checkout/route.ts,src/app/api/sync/batch/route.ts(service,user)
- `public.receive_against_po(p_po_id uuid, p_received_items jsonb, p_user_id uuid, p_reception_date tim` [PAU] sens:audit_logs; guard:has_store_access ← src=src/app/api/purchase-orders/[id]/route.ts(indirect)
- `public.register_reception(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zon` [PAU] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/app/api/inventory/receptions/route.ts,src/app/api/sync/batch/route.ts(user); scripts; bd=receive_against_po
- `public.reverse_receipt_v2(p_receipt_id uuid, p_reason text, p_user_id uuid)` [PAU] sens:audit_logs ← src=src/app/api/reverse/route.ts,src/hooks/api/useReceptions.ts(service,user)
- `public.set_purchase_order_status(p_po_id uuid, p_new_status purchase_status_enum, p_user_id uuid, p_` [PAU] sens:audit_logs; guard:has_store_access ← src=src/app/api/purchase-orders/[id]/route.ts(indirect)
- `public.void_closed_production_order(p_order_id uuid, p_reason text, p_user_id uuid)` [PAU] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/app/api/production-orders/[id]/void/route.ts(indirect)
- `public.void_pending_reception(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date tim` [PAU] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/hooks/api/useReceptions.ts(user)
- `public.void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time z` [PAU] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/hooks/api/useDocumentActions.ts(user); scripts
- `public.adjust_sale_payment(p_transaction_id uuid, p_user_id uuid, p_payment_method text, p_cash_amou` [--U] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/app/api/transactions/[id]/adjust/route.ts(indirect)
- `public.cancel_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid)` [--U] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/services/transfer-service.ts(user); scripts
- `public.close_production_order_v2(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_final_amount ` [--U] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/app/api/production-orders/[id]/route.ts(indirect)
- `public.confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_operation_date timestamp with time zon` [--U] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/app/api/transfers/[transferId]/confirm/route.ts,src/services/transfer-service.ts(service,user)
- `public.create_purchase_order(p_store_id uuid, p_supplier_name text, p_supplier_id uuid, p_po_number ` [--U] sens:audit_logs; guard:has_store_access ← src=src/app/api/purchase-orders/route.ts(indirect)
- `public.create_sale(p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb, p_subto` [--U] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/hooks/api/useTransactions.ts(user); scripts; e2e
- `public.create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes t` [--U] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/app/api/sync/batch/route.ts,src/app/api/transfers/route.ts(service,user); scripts
- `public.increment_user_usage(p_user_id uuid, p_action_type text, p_limit integer)` [--U] sens:user_usage ← src=src/services/usage-service.ts(user)
- `public.manage_user_memberships(p_user_id uuid, p_memberships jsonb)` [--U] sens:profiles,user_store_memberships; setRole; guard:is_store_manager; auth.uid ← src=src/hooks/api/useUsers.ts(user)
- `public.managed_delete_product(p_product_id uuid)` [--U] sens:audit_logs; guard:has_store_access; auth.uid ← src=src/hooks/api/useProducts.ts(user)
- `public.managed_toggle_product_active(p_product_id uuid, p_is_active boolean)` [--U] sens:audit_logs; guard:has_store_access; auth.uid ← src=src/hooks/api/useProducts.ts(user)
- `public.process_pick3_transaction(p_user_id uuid, p_type text, p_amount bigint, p_reference_draw_id u` [--U] sens:pick3_ledger,pick3_profiles ← src=src/components/views/terminal/views/pick3/BetEntryDialog.tsx(user); bd=on_pick3_profile_initial_bankroll
- `public.receive_production_output(p_order_id uuid, p_product_id uuid, p_quantity numeric, p_store_id ` [--U] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/app/api/production-orders/[id]/route.ts(indirect); bd=close_production_order_v2,receive_production_output_deprecated_4arg
- `public.update_reception_items(p_receipt_id uuid, p_item_updates jsonb, p_user_id uuid)` [--U] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/app/api/inventory/receptions/[id]/route.ts(indirect)
- `public.update_transaction_taxes(p_transaction_id uuid, p_applied_taxes jsonb, p_tax_amount numeric, ` [--U] sens:audit_logs; guard:has_role,is_admin; auth.uid ← src=src/components/views/terminal/views/sales/TransactionDetailsModal.tsx(user)

### C2 (53)
- `public.bulk_assign_memberships(p_user_id uuid, p_assignments jsonb)` [PAU] sens:user_audit_log,user_store_memberships; setRole; guard:has_store_role,is_admin; auth.uid ← src=src/app/api/users/[id]/memberships/bulk/route.ts(service)
- `public.close_cash_shift(p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_n` [PAU] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/app/api/cash-closures/close/route.ts(service)
- `public.create_devolution_v2(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_origina` [PAU] sens:audit_logs,store_credit_ledger; guard:has_store_access_as; auth.uid ← src=src/app/api/devolutions/route.ts(service)
- `public.create_production_order_v2(p_store_id uuid, p_order_type text, p_customer_name text, p_custom` [PAU] sens:audit_logs; guard:check_idempotency,has_store_access_as; auth.uid ← src=src/app/api/production-orders/route.ts(service)
- `public.create_received_service_v2(p_store_id uuid, p_supplier text, p_total_amount numeric, p_servic` [PAU] sens:audit_logs; guard:has_store_access; auth.uid ← src=src/app/api/received-services/route.ts(service)
- `public.create_store_with_membership(p_name text, p_address text, p_created_by uuid, p_max_stores int` [PAU] sens:audit_logs,profiles,stores; auth.uid ← src=src/app/api/stores/route.ts(service)
- `public.detect_orphan_users()` [PAU] sens:orphaned_users_log; guard:is_admin ← src=src/app/api/users/orphans/route.ts(service)
- `public.distribute_service_cost_v2(p_service_id uuid, p_user_id uuid)` [PAU] sens:audit_logs; guard:has_store_access; auth.uid ← src=src/app/api/received-services/distribute/route.ts(service)
- `public.duplicate_inventory_adjustment_v2(p_original_id uuid, p_user_id uuid)` [PAU] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/app/api/reverse/route.ts(service)
- `public.managed_create_user_v2(p_email text, p_full_name text, p_role user_role, p_plan plan_t, p_sto` [PAU] sens:profiles,user_audit_log,user_store_memberships; setRole; guard:has_store_access; auth.uid ← src=src/app/api/users/managed-create/route.ts(service)
- `public.managed_reset_password(p_user_id uuid, p_caller_id uuid)` [PAU] sens:user_audit_log; auth.uid ← src=src/app/api/users/reset-password/route.ts(service)
- `public.managed_revoke_membership(p_membership_id uuid, p_caller_id uuid)` [PAU] sens:profiles,user_audit_log,user_store_memberships; GRANT; guard:has_store_role; auth.uid ← src=src/app/api/users/[id]/memberships/[membershipId]/route.ts(service)
- `public.managed_soft_delete_user(p_user_id uuid, p_reason text, p_caller_id uuid)` [PAU] sens:profiles,user_audit_log,user_store_memberships; GRANT; auth.uid ← src=src/app/api/users/delete/route.ts(service)
- `public.managed_toggle_user_status(p_user_id uuid, p_is_active boolean, p_caller_id uuid)` [PAU] sens:profiles,user_audit_log; auth.uid ← src=src/app/api/users/toggle-status/route.ts(service)
- `public.managed_update_membership(p_membership_id uuid, p_role user_role, p_status text, p_caller_id ` [PAU] sens:user_audit_log,user_store_memberships; setRole; guard:has_store_role; auth.uid ← src=src/app/api/users/[id]/memberships/[membershipId]/route.ts(service)
- `public.managed_update_tenant_plan(p_tenant_id uuid, p_plan plan_t, p_subscription_status text, p_cal` [PAU] sens:profiles,user_audit_log; auth.uid ← src=src/app/api/billing/webhook/route.ts(service)
- `public.managed_update_user(p_user_id uuid, p_full_name text, p_role user_role, p_role_id uuid, p_is_` [PAU] sens:profiles,user_audit_log; setRole; auth.uid ← src=src/app/api/users/[id]/route.ts(service)
- `public.reconcile_orphan_user(p_auth_user_id uuid, p_action text, p_reason text, p_caller_id uuid)` [PAU] sens:orphaned_users_log,profiles,user_audit_log; guard:is_admin; auth.uid ← src=src/app/api/users/[id]/reconcile/route.ts(service)
- `public.reopen_cash_shift(p_closure_id uuid, p_reason text, p_user_id uuid)` [PAU] sens:audit_logs; guard:has_store_role_as; auth.uid ← src=src/app/api/cash-closures/reopen/route.ts(service)
- `public.reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid)` [PAU] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/app/api/reverse/route.ts(service); scripts
- `public.reverse_transaction_v2(p_transaction_id uuid, p_reason text, p_user_id uuid)` [PAU] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/app/api/reverse/route.ts(service)
- `public.set_received_service_status(p_service_id uuid, p_new_status text, p_user_id uuid, p_reason te` [PAU] sens:audit_logs; guard:has_store_access; auth.uid ← src=src/app/api/received-services/route.ts(service)
- `public.void_received_service_with_reversal(p_service_id uuid, p_user_id uuid, p_reason text, p_opera` [PAU] sens:audit_logs; guard:has_store_access; auth.uid ← src=src/app/api/received-services/route.ts(service)
- `public.cleanup_old_aggregates(p_days integer)` [--U] sens:usage_aggregates ← src=src/app/api/cron/usage-sync/route.ts(service)
- `public.close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid)` [--U] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/app/api/fiscal-close/route.ts(service)
- `public.create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid, p_notes text, ` [--U] sens:audit_logs; guard:check_idempotency,has_store_access_as; auth.uid ← src=src/app/api/vale-salida/route.ts(service)
- `public.purge_old_reset_snapshots(p_days integer)` [--U] sens:store_reset_snapshots ← src=src/app/api/cron/purge-snapshots/route.ts(service)
- `public.receive_to_warehouse(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost nume` [--U] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/app/api/receive-to-warehouse/route.ts(service)
- `public.reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid)` [--U] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/app/api/reverse/route.ts(service); scripts
- `public.reverse_vale_salida(p_slip_id uuid, p_reason text, p_user_id uuid)` [--U] sens:audit_logs; guard:has_store_access_as; auth.uid ← src=src/app/api/vale-salida/[id]/reverse/route.ts(service)
- `public.soft_delete_store(p_store_id uuid, p_deleted_by uuid)` [--U] sens:audit_logs,profiles,stores; auth.uid ← src=src/app/api/stores/bulk/route.ts,src/app/api/stores/route.ts(service); bd=bulk_soft_delete_stores
- `public.upsert_usage_aggregate(p_bucket_start timestamp with time zone, p_bucket_end timestamp with t` [--U] sens:usage_aggregates ← src=src/lib/usage-tracker.ts(service)
- `public.get_purchases_book(p_store_id uuid, p_year integer, p_month integer)` [PAU] guard:has_store_access,is_admin ← src=src/app/api/fiscal/purchases-book/route.ts(service)
- `public.get_sales_book(p_store_id uuid, p_year integer, p_month integer)` [PAU] guard:has_store_access,is_admin ← src=src/app/api/fiscal/sales-book/route.ts(service)
- `public.get_tax_report(p_store_id uuid, p_year integer, p_month integer)` [PAU] guard:has_store_access,is_admin ← src=src/app/api/fiscal/tax-report/route.ts(service)
- `public.get_tenant_cash_report(p_tenant_id uuid, p_start_date timestamp with time zone, p_end_date ti` [PAU] guard:is_admin; auth.uid ← src=src/app/api/tenants/[id]/reports/cash/route.ts(service)
- `public.get_tenant_sales_summary(p_tenant_id uuid, p_days integer)` [PAU] guard:is_admin; auth.uid ← src=src/app/api/tenants/[id]/reports/sales/route.ts(service)
- `public.get_user_audit_history(p_user_id uuid, p_limit integer, p_offset integer)` [PAU] guard:is_admin ← src=src/app/api/users/[id]/audit-history/route.ts(service)
- `public.auto_match_bank_items(p_statement_id uuid, p_user_id uuid)` [--U] guard:has_store_access_as; auth.uid ← src=src/app/api/bank-reconciliation/match/route.ts(service)
- `public.calculate_abc(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid)` [--U] guard:has_store_access_as; auth.uid ← src=src/app/api/abc-analysis/route.ts(service)
- `public.calculate_service_distribution(p_service_id uuid)` [--U] lectura/simple ← src=src/app/api/received-services/distribute/route.ts(service)
- `public.create_quotation(p_store_id uuid, p_items jsonb, p_user_id uuid, p_customer_id uuid, p_custom` [--U] guard:has_store_access_as; auth.uid ← src=src/app/api/quotations/route.ts(service)
- `public.create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid, p_notes text, ` [--U] lectura/simple ← src=src/app/api/vale-salida/route.ts(service)
- `public.duplicate_inventory_adjustment(p_original_id uuid, p_user_id uuid)` [--U] guard:has_store_access_as; auth.uid ← src=src/app/api/inventory/adjustments/duplicate/route.ts(service); scripts
- `public.get_product_cost_analysis(p_product_id uuid, p_store_id uuid)` [--U] lectura/simple ← src=src/app/api/received-services/analysis/route.ts(service)
- `public.get_reorder_suggestions(p_store_id uuid, p_user_id uuid)` [--U] guard:has_store_access_as; auth.uid ← src=src/app/api/reorder-suggestions/route.ts(service)
- `public.get_usage_summary(p_hours integer)` [--U] lectura/simple ← src=src/app/api/usage/summary/route.ts(service)
- `public.lock_fiscal_period(p_store_id uuid, p_year integer, p_month integer)` [--U] auth.uid ← src=src/app/api/fiscal-close/route.ts(service)
- `public.reverse_adjustment(p_adjustment_id uuid, p_reason text, p_user_id uuid)` [--U] guard:has_store_access_as; auth.uid ← src=src/app/api/reverse/route.ts(service); scripts
- `public.reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid)` [--U] guard:has_store_access_as; auth.uid ← src=src/app/api/reverse/route.ts(service); scripts
- `public.reverse_receipt(p_receipt_id uuid, p_reason text, p_user_id uuid)` [--U] guard:has_store_access_as; auth.uid ← src=src/app/api/reverse/route.ts(service); scripts
- `public.reverse_transaction(p_transaction_id uuid, p_reason text, p_user_id uuid)` [--U] guard:has_store_access_as; auth.uid ← src=src/app/api/reverse/route.ts(service); scripts
- `public.validate_store_can_be_modified(p_store_id uuid, p_check_type text)` [--U] lectura/simple ← src=src/app/api/stores/bulk/preview/route.ts(service); bd=bulk_soft_delete_stores,reset_store_data

### C4 (61)
- `public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_met` [PAU] sens:audit_logs; guard:has_store_access_as; auth.uid ← SIN CONSUMIDORES
- `public.link_receipts_to_service(p_service_id uuid, p_receipt_ids jsonb, p_user_id uuid)` [PAU] sens:audit_logs; guard:has_store_access; auth.uid ← SIN CONSUMIDORES
- `public.release_expired_reservations()` [PAU] sens:audit_logs ← SIN CONSUMIDORES
- `public.update_receipt_item_tasa(p_receipt_item_id uuid, p_new_tasa_cambio_recepcion numeric, p_new_m` [PAU] sens:audit_logs,receipt_tasa_audit; guard:has_store_access_as; auth.uid ← SIN CONSUMIDORES
- `public.audit_store_access_changes()` [--U] sens:audit_logs; auth.uid ← SIN CONSUMIDORES
- `public.cleanup_expired_idempotency_keys()` [--U] sens:idempotency_keys ← SIN CONSUMIDORES
- `public.fn_process_sale(p_items jsonb, p_cashier_id uuid, p_payment_method text)` [--U] sens:audit_logs; auth.uid ← SIN CONSUMIDORES
- `public.fn_void_receipt(p_receipt_id uuid, p_user_id uuid)` [--U] sens:audit_logs ← SIN CONSUMIDORES
- `public.generate_confirmation_token(p_session_id uuid)` [--U] sens:restore_sessions ← SIN CONSUMIDORES
- `public.generate_inventory_snapshot(p_store_id uuid)` [--U] sens:inventory_snapshots ← SIN CONSUMIDORES
- `public.log_audit_event(p_action text, p_payload jsonb, p_store_id uuid)` [--U] sens:audit_events; auth.uid ← SIN CONSUMIDORES
- `public.managed_create_store(p_name text, p_address text)` [--U] sens:stores; auth.uid ← SIN CONSUMIDORES
- `public.managed_create_user(p_max_users integer, p_max_stores integer, p_role text, p_full_name text,` [--U] sens:profiles,user_store_memberships; setRole; guard:has_store_access; auth.uid ← SIN CONSUMIDORES
- `public.managed_delete_user(p_user_id uuid)` [--U] sens:profiles,user_store_memberships; guard:is_admin; auth.uid ← SIN CONSUMIDORES
- `public.reconcile_stock(p_store_id uuid, p_fix boolean, p_user_id uuid)` [--U] sens:audit_logs; guard:has_store_role,is_admin; auth.uid ← SIN CONSUMIDORES
- `public.save_ai_api_key(p_provider text, p_api_key text, p_label text)` [--U] sens:ai_api_keys; auth.uid ← SIN CONSUMIDORES
- `public.set_transfer_approval_rule(p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric, p_t` [--U] sens:audit_logs; guard:has_store_access_as,has_store_role; auth.uid ← SIN CONSUMIDORES
- `public.upsert_store_cost_template(p_store_id uuid, p_template_id text, p_template_data jsonb, p_moda` [--U] sens:store_cost_templates; guard:has_store_role,is_global_admin ← SIN CONSUMIDORES
- `public.bulk_update_products(_products jsonb)` [PAU] lectura/simple ← SIN CONSUMIDORES
- `public.check_tenant_store_quota(p_tenant_id uuid, p_plan plan_t)` [PAU] lectura/simple ← SIN CONSUMIDORES
- `public.is_tenant_member(p_tenant_id uuid)` [PAU] lectura/simple ← SIN CONSUMIDORES
- `public.validate_tenant_access(p_user_id uuid, p_store_id uuid)` [PAU] lectura/simple ← SIN CONSUMIDORES
- `public.apply_physical_count(p_count_id uuid, p_user_id uuid, p_apply_zero_diffs boolean)` [--U] guard:has_store_access_as; auth.uid ← SIN CONSUMIDORES
- `public.approve_transfer(p_transfer_id uuid, p_user_id uuid)` [--U] guard:has_store_access_as; auth.uid ← SIN CONSUMIDORES
- `public.can_create_user_with_role(p_creator_id uuid, p_role_name text)` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.can_void_receipt(p_receipt_id uuid)` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.cancel_reception(p_reception_id uuid)` [--U] auth.uid ← SIN CONSUMIDORES
- `public.compensate_inventory_error(p_store_id uuid, p_original_movement_id uuid, p_reason text, p_use` [--U] guard:has_store_access_as; auth.uid ← SIN CONSUMIDORES
- `public.create_physical_count(p_store_id uuid, p_user_id uuid, p_notes text)` [--U] guard:has_store_access_as; auth.uid ← SIN CONSUMIDORES
- `public.deduct_stock(p_store_id uuid, p_product_id uuid, p_quantity numeric)` [--U] auth.uid ← SIN CONSUMIDORES
- `public.ensure_fiscal_period(p_store_id uuid, p_year integer, p_month integer)` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.fn_log_system_health(p_payload jsonb)` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.fn_process_receipt(p_items jsonb, p_user_id uuid, p_reference text)` [--U] auth.uid ← SIN CONSUMIDORES
- `public.fn_process_receipt(p_items jsonb, p_user_id uuid, p_store_id uuid, p_reference text)` [--U] auth.uid ← SIN CONSUMIDORES
- `public.get_ai_api_key(p_user_id uuid, p_provider text)` [--U] guard:is_admin; auth.uid ← SIN CONSUMIDORES
- `public.get_inventory_report(p_from_date timestamp with time zone, p_to_date timestamp with time zone` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.get_inventory_report(p_store_id uuid, p_from_date timestamp with time zone, p_to_date timesta` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.get_inventory_with_costs(p_store_id uuid)` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.get_my_sales(p_search_query text, p_status text, p_date_from timestamp with time zone, p_date` [--U] auth.uid ← SIN CONSUMIDORES
- `public.get_my_sales(p_search_query text, p_status text, p_payment_method text, p_date_from timestamp` [--U] auth.uid ← SIN CONSUMIDORES
- `public.get_my_sales_summary(p_period text)` [--U] auth.uid ← SIN CONSUMIDORES
- `public.get_or_create_product_cost_sheet(p_product_id uuid, p_store_id uuid, p_template_id text, p_mo` [--U] guard:has_store_role,is_global_admin ← SIN CONSUMIDORES
- `public.get_product_stock_ledger(p_product_id uuid, p_store_id uuid)` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.get_product_variants_counts()` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.get_transactions_with_profit(p_store_id uuid, p_search_term text, p_date_from timestamp witho` [--U] guard:has_store_access,is_admin; auth.uid ← SIN CONSUMIDORES
- `public.get_usage_forecast()` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.get_user_role()` [--U] auth.uid ← SIN CONSUMIDORES
- `public.is_admin_check(p_user_id uuid)` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.is_manager_of_store(p_store_id uuid)` [--U] auth.uid ← SIN CONSUMIDORES
- `public.is_role_not_changed(p_user_id uuid, p_new_role user_role, p_new_role_id uuid)` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.is_user_creator(p_target_user_id uuid)` [--U] auth.uid ← SIN CONSUMIDORES
- `public.mark_expired_lots(p_store_id uuid)` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.process_stock_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reas` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.record_counted_quantity(p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_use` [--U] guard:has_store_access_as; auth.uid ← SIN CONSUMIDORES
- `public.record_sale_movement(p_store_id uuid, p_product_id uuid, p_variant_id uuid, p_quantity intege` [--U] auth.uid ← SIN CONSUMIDORES
- `public.reject_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid)` [--U] guard:has_store_access_as; auth.uid ← SIN CONSUMIDORES
- `public.sync_inventory_from_products(p_store_id uuid)` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.transfer_requires_approval(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.validate_backup_registry_drift()` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.validate_transfer_operation_date(p_new_date timestamp with time zone, p_origin_store_id uuid,` [--U] lectura/simple ← SIN CONSUMIDORES
- `public.verify_audit_chain()` [--U] lectura/simple ← SIN CONSUMIDORES

### C1B (55)
- `public.audit_cash_closures_changes()` [PAU] sens:audit_logs; auth.uid ← TRIGGER
- `public.audit_commission_payments_changes()` [PAU] sens:audit_logs; auth.uid ← TRIGGER
- `public.audit_fiscal_closings_changes()` [PAU] sens:audit_logs; auth.uid ← TRIGGER
- `public.audit_payment_transactions_changes()` [PAU] sens:audit_logs ← TRIGGER
- `public.reverse_commissions_on_sale_void()` [PAU] sens:audit_logs ← TRIGGER
- `public.adjust_total_amount(p_transaction_id uuid, p_new_total numeric, p_reason text)` [--U] sens:audit_logs; guard:is_admin; auth.uid ← bd=protect_transactions_total_amount
- `public.audit_backup_restore_protected_change()` [--U] sens:audit_logs; auth.uid ← TRIGGER
- `public.audit_product_changes()` [--U] sens:audit_logs; auth.uid ← TRIGGER
- `public.audit_profile_changes()` [--U] sens:audit_logs; auth.uid ← TRIGGER
- `public.audit_role_changes()` [--U] sens:user_audit_log; auth.uid ← TRIGGER
- `public.audit_store_changes()` [--U] sens:audit_logs; auth.uid ← TRIGGER
- `public.create_pre_restore_snapshot(p_store_id uuid)` [--U] dynSQL ← bd=restore_store_backup
- `public.log_transaction_changes()` [--U] sens:audit_logs; auth.uid ← TRIGGER
- `public.on_auth_user_created()` [--U] sens:profiles,user_audit_log ← SIN CONSUMIDORES
- `public.validate_pre_restore_fk_integrity(p_store_id uuid)` [--U] dynSQL ← bd=restore_store_backup
- `public.withdraw_production_item_v3(p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid, p` [--U] sens:audit_logs; guard:check_idempotency,has_store_access_as; auth.uid ← bd=create_vale_salida
- `public.calculate_receipt_total_cup(p_receipt_id uuid)` [PAU] lectura/simple ← bd=confirm_pending_reception,update_receipt_item_tasa,update_reception_items
- `public.current_user_tenant_id()` [PAU] auth.uid ← bd=current_user_store_ids,is_admin_with_access,is_tenant_member; policy
- `public.enforce_ledger_append_only()` [PAU] lectura/simple ← TRIGGER
- `public.ensure_product_barcode()` [PAU] lectura/simple ← TRIGGER
- `public.generate_internal_barcode()` [PAU] lectura/simple ← bd=ensure_product_barcode
- `public.has_management_access_as(p_user_id uuid, p_store_id uuid)` [PAU] lectura/simple ← bd=reset_store_data
- `public.has_store_role(p_user_id uuid, p_store_id uuid, p_roles text[])` [PAU] auth.uid ← bd=bulk_assign_memberships,get_or_create_product_cost_sheet,managed_revoke_membership; policy
- `public.has_store_role_as(p_user_id uuid, p_store_id uuid, p_roles text[])` [PAU] lectura/simple ← bd=create_sale_v2,reopen_cash_shift
- `public.is_admin_with_access(p_store_id uuid)` [PAU] guard:has_store_access,is_admin ← policy
- `public.prevent_received_service_edit()` [PAU] lectura/simple ← TRIGGER
- `public.register_idempotency(p_key text, p_operation text, p_record_id uuid, p_param_hash text, p_res` [PAU] guard:check_idempotency ← bd=create_production_order_v2,create_vale_salida,withdraw_production_item_deprecated_6arg
- `public.validate_operation_date(p_new_date timestamp with time zone, p_store_id uuid)` [PAU] lectura/simple ← bd=create_received_service_v2,create_sale,create_sale_v2
- `public.auto_kardex_on_stock_movement()` [--U] lectura/simple ← TRIGGER
- `public.can_safely_delete_user(p_user_id uuid)` [--U] lectura/simple ← bd=managed_delete_user
- `public.current_user_store_id()` [--U] auth.uid ← bd=get_current_user_store_id; policy
- `public.current_user_store_ids()` [--U] guard:is_admin; auth.uid ← policy
- `public.fn_sync_inventory_on_movement()` [--U] lectura/simple ← TRIGGER
- `public.get_available_stock(p_store_id uuid, p_product_id uuid)` [--U] lectura/simple ← bd=confirm_transfer
- `public.get_current_user_store_id()` [--U] lectura/simple ← policy
- `public.get_my_role()` [--U] auth.uid ← bd=manage_user_memberships; policy
- `public.has_any_role(required_roles user_role[])` [--U] auth.uid ← policy
- `public.has_role(p_required_role user_role)` [--U] guard:has_role; auth.uid ← bd=update_transaction_taxes; policy
- `public.has_role(p_user_id uuid, p_required_role user_role)` [--U] lectura/simple ← bd=update_transaction_taxes; policy
- `public.has_store_access(p_store_id uuid)` [--U] guard:is_admin; auth.uid ← bd=create_purchase_order,create_received_service_v2,distribute_service_cost_v2; policy; view
- `public.has_store_access_as(p_user_id uuid, p_store_id uuid)` [--U] lectura/simple ← bd=adjust_sale_payment,apply_physical_count,approve_transfer
- `public.has_store_role(p_store_id uuid, p_roles text[])` [--U] auth.uid ← bd=bulk_assign_memberships,get_or_create_product_cost_sheet,managed_revoke_membership; policy
- `public.is_admin()` [--U] auth.uid ← bd=adjust_total_amount,bulk_assign_memberships,current_user_store_ids; policy
- `public.is_global_admin()` [--U] auth.uid ← bd=get_or_create_product_cost_sheet,save_product_cost_sheet,upsert_store_cost_template; policy
- `public.is_managed_user(p_target_user_id uuid)` [--U] auth.uid ← policy
- `public.is_store_manager(p_store_id uuid)` [--U] auth.uid ← bd=manage_user_memberships
- `public.is_store_member(p_store_id uuid)` [--U] auth.uid ← policy
- `public.on_pick3_profile_initial_bankroll()` [--U] lectura/simple ← TRIGGER
- `public.prevent_direct_inventory_modification()` [--U] lectura/simple ← TRIGGER
- `public.snapshot_commission_rule()` [--U] lectura/simple ← TRIGGER
- `public.sync_product_has_movements()` [--U] lectura/simple ← TRIGGER
- `public.sync_product_stock()` [--U] lectura/simple ← TRIGGER
- `public.touch_updated_at()` [--U] lectura/simple ← TRIGGER
- `public.validate_active_store()` [--U] lectura/simple ← TRIGGER
- `public.validate_post_restore(p_store_id uuid, p_backup_payload jsonb)` [--U] lectura/simple ← bd=restore_store_backup

### C1 (30)
- `public.get_paginated_products_v2(p_limit integer, p_offset integer, p_store_id uuid, p_search_term t` [PAU] guard:has_store_access,is_admin; auth.uid ← src=src/hooks/api/useCatalogProducts.ts(user)
- `public.get_products_for_pos(p_store_id uuid, p_search_term text, p_category text, p_limit integer, p` [PAU] guard:has_store_access,is_admin; auth.uid ← src=src/app/api/inventory/products/route.ts,src/components/views/terminal/views/ipv/CatalogTable.tsx(user)
- `public.get_transactions(p_store_id uuid, p_search_term text, p_date_from timestamp without time zone` [PAU] guard:has_store_access,is_admin; auth.uid ← src=src/hooks/api/useTransactions.ts,src/lib/reports/data-fetcher.ts(indirect,user)
- `public.cancel_transfer(p_transfer_id uuid, p_user_id uuid)` [--U] guard:has_store_access_as; auth.uid ← src=src/services/transfer-service.ts(user); scripts
- `public.confirm_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid)` [--U] guard:has_store_access_as; auth.uid ← src=src/components/views/terminal/views/inventory/InventoryAdjustmentsView.tsx(user); scripts
- `public.confirm_pending_reception(p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with ` [--U] guard:has_store_access_as; auth.uid ← src=src/hooks/api/useReceptions.ts(user); scripts
- `public.discover_backup_tables()` [--U] lectura/simple ← src=src/lib/backup/backup-service.ts(indirect); bd=validate_backup_registry_drift
- `public.get_audit_logs(p_store_id uuid, p_search_term text, p_date_from timestamp without time zone, ` [--U] guard:has_store_access,is_admin; auth.uid ← src=src/lib/reports/data-fetcher.ts(indirect)
- `public.get_backup_table_list(p_include_excluded boolean)` [--U] lectura/simple ← src=src/lib/backup/backup-service.ts(indirect)
- `public.get_batch_store_daily_kpis(p_store_ids uuid[], p_date date)` [--U] lectura/simple ← src=src/hooks/api/useMultiStoreDashboard.ts(user)
- `public.get_cash_closures(p_store_id uuid, p_date_from date, p_date_to date, p_limit integer)` [--U] lectura/simple ← src=src/lib/reports/data-fetcher.ts(indirect)
- `public.get_daily_expenses_aggregated(p_store_id uuid, p_date_from date, p_date_to date, p_limit inte` [--U] lectura/simple ← src=src/lib/reports/data-fetcher.ts(indirect)
- `public.get_daily_income_aggregated(p_store_id uuid, p_date_from timestamp with time zone, p_date_to ` [--U] lectura/simple ← src=src/lib/reports/data-fetcher.ts(indirect)
- `public.get_global_max_operation_date(p_store_id uuid)` [--U] lectura/simple ← src=src/hooks/api/useGlobalOperationDate.ts(user); bd=validate_transfer_operation_date
- `public.get_low_stock_count(p_store_id uuid)` [--U] lectura/simple ← src=src/components/views/terminal/views/sales_hub/SalesHubView.tsx,src/hooks/api/useStoreNotifications.ts(user)
- `public.get_new_academy_cards(p_user_id uuid, p_limit integer)` [--U] lectura/simple ← src=src/app/api/academy/review/route.ts(user)
- `public.get_paginated_products(p_store_id uuid, p_search_term text, p_category text, p_limit integer,` [--U] lectura/simple ← src=src/app/tienda/[slug]/page.tsx,src/hooks/api/useInventory.ts(indirect,service,user)
- `public.get_product_stock_ledger_paginated(p_product_id uuid, p_store_id uuid, p_limit integer, p_off` [--U] lectura/simple ← src=src/app/api/inventory/[productId]/history/route.ts,src/hooks/api/useKardex.ts(indirect,user)
- `public.get_products_for_reception(p_store_id uuid, p_search_term text, p_page integer, p_page_size i` [--U] lectura/simple ← src=src/hooks/api/useReceptionProductSearch.ts(user)
- `public.get_profit_report(p_store_id uuid, p_date_from timestamp with time zone, p_date_to timestamp ` [--U] lectura/simple ← src=src/lib/reports/data-fetcher.ts(indirect)
- `public.get_sales_since_last_closure(p_store_id uuid)` [--U] lectura/simple ← src=src/services/cash-service.ts(user)
- `public.get_store_analytics_advanced(p_store_id uuid, p_start_date date, p_end_date date, p_days inte` [--U] lectura/simple ← src=src/hooks/api/useStoreAnalytics.ts(user)
- `public.get_transferable_stores(p_user_id uuid, p_current_store_id uuid)` [--U] guard:has_store_access_as ← src=src/services/transfer-service.ts(user)
- `public.get_transfers(p_store_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with` [--U] lectura/simple ← src=src/lib/reports/data-fetcher.ts(indirect)
- `public.get_worker_commission_summary(p_store_id uuid, p_date_from date, p_date_to date)` [--U] lectura/simple ← src=src/app/api/commissions/summary/route.ts(indirect)
- `public.perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_` [--U] guard:has_store_access_as; auth.uid ← src=src/app/api/sync/batch/route.ts,src/hooks/api/useDocumentActions.ts(user); scripts
- `public.process_inventory_adjustment(p_store_id uuid, p_cashier_id uuid, p_items adjustment_item[], p` [--U] lectura/simple ← src=src/app/api/inventory/adjustments/route.ts(user)
- `public.register_supplier_payment(p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, ` [--U] lectura/simple ← src=src/app/api/accounts-payable/bulk-pay/route.ts,src/app/api/payments/route.ts(indirect); scripts; bd=close_production_order_v2,create_production_order_v2
- `public.save_product_cost_sheet(p_product_id uuid, p_store_id uuid, p_template_id text, p_modalidad t` [--U] guard:has_store_role,is_global_admin ← src=src/app/api/product-cost-sheets/auto-generate/route.ts(indirect)
- `public.void_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid)` [--U] guard:has_store_access_as; auth.uid ← src=src/components/views/terminal/views/inventory/InventoryAdjustmentsView.tsx(user); scripts
