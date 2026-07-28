-- ════════════════════════════════════════════════════════════════════════
-- V2.12.13 — Endurecimiento de ACLs + COMMENTs en 32 funciones SECURITY DEFINER
--
-- Resuelve 3 debilidades de la auto-auditoría V2.12.9:
--   1. 0 GRANTs explícitos → añadir GRANT EXECUTE TO authenticated, service_role
--   2. 0 COMMENT ON FUNCTION → añadir COMMENTs descriptivos
--   3. anon=X en ACL → REVOKE EXECUTE FROM anon (reduce superficie de ataque)
--
-- Las funciones SECURITY DEFINER válidas para usuarios anónimos son excepcionales
-- (ej: webhook público). Estas 31 funciones son de negocio y requieren login.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- apply_physical_count(p_count_id uuid, p_user_id uuid, p_apply_zero_diffs boolean)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.apply_physical_count(p_count_id uuid, p_user_id uuid, p_apply_zero_diffs boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_physical_count(p_count_id uuid, p_user_id uuid, p_apply_zero_diffs boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_physical_count(p_count_id uuid, p_user_id uuid, p_apply_zero_diffs boolean) TO service_role;
COMMENT ON FUNCTION public.apply_physical_count(p_count_id uuid, p_user_id uuid, p_apply_zero_diffs boolean) IS 'Aplica un conteo físico de inventario. V2.12.9: anti-spoofing p_user_id. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- approve_transfer(p_transfer_id uuid, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.approve_transfer(p_transfer_id uuid, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_transfer(p_transfer_id uuid, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_transfer(p_transfer_id uuid, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.approve_transfer(p_transfer_id uuid, p_user_id uuid) IS 'Aprueba una transferencia que requiere aprobación por umbral. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- auto_match_bank_items(p_statement_id uuid, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.auto_match_bank_items(p_statement_id uuid, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.auto_match_bank_items(p_statement_id uuid, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_match_bank_items(p_statement_id uuid, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.auto_match_bank_items(p_statement_id uuid, p_user_id uuid) IS 'Auto-matchea items de extracto bancario. V2.12.9: anti-spoofing.';
-- ────────────────────────────────────────────────────────────────────────
-- calculate_abc(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.calculate_abc(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.calculate_abc(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_abc(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.calculate_abc(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) IS 'Calcula clasificación ABC de productos. V2.12.9: anti-spoofing.';
-- ────────────────────────────────────────────────────────────────────────
-- cancel_transfer(p_transfer_id uuid, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.cancel_transfer(p_transfer_id uuid, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_transfer(p_transfer_id uuid, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_transfer(p_transfer_id uuid, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.cancel_transfer(p_transfer_id uuid, p_user_id uuid) IS 'Cancela una transferencia pendiente. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) IS 'Cierra un período fiscal. V2.12.9: anti-spoofing.';
-- ────────────────────────────────────────────────────────────────────────
-- close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid) IS 'Cierra una orden de servicio como venta. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- compensate_inventory_error(p_store_id uuid, p_original_movement_id uuid, p_reason text, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.compensate_inventory_error(p_store_id uuid, p_original_movement_id uuid, p_reason text, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.compensate_inventory_error(p_store_id uuid, p_original_movement_id uuid, p_reason text, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compensate_inventory_error(p_store_id uuid, p_original_movement_id uuid, p_reason text, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.compensate_inventory_error(p_store_id uuid, p_original_movement_id uuid, p_reason text, p_user_id uuid) IS 'Compensa un error de inventario. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- confirm_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.confirm_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.confirm_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) IS 'Confirma un ajuste de inventario pendiente. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- confirm_pending_reception(p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.confirm_pending_reception(p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_pending_reception(p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_pending_reception(p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone) TO service_role;
COMMENT ON FUNCTION public.confirm_pending_reception(p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone) IS 'Confirma una recepción pendiente. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_operation_date timestamp with time zone)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_operation_date timestamp with time zone) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_operation_date timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_operation_date timestamp with time zone) TO service_role;
COMMENT ON FUNCTION public.confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_operation_date timestamp with time zone) IS 'Confirma una transferencia pendiente. V2.12.9: anti-spoofing. V2.12.10: BOLA fix (has_store_access_as al destino) + H7 fix (requires_approval check). V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text) TO service_role;
COMMENT ON FUNCTION public.create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text) IS 'Crea una devolución de venta. V2.12.9: anti-spoofing (9-param).';
-- ────────────────────────────────────────────────────────────────────────
-- create_physical_count(p_store_id uuid, p_user_id uuid, p_notes text)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.create_physical_count(p_store_id uuid, p_user_id uuid, p_notes text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_physical_count(p_store_id uuid, p_user_id uuid, p_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_physical_count(p_store_id uuid, p_user_id uuid, p_notes text) TO service_role;
COMMENT ON FUNCTION public.create_physical_count(p_store_id uuid, p_user_id uuid, p_notes text) IS 'Crea un conteo físico de inventario. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- create_quotation(p_store_id uuid, p_items jsonb, p_user_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_discount_type text, p_discount_value numeric, p_notes text, p_valid_until date)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.create_quotation(p_store_id uuid, p_items jsonb, p_user_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_discount_type text, p_discount_value numeric, p_notes text, p_valid_until date) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_quotation(p_store_id uuid, p_items jsonb, p_user_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_discount_type text, p_discount_value numeric, p_notes text, p_valid_until date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_quotation(p_store_id uuid, p_items jsonb, p_user_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_discount_type text, p_discount_value numeric, p_notes text, p_valid_until date) TO service_role;
COMMENT ON FUNCTION public.create_quotation(p_store_id uuid, p_items jsonb, p_user_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_discount_type text, p_discount_value numeric, p_notes text, p_valid_until date) IS 'Crea una cotización. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- create_sale(p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb, p_subtotal numeric, p_discount_type text, p_discount_value numeric, p_payment_method text, p_tax_amount numeric, p_applied_taxes jsonb, p_transaction_id uuid, p_operation_date timestamp with time zone, p_cash_amount numeric, p_transfer_amount numeric, p_idempotency_key text, p_sale_currency text, p_sale_exchange_rate numeric, p_zelle_amount numeric, p_warehouse_id uuid, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.create_sale(p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb, p_subtotal numeric, p_discount_type text, p_discount_value numeric, p_payment_method text, p_tax_amount numeric, p_applied_taxes jsonb, p_transaction_id uuid, p_operation_date timestamp with time zone, p_cash_amount numeric, p_transfer_amount numeric, p_idempotency_key text, p_sale_currency text, p_sale_exchange_rate numeric, p_zelle_amount numeric, p_warehouse_id uuid, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_sale(p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb, p_subtotal numeric, p_discount_type text, p_discount_value numeric, p_payment_method text, p_tax_amount numeric, p_applied_taxes jsonb, p_transaction_id uuid, p_operation_date timestamp with time zone, p_cash_amount numeric, p_transfer_amount numeric, p_idempotency_key text, p_sale_currency text, p_sale_exchange_rate numeric, p_zelle_amount numeric, p_warehouse_id uuid, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale(p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb, p_subtotal numeric, p_discount_type text, p_discount_value numeric, p_payment_method text, p_tax_amount numeric, p_applied_taxes jsonb, p_transaction_id uuid, p_operation_date timestamp with time zone, p_cash_amount numeric, p_transfer_amount numeric, p_idempotency_key text, p_sale_currency text, p_sale_exchange_rate numeric, p_zelle_amount numeric, p_warehouse_id uuid, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.create_sale(p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb, p_subtotal numeric, p_discount_type text, p_discount_value numeric, p_payment_method text, p_tax_amount numeric, p_applied_taxes jsonb, p_transaction_id uuid, p_operation_date timestamp with time zone, p_cash_amount numeric, p_transfer_amount numeric, p_idempotency_key text, p_sale_currency text, p_sale_exchange_rate numeric, p_zelle_amount numeric, p_warehouse_id uuid, p_user_id uuid) IS 'Crea una venta (POS). V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text, p_transaction_id uuid, p_operation_date timestamp with time zone, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text, p_transaction_id uuid, p_operation_date timestamp with time zone, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text, p_transaction_id uuid, p_operation_date timestamp with time zone, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text, p_transaction_id uuid, p_operation_date timestamp with time zone, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text, p_transaction_id uuid, p_operation_date timestamp with time zone, p_user_id uuid) IS 'Crea una transferencia entre tiendas. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- duplicate_inventory_adjustment(p_original_id uuid, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.duplicate_inventory_adjustment(p_original_id uuid, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.duplicate_inventory_adjustment(p_original_id uuid, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_inventory_adjustment(p_original_id uuid, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.duplicate_inventory_adjustment(p_original_id uuid, p_user_id uuid) IS 'Duplica un ajuste de inventario existente. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- get_reorder_suggestions(p_store_id uuid, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.get_reorder_suggestions(p_store_id uuid, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_reorder_suggestions(p_store_id uuid, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reorder_suggestions(p_store_id uuid, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.get_reorder_suggestions(p_store_id uuid, p_user_id uuid) IS 'Obtiene sugerencias de reorden. V2.12.9: anti-spoofing.';
-- ────────────────────────────────────────────────────────────────────────
-- perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric, p_operation_date timestamp with time zone)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric, p_operation_date timestamp with time zone) FROM anon;
GRANT EXECUTE ON FUNCTION public.perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric, p_operation_date timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric, p_operation_date timestamp with time zone) TO service_role;
COMMENT ON FUNCTION public.perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric, p_operation_date timestamp with time zone) IS 'Ejecuta un ajuste de inventario. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- receive_to_warehouse(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost numeric, p_warehouse_id uuid, p_lot_number text, p_expiration_date date, p_user_id uuid, p_reason text)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.receive_to_warehouse(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost numeric, p_warehouse_id uuid, p_lot_number text, p_expiration_date date, p_user_id uuid, p_reason text) FROM anon;
GRANT EXECUTE ON FUNCTION public.receive_to_warehouse(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost numeric, p_warehouse_id uuid, p_lot_number text, p_expiration_date date, p_user_id uuid, p_reason text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_to_warehouse(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost numeric, p_warehouse_id uuid, p_lot_number text, p_expiration_date date, p_user_id uuid, p_reason text) TO service_role;
COMMENT ON FUNCTION public.receive_to_warehouse(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost numeric, p_warehouse_id uuid, p_lot_number text, p_expiration_date date, p_user_id uuid, p_reason text) IS 'Recibe mercancía en almacén. V2.12.9: anti-spoofing.';
-- ────────────────────────────────────────────────────────────────────────
-- record_counted_quantity(p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid, p_notes text)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.record_counted_quantity(p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid, p_notes text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_counted_quantity(p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid, p_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_counted_quantity(p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid, p_notes text) TO service_role;
COMMENT ON FUNCTION public.record_counted_quantity(p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid, p_notes text) IS 'Registra cantidad contada en un conteo físico. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- reject_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.reject_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.reject_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) IS 'Rechaza una transferencia pendiente de aprobación. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- reverse_adjustment(p_adjustment_id uuid, p_reason text, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.reverse_adjustment(p_adjustment_id uuid, p_reason text, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reverse_adjustment(p_adjustment_id uuid, p_reason text, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_adjustment(p_adjustment_id uuid, p_reason text, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.reverse_adjustment(p_adjustment_id uuid, p_reason text, p_user_id uuid) IS 'Revierte un ajuste de inventario. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid) IS 'Revierte una devolución. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid) IS 'Revierte una orden de producción. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- reverse_receipt(p_receipt_id uuid, p_reason text, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.reverse_receipt(p_receipt_id uuid, p_reason text, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reverse_receipt(p_receipt_id uuid, p_reason text, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_receipt(p_receipt_id uuid, p_reason text, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.reverse_receipt(p_receipt_id uuid, p_reason text, p_user_id uuid) IS 'Revierte una recepción. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- reverse_transaction(p_transaction_id uuid, p_reason text, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.reverse_transaction(p_transaction_id uuid, p_reason text, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_transaction_id uuid, p_reason text, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_transaction_id uuid, p_reason text, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.reverse_transaction(p_transaction_id uuid, p_reason text, p_user_id uuid) IS 'Revierte una transacción (venta). V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) IS 'Revierte una transferencia confirmada. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- set_transfer_approval_rule(p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric, p_threshold_quantity numeric, p_approver_roles text[], p_is_active boolean, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.set_transfer_approval_rule(p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric, p_threshold_quantity numeric, p_approver_roles text[], p_is_active boolean, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_transfer_approval_rule(p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric, p_threshold_quantity numeric, p_approver_roles text[], p_is_active boolean, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_transfer_approval_rule(p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric, p_threshold_quantity numeric, p_approver_roles text[], p_is_active boolean, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.set_transfer_approval_rule(p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric, p_threshold_quantity numeric, p_approver_roles text[], p_is_active boolean, p_user_id uuid) IS 'Define reglas de aprobación por umbral. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- void_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.void_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.void_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) IS 'Anula un ajuste de inventario. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone) TO service_role;
COMMENT ON FUNCTION public.void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone) IS 'Anula una recepción con reversión de inventario. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';
-- ────────────────────────────────────────────────────────────────────────
-- void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone, p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone, p_user_id uuid) TO service_role;
COMMENT ON FUNCTION public.void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone, p_user_id uuid) IS 'Anula una transacción. V2.12.9: anti-spoofing. V2.12.12: patrón IS NULL OR NOT.';

NOTIFY pgrst, 'reload schema';

COMMIT;
