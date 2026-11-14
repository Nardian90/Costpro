# Informe de deriva — wthkddeleylijmonclxg — 2026-11-14T14:49:04.403Z

| Métrica | Valor |
|---|---|
| Funciones public (todas) | 609 |
| Funciones SECURITY DEFINER | 361 |
| Tablas / con RLS | 178 / 178 |
| Políticas · constraints · triggers · índices (public) | 445 · 818 · 114 · 703 |

## 1. Huella certificada (docs/security/certified-function-fingerprint.json)

- FALTAN en el proyecto (2): activate_master_product/p_master_id uuid, p_store_id uuid, p_user_id uuid, create_master_product/p_store_id uuid, p_sku text, p_name text, p_description text, p_image_path text, p_barcode text, p_barcode_type text, p_unit_of_measure text, p_is_service boolean, p_local jsonb, p_user_id uuid
- CUERPO DISTINTO (11): create_devolution_v2/p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text, p_idempotency_key text, p_operation_date timestamp with time zone, p_refund_currency text, fn_master_apply_identity_changes/p_master_id uuid, p_changes jsonb, p_actor uuid, p_origin_store_id uuid, p_proposal_id uuid, get_paginated_products_v2/p_limit integer, p_offset integer, p_store_id uuid, p_search_term text, p_category text, p_sort_key text, p_sort_dir text, p_stock_filter text, p_active_filter text, get_products_for_pos/p_store_id uuid, p_search_term text, p_category text, p_limit integer, p_offset integer, managed_delete_product/p_product_id uuid, managed_toggle_product_active/p_product_id uuid, p_is_active boolean, next_document_number/p_store_id uuid, p_document_type text, p_user_id uuid, prevent_received_service_edit/ … (+3)
- SOBRANTES no excepcionados (54): account_payroll/p_payroll_id uuid, p_user_id uuid, activate_master_product/p_master_id uuid, p_store_id uuid, p_user_id uuid, p_operational_class product_operational_class, assign_receipt_document_number/, assign_store_code/, check_data_integrity/, confirm_payroll/p_payroll_id uuid, p_user_id uuid, create_master_product/p_store_id uuid, p_sku text, p_name text, p_description text, p_image_path text, p_barcode text, p_barcode_type text, p_unit_of_measure text, p_is_service boolean, p_local jsonb, p_user_id uuid, p_operational_class product_operational_class, create_payroll/p_store_id uuid, p_tipo_nomina text, p_period_start date, p_period_end date, p_payment_method text, p_cheque_number text, p_cheque_date date, p_reintegro_number text, p_reintegro_date date, p_notes text, p_items jsonb, p_idempotency_key text, p_user_id uuid … (+46)
- Excepciones documentadas: 6

## 2. Superficie del contrato de seguridad (contract-surface.sql)

- Entradas @contract-function: 207
- FALTAN en el proyecto (0): ninguna

## 3. Estado del replay (solo CostproE2E)

- No disponible (la tabla de estado del replay no existe en este proyecto o la consulta falló).

> Informe SOLO LECTURA. No es gate de CI. Sin PII. Registrar en audit-evidence/ antes y después de cada aplicación en producción.
