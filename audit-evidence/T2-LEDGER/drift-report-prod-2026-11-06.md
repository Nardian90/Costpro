# Informe de deriva — wthkddeleylijmonclxg — 2026-11-06T12:57:07.897Z

| Métrica | Valor |
|---|---|
| Funciones public (todas) | 554 |
| Funciones SECURITY DEFINER | 309 |
| Tablas / con RLS | 165 / 165 |
| Políticas · constraints · triggers · índices (public) | 423 · 734 · 93 · 656 |

## 1. Huella certificada (docs/security/certified-function-fingerprint.json)

- FALTAN en el proyecto (2): create_sale_v2/p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text, p_notes text, p_payment_incidents jsonb, p_cash_received_cup numeric, p_cash_received_usd numeric, p_change_given_cup numeric, p_change_given_usd numeric, p_change_currency text, p_payment_components jsonb, register_reception/p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone, p_invoice_number text, p_items jsonb, p_user_id uuid, p_po_id uuid
- CUERPO DISTINTO (1): get_transactions/p_store_id uuid, p_search_term text, p_date_from timestamp without time zone, p_date_to timestamp without time zone, p_limit integer
- SOBRANTES no excepcionados (14): activate_master_party/p_party_id uuid, p_store_id uuid, p_user_id uuid, can_read_master_parties/p_tenant_id uuid, connect_party_catalog/p_store_id uuid, p_user_id uuid, create_master_party/p_store_id uuid, p_code text, p_name text, p_address text, p_phone text, p_email text, p_tax_id text, p_party_type text, p_is_client boolean, p_is_supplier boolean, p_notes text, p_ci text, p_user_id uuid, create_sale_v2/p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text, p_notes text, p_payment_incidents jsonb, p_cash_received_cup numeric, p_cash_received_usd numeric, p_change_given_cup numeric, p_change_given_usd numeric, p_change_currency text, p_payment_components jsonb, p_customer_code text, p_customer_address text, delete_master_party/p_party_id uuid, p_origin_store_id uuid, p_user_id uuid, disconnect_party_catalog/p_store_id uuid, p_reason text, p_user_id uuid, fn_party_apply_changes/p_party_id uuid, p_changes jsonb, p_actor uuid, p_origin_store_id uuid … (+6)
- Excepciones documentadas: 4

## 2. Superficie del contrato de seguridad (contract-surface.sql)

- Entradas @contract-function: 185
- FALTAN en el proyecto (0): ninguna

## 3. Estado del replay (solo CostproE2E)

- No disponible (la tabla de estado del replay no existe en este proyecto o la consulta falló).

> Informe SOLO LECTURA. No es gate de CI. Sin PII. Registrar en audit-evidence/ antes y después de cada aplicación en producción.
