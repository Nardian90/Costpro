# Informe de deriva — lguovmvrozxgssupkwpf — 2026-11-06T12:57:12.413Z

| Métrica | Valor |
|---|---|
| Funciones public (todas) | 559 |
| Funciones SECURITY DEFINER | 311 |
| Tablas / con RLS | 166 / 166 |
| Políticas · constraints · triggers · índices (public) | 423 · 735 · 94 · 656 |

## 1. Huella certificada (docs/security/certified-function-fingerprint.json)

- FALTAN en el proyecto (2): create_sale_v2/p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text, p_notes text, p_payment_incidents jsonb, p_cash_received_cup numeric, p_cash_received_usd numeric, p_change_given_cup numeric, p_change_given_usd numeric, p_change_currency text, p_payment_components jsonb, register_reception/p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone, p_invoice_number text, p_items jsonb, p_user_id uuid, p_po_id uuid
- CUERPO DISTINTO (2): create_master_product/p_store_id uuid, p_sku text, p_name text, p_description text, p_image_path text, p_barcode text, p_barcode_type text, p_unit_of_measure text, p_is_service boolean, p_local jsonb, p_user_id uuid, pay_commission/p_payment_id uuid, p_payment_method text, p_reference text, p_currency text, p_exchange_rate numeric, p_paid_at timestamp with time zone, p_user_id uuid
- SOBRANTES no excepcionados (14): activate_master_party/p_party_id uuid, p_store_id uuid, p_user_id uuid, can_read_master_parties/p_tenant_id uuid, connect_party_catalog/p_store_id uuid, p_user_id uuid, create_master_party/p_store_id uuid, p_code text, p_name text, p_address text, p_phone text, p_email text, p_tax_id text, p_party_type text, p_is_client boolean, p_is_supplier boolean, p_notes text, p_ci text, p_user_id uuid, create_sale_v2/p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text, p_notes text, p_payment_incidents jsonb, p_cash_received_cup numeric, p_cash_received_usd numeric, p_change_given_cup numeric, p_change_given_usd numeric, p_change_currency text, p_payment_components jsonb, p_customer_code text, p_customer_address text, delete_master_party/p_party_id uuid, p_origin_store_id uuid, p_user_id uuid, disconnect_party_catalog/p_store_id uuid, p_reason text, p_user_id uuid, fn_party_apply_changes/p_party_id uuid, p_changes jsonb, p_actor uuid, p_origin_store_id uuid … (+6)
- Excepciones documentadas: 4

## 2. Superficie del contrato de seguridad (contract-surface.sql)

- Entradas @contract-function: 185
- FALTAN en el proyecto (0): ninguna

## 3. Estado del replay (solo CostproE2E)

- Filas en estado distinto de 'aplicada': 202401230001_add_get_users_for_encargado.sql=limpiada_para_baseline, 202401230002_update_rls_for_encargado.sql=fallida, 20240325000000_harden_audit_triggers.sql=limpiada_para_baseline, 20240725_add_paginated_stock_ledger.sql=limpiada_para_baseline, 20240801_create_inventory_adjustments.sql=fallida

> Informe SOLO LECTURA. No es gate de CI. Sin PII. Registrar en audit-evidence/ antes y después de cada aplicación en producción.
