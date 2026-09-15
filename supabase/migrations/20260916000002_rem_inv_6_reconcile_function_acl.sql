-- =====================================================================
-- SOURCE: REM-INV-6 (includes REM-INV-4C DCL canonicalization)
-- OBJECT: ACL reconciliation for the certified function surface (134 DO blocks)
-- LIVE EVIDENCE: audit-evidence/REM-INV-6/05-acl-reconciliation.txt
-- REASON: a clean replay of supabase/migrations leaves PUBLIC EXECUTE on
--         dozens of SECURITY DEFINER write functions and does not materialize
--         the REM-INV-4C REVOKEs (current_user_tenant_id, has_store_role
--         2/3-arg, has_store_role_as). Each block re-asserts the certified
--         grants with explicit REVOKE ... GRANT statements.
-- EXPECTED SECURITY STATE: per-function EXECUTE privileges identical to the
--         certified LIVE proacl for anon/authenticated/service_role/PUBLIC.
--         Privilege-guarded → idempotent; no-op when the certified state
--         already holds (production application = zero catalog change).
-- =====================================================================

DO $acl$
BEGIN
  -- adjust_sale_payment(p_transaction_id uuid, p_user_id uuid, p_payment_method text…) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'adjust_sale_payment'
      AND pg_get_function_identity_arguments(p.oid) = 'p_transaction_id uuid, p_user_id uuid, p_payment_method text, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_items_price_adjustments jsonb, p_discount_type text, p_discount_value numeric, p_reason text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.adjust_sale_payment(p_transaction_id uuid, p_user_id uuid, p_payment_method text, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_items_price_adjustments jsonb, p_discount_type text, p_discount_value numeric, p_reason text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.adjust_sale_payment(p_transaction_id uuid, p_user_id uuid, p_payment_method text, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_items_price_adjustments jsonb, p_discount_type text, p_discount_value numeric, p_reason text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.adjust_sale_payment(p_transaction_id uuid, p_user_id uuid, p_payment_method text, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_items_price_adjustments jsonb, p_discount_type text, p_discount_value numeric, p_reason text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- adjust_total_amount(p_transaction_id uuid, p_new_total numeric, p_reason text) → certified EXECUTE: authenticated
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'adjust_total_amount'
      AND pg_get_function_identity_arguments(p.oid) = 'p_transaction_id uuid, p_new_total numeric, p_reason text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.adjust_total_amount(p_transaction_id uuid, p_new_total numeric, p_reason text) FROM PUBLIC, anon, service_role;
    GRANT EXECUTE ON FUNCTION public.adjust_total_amount(p_transaction_id uuid, p_new_total numeric, p_reason text) TO authenticated;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- apply_physical_count(p_count_id uuid, p_user_id uuid, p_apply_zero_diffs boolean) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'apply_physical_count'
      AND pg_get_function_identity_arguments(p.oid) = 'p_count_id uuid, p_user_id uuid, p_apply_zero_diffs boolean'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.apply_physical_count(p_count_id uuid, p_user_id uuid, p_apply_zero_diffs boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.apply_physical_count(p_count_id uuid, p_user_id uuid, p_apply_zero_diffs boolean) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- approve_transfer(p_transfer_id uuid, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'approve_transfer'
      AND pg_get_function_identity_arguments(p.oid) = 'p_transfer_id uuid, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.approve_transfer(p_transfer_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.approve_transfer(p_transfer_id uuid, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- audit_backup_restore_protected_change() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'audit_backup_restore_protected_change'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.audit_backup_restore_protected_change() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.audit_backup_restore_protected_change() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- audit_cash_closures_changes() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'audit_cash_closures_changes'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.audit_cash_closures_changes() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.audit_cash_closures_changes() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- audit_commission_payments_changes() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'audit_commission_payments_changes'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.audit_commission_payments_changes() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.audit_commission_payments_changes() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- audit_fiscal_closings_changes() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'audit_fiscal_closings_changes'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.audit_fiscal_closings_changes() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.audit_fiscal_closings_changes() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- audit_payment_transactions_changes() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'audit_payment_transactions_changes'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.audit_payment_transactions_changes() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.audit_payment_transactions_changes() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- audit_product_changes() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'audit_product_changes'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.audit_product_changes() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.audit_product_changes() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- audit_profile_changes() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'audit_profile_changes'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.audit_profile_changes() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.audit_profile_changes() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- audit_role_changes() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'audit_role_changes'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.audit_role_changes() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.audit_role_changes() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- audit_store_access_changes() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'audit_store_access_changes'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.audit_store_access_changes() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.audit_store_access_changes() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- audit_store_changes() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'audit_store_changes'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.audit_store_changes() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.audit_store_changes() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- auto_kardex_on_stock_movement() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'auto_kardex_on_stock_movement'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.auto_kardex_on_stock_movement() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.auto_kardex_on_stock_movement() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- auto_match_bank_items(p_statement_id uuid, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'auto_match_bank_items'
      AND pg_get_function_identity_arguments(p.oid) = 'p_statement_id uuid, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.auto_match_bank_items(p_statement_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.auto_match_bank_items(p_statement_id uuid, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- bulk_assign_memberships(p_user_id uuid, p_assignments jsonb) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'bulk_assign_memberships'
      AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_assignments jsonb'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.bulk_assign_memberships(p_user_id uuid, p_assignments jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.bulk_assign_memberships(p_user_id uuid, p_assignments jsonb) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- bulk_soft_delete_stores(p_store_ids uuid[], p_deleted_by uuid, p_confirmation_token …) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'bulk_soft_delete_stores'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_ids uuid[], p_deleted_by uuid, p_confirmation_token text, p_override_token text, p_reason text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.bulk_soft_delete_stores(p_store_ids uuid[], p_deleted_by uuid, p_confirmation_token text, p_override_token text, p_reason text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.bulk_soft_delete_stores(p_store_ids uuid[], p_deleted_by uuid, p_confirmation_token text, p_override_token text, p_reason text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- bulk_update_products(_products jsonb) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'bulk_update_products'
      AND pg_get_function_identity_arguments(p.oid) = '_products jsonb'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.bulk_update_products(_products jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.bulk_update_products(_products jsonb) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- calculate_abc(p_store_id uuid, p_year integer, p_month integer, p_user_id …) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'calculate_abc'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_year integer, p_month integer, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.calculate_abc(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.calculate_abc(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- cancel_reception(p_reception_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'cancel_reception'
      AND pg_get_function_identity_arguments(p.oid) = 'p_reception_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.cancel_reception(p_reception_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.cancel_reception(p_reception_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- cancel_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'cancel_transfer'
      AND pg_get_function_identity_arguments(p.oid) = 'p_transfer_id uuid, p_reason text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.cancel_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.cancel_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.cancel_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- cancel_transfer(p_transfer_id uuid, p_user_id uuid) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'cancel_transfer'
      AND pg_get_function_identity_arguments(p.oid) = 'p_transfer_id uuid, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.cancel_transfer(p_transfer_id uuid, p_user_id uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.cancel_transfer(p_transfer_id uuid, p_user_id uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.cancel_transfer(p_transfer_id uuid, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- check_idempotency(p_key text, p_operation text, p_record_id uuid, p_param_hash…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'check_idempotency'
      AND pg_get_function_identity_arguments(p.oid) = 'p_key text, p_operation text, p_record_id uuid, p_param_hash text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.check_idempotency(p_key text, p_operation text, p_record_id uuid, p_param_hash text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.check_idempotency(p_key text, p_operation text, p_record_id uuid, p_param_hash text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- close_cash_shift(p_closure_id uuid, p_declared_cash numeric, p_declared_vouch…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'close_cash_shift'
      AND pg_get_function_identity_arguments(p.oid) = 'p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_notes text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.close_cash_shift(p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_notes text, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.close_cash_shift(p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_notes text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id …) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'close_fiscal_period'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_year integer, p_month integer, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- close_production_order_v2(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_final_…) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'close_production_order_v2'
      AND pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_final_amount numeric, p_final_method text, p_final_currency text, p_exchange_rate numeric, p_output_product_id uuid, p_output_quantity numeric, p_user_id uuid, p_idempotency_key text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.close_production_order_v2(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_final_amount numeric, p_final_method text, p_final_currency text, p_exchange_rate numeric, p_output_product_id uuid, p_output_quantity numeric, p_user_id uuid, p_idempotency_key text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.close_production_order_v2(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_final_amount numeric, p_final_method text, p_final_currency text, p_exchange_rate numeric, p_output_product_id uuid, p_output_quantity numeric, p_user_id uuid, p_idempotency_key text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.close_production_order_v2(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_final_amount numeric, p_final_method text, p_final_currency text, p_exchange_rate numeric, p_output_product_id uuid, p_output_quantity numeric, p_user_id uuid, p_idempotency_key text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_paymen…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'close_service_order_as_sale'
      AND pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- confirm_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'confirm_inventory_adjustment'
      AND pg_get_function_identity_arguments(p.oid) = 'p_adjustment_id uuid, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.confirm_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.confirm_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.confirm_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- confirm_pending_reception(p_receipt_id uuid, p_user_id uuid, p_operation_date timestam…) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'confirm_pending_reception'
      AND pg_get_function_identity_arguments(p.oid) = 'p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.confirm_pending_reception(p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.confirm_pending_reception(p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.confirm_pending_reception(p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_operation_date timesta…) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'confirm_transfer'
      AND pg_get_function_identity_arguments(p.oid) = 'p_transfer_id uuid, p_user_id uuid, p_operation_date timestamp with time zone'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_operation_date timestamp with time zone) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_operation_date timestamp with time zone) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_operation_date timestamp with time zone) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_original_tr…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'create_devolution'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_items jsonb, p_reason text, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text, p_currency text, p_exchange_rate numeric'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text, p_currency text, p_exchange_rate numeric) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text, p_currency text, p_exchange_rate numeric) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uui…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'create_devolution'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- create_devolution_v2(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uui…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'create_devolution_v2'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text, p_idempotency_key text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.create_devolution_v2(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text, p_idempotency_key text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.create_devolution_v2(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text, p_idempotency_key text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- create_physical_count(p_store_id uuid, p_user_id uuid, p_notes text) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'create_physical_count'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_user_id uuid, p_notes text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.create_physical_count(p_store_id uuid, p_user_id uuid, p_notes text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.create_physical_count(p_store_id uuid, p_user_id uuid, p_notes text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- create_production_order_v2(p_store_id uuid, p_order_type text, p_customer_name text, p_…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'create_production_order_v2'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_order_type text, p_customer_name text, p_customer_ci text, p_customer_phone text, p_customer_address text, p_budget_total numeric, p_budget_currency text, p_description text, p_notes text, p_items jsonb, p_advance_amount numeric, p_advance_method text, p_advance_currency text, p_created_by uuid, p_idempotency_key text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.create_production_order_v2(p_store_id uuid, p_order_type text, p_customer_name text, p_customer_ci text, p_customer_phone text, p_customer_address text, p_budget_total numeric, p_budget_currency text, p_description text, p_notes text, p_items jsonb, p_advance_amount numeric, p_advance_method text, p_advance_currency text, p_created_by uuid, p_idempotency_key text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.create_production_order_v2(p_store_id uuid, p_order_type text, p_customer_name text, p_customer_ci text, p_customer_phone text, p_customer_address text, p_budget_total numeric, p_budget_currency text, p_description text, p_notes text, p_items jsonb, p_advance_amount numeric, p_advance_method text, p_advance_currency text, p_created_by uuid, p_idempotency_key text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- create_purchase_order(p_store_id uuid, p_supplier_name text, p_supplier_id uuid, p…) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'create_purchase_order'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_supplier_name text, p_supplier_id uuid, p_po_number text, p_notes text, p_expected_date date, p_created_by uuid, p_items jsonb'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.create_purchase_order(p_store_id uuid, p_supplier_name text, p_supplier_id uuid, p_po_number text, p_notes text, p_expected_date date, p_created_by uuid, p_items jsonb) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.create_purchase_order(p_store_id uuid, p_supplier_name text, p_supplier_id uuid, p_po_number text, p_notes text, p_expected_date date, p_created_by uuid, p_items jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.create_purchase_order(p_store_id uuid, p_supplier_name text, p_supplier_id uuid, p_po_number text, p_notes text, p_expected_date date, p_created_by uuid, p_items jsonb) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- create_quotation(p_store_id uuid, p_items jsonb, p_user_id uuid, p_customer_i…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'create_quotation'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_items jsonb, p_user_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_discount_type text, p_discount_value numeric, p_notes text, p_valid_until date'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.create_quotation(p_store_id uuid, p_items jsonb, p_user_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_discount_type text, p_discount_value numeric, p_notes text, p_valid_until date) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.create_quotation(p_store_id uuid, p_items jsonb, p_user_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_discount_type text, p_discount_value numeric, p_notes text, p_valid_until date) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- create_received_service_v2(p_store_id uuid, p_supplier text, p_total_amount numeric, p_…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'create_received_service_v2'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_supplier text, p_total_amount numeric, p_service_type_id uuid, p_service_type_name text, p_service_date date, p_currency text, p_exchange_rate numeric, p_payment_terms_days integer, p_distribution_method text, p_reference_doc text, p_observations text, p_receipt_ids jsonb, p_created_by uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.create_received_service_v2(p_store_id uuid, p_supplier text, p_total_amount numeric, p_service_type_id uuid, p_service_type_name text, p_service_date date, p_currency text, p_exchange_rate numeric, p_payment_terms_days integer, p_distribution_method text, p_reference_doc text, p_observations text, p_receipt_ids jsonb, p_created_by uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.create_received_service_v2(p_store_id uuid, p_supplier text, p_total_amount numeric, p_service_type_id uuid, p_service_type_name text, p_service_date date, p_currency text, p_exchange_rate numeric, p_payment_terms_days integer, p_distribution_method text, p_reference_doc text, p_observations text, p_receipt_ids jsonb, p_created_by uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- create_sale(p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p…) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'create_sale'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb, p_subtotal numeric, p_discount_type text, p_discount_value numeric, p_payment_method text, p_tax_amount numeric, p_applied_taxes jsonb, p_transaction_id uuid, p_operation_date timestamp with time zone, p_cash_amount numeric, p_transfer_amount numeric, p_idempotency_key text, p_sale_currency text, p_sale_exchange_rate numeric, p_zelle_amount numeric, p_warehouse_id uuid, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.create_sale(p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb, p_subtotal numeric, p_discount_type text, p_discount_value numeric, p_payment_method text, p_tax_amount numeric, p_applied_taxes jsonb, p_transaction_id uuid, p_operation_date timestamp with time zone, p_cash_amount numeric, p_transfer_amount numeric, p_idempotency_key text, p_sale_currency text, p_sale_exchange_rate numeric, p_zelle_amount numeric, p_warehouse_id uuid, p_user_id uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.create_sale(p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb, p_subtotal numeric, p_discount_type text, p_discount_value numeric, p_payment_method text, p_tax_amount numeric, p_applied_taxes jsonb, p_transaction_id uuid, p_operation_date timestamp with time zone, p_cash_amount numeric, p_transfer_amount numeric, p_idempotency_key text, p_sale_currency text, p_sale_exchange_rate numeric, p_zelle_amount numeric, p_warehouse_id uuid, p_user_id uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.create_sale(p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb, p_subtotal numeric, p_discount_type text, p_discount_value numeric, p_payment_method text, p_tax_amount numeric, p_applied_taxes jsonb, p_transaction_id uuid, p_operation_date timestamp with time zone, p_cash_amount numeric, p_transfer_amount numeric, p_idempotency_key text, p_sale_currency text, p_sale_exchange_rate numeric, p_zelle_amount numeric, p_warehouse_id uuid, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_…) → certified EXECUTE: PUBLIC, authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'create_sale_v2'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM true
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid) FROM anon;
    GRANT EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- create_store_with_membership(p_name text, p_address text, p_created_by uuid, p_max_stores…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'create_store_with_membership'
      AND pg_get_function_identity_arguments(p.oid) = 'p_name text, p_address text, p_created_by uuid, p_max_stores integer, p_logo_url text, p_reeup text, p_nit text, p_bank_account text, p_phone text, p_email text, p_slug text, p_plantilla text, p_signature_url text, p_stamp_url text, p_latitude double precision, p_longitude double precision, p_tenant_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.create_store_with_membership(p_name text, p_address text, p_created_by uuid, p_max_stores integer, p_logo_url text, p_reeup text, p_nit text, p_bank_account text, p_phone text, p_email text, p_slug text, p_plantilla text, p_signature_url text, p_stamp_url text, p_latitude double precision, p_longitude double precision, p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.create_store_with_membership(p_name text, p_address text, p_created_by uuid, p_max_stores integer, p_logo_url text, p_reeup text, p_nit text, p_bank_account text, p_phone text, p_email text, p_slug text, p_plantilla text, p_signature_url text, p_stamp_url text, p_latitude double precision, p_longitude double precision, p_tenant_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items…) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'create_transfer'
      AND pg_get_function_identity_arguments(p.oid) = 'p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text, p_transaction_id uuid, p_operation_date timestamp with time zone, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text, p_transaction_id uuid, p_operation_date timestamp with time zone, p_user_id uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text, p_transaction_id uuid, p_operation_date timestamp with time zone, p_user_id uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text, p_transaction_id uuid, p_operation_date timestamp with time zone, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid, …) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'create_vale_salida'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_items jsonb, p_production_order_id uuid, p_notes text, p_idempotency_key text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid, p_notes text, p_idempotency_key text, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid, p_notes text, p_idempotency_key text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- detect_orphan_users() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'detect_orphan_users'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.detect_orphan_users() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.detect_orphan_users() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- distribute_service_cost_v2(p_service_id uuid, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'distribute_service_cost_v2'
      AND pg_get_function_identity_arguments(p.oid) = 'p_service_id uuid, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.distribute_service_cost_v2(p_service_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.distribute_service_cost_v2(p_service_id uuid, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- duplicate_inventory_adjustment(p_original_id uuid, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'duplicate_inventory_adjustment'
      AND pg_get_function_identity_arguments(p.oid) = 'p_original_id uuid, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.duplicate_inventory_adjustment(p_original_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.duplicate_inventory_adjustment(p_original_id uuid, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- duplicate_inventory_adjustment_v2(p_original_id uuid, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'duplicate_inventory_adjustment_v2'
      AND pg_get_function_identity_arguments(p.oid) = 'p_original_id uuid, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.duplicate_inventory_adjustment_v2(p_original_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.duplicate_inventory_adjustment_v2(p_original_id uuid, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- ensure_fiscal_period(p_store_id uuid, p_year integer, p_month integer) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'ensure_fiscal_period'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_year integer, p_month integer'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.ensure_fiscal_period(p_store_id uuid, p_year integer, p_month integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ensure_fiscal_period(p_store_id uuid, p_year integer, p_month integer) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- fn_log_system_health(p_payload jsonb) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'fn_log_system_health'
      AND pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.fn_log_system_health(p_payload jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.fn_log_system_health(p_payload jsonb) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- fn_process_receipt(p_items jsonb, p_user_id uuid, p_store_id uuid, p_reference …) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'fn_process_receipt'
      AND pg_get_function_identity_arguments(p.oid) = 'p_items jsonb, p_user_id uuid, p_store_id uuid, p_reference text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.fn_process_receipt(p_items jsonb, p_user_id uuid, p_store_id uuid, p_reference text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.fn_process_receipt(p_items jsonb, p_user_id uuid, p_store_id uuid, p_reference text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- fn_process_receipt(p_items jsonb, p_user_id uuid, p_reference text) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'fn_process_receipt'
      AND pg_get_function_identity_arguments(p.oid) = 'p_items jsonb, p_user_id uuid, p_reference text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.fn_process_receipt(p_items jsonb, p_user_id uuid, p_reference text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.fn_process_receipt(p_items jsonb, p_user_id uuid, p_reference text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- fn_process_sale(p_items jsonb, p_cashier_id uuid, p_payment_method text) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'fn_process_sale'
      AND pg_get_function_identity_arguments(p.oid) = 'p_items jsonb, p_cashier_id uuid, p_payment_method text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.fn_process_sale(p_items jsonb, p_cashier_id uuid, p_payment_method text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.fn_process_sale(p_items jsonb, p_cashier_id uuid, p_payment_method text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- fn_recalc_wac(p_store_id uuid, p_product_id uuid, p_event text, p_qty_in n…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'fn_recalc_wac'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_product_id uuid, p_event text, p_qty_in numeric, p_uc_in numeric, p_source_ref jsonb'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.fn_recalc_wac(p_store_id uuid, p_product_id uuid, p_event text, p_qty_in numeric, p_uc_in numeric, p_source_ref jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.fn_recalc_wac(p_store_id uuid, p_product_id uuid, p_event text, p_qty_in numeric, p_uc_in numeric, p_source_ref jsonb) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- fn_sync_inventory_on_movement() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'fn_sync_inventory_on_movement'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.fn_sync_inventory_on_movement() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.fn_sync_inventory_on_movement() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- fn_void_receipt(p_receipt_id uuid, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'fn_void_receipt'
      AND pg_get_function_identity_arguments(p.oid) = 'p_receipt_id uuid, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.fn_void_receipt(p_receipt_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.fn_void_receipt(p_receipt_id uuid, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- generate_bulk_confirmation_token(p_store_ids uuid[], p_action text, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'generate_bulk_confirmation_token'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_ids uuid[], p_action text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.generate_bulk_confirmation_token(p_store_ids uuid[], p_action text, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.generate_bulk_confirmation_token(p_store_ids uuid[], p_action text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- generate_bulk_override_token(p_confirmation_token text, p_override_user_id uuid, p_reason…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'generate_bulk_override_token'
      AND pg_get_function_identity_arguments(p.oid) = 'p_confirmation_token text, p_override_user_id uuid, p_reason text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.generate_bulk_override_token(p_confirmation_token text, p_override_user_id uuid, p_reason text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.generate_bulk_override_token(p_confirmation_token text, p_override_user_id uuid, p_reason text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- generate_confirmation_token(p_session_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'generate_confirmation_token'
      AND pg_get_function_identity_arguments(p.oid) = 'p_session_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.generate_confirmation_token(p_session_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.generate_confirmation_token(p_session_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- generate_inventory_snapshot(p_store_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'generate_inventory_snapshot'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.generate_inventory_snapshot(p_store_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.generate_inventory_snapshot(p_store_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- increment_user_usage(p_user_id uuid, p_action_type text, p_limit integer) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'increment_user_usage'
      AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_action_type text, p_limit integer'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.increment_user_usage(p_user_id uuid, p_action_type text, p_limit integer) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.increment_user_usage(p_user_id uuid, p_action_type text, p_limit integer) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.increment_user_usage(p_user_id uuid, p_action_type text, p_limit integer) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- link_receipts_to_service(p_service_id uuid, p_receipt_ids jsonb, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'link_receipts_to_service'
      AND pg_get_function_identity_arguments(p.oid) = 'p_service_id uuid, p_receipt_ids jsonb, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.link_receipts_to_service(p_service_id uuid, p_receipt_ids jsonb, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.link_receipts_to_service(p_service_id uuid, p_receipt_ids jsonb, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- lock_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id …) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'lock_fiscal_period'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_year integer, p_month integer, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.lock_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.lock_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- log_audit_event(p_action text, p_payload jsonb, p_store_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'log_audit_event'
      AND pg_get_function_identity_arguments(p.oid) = 'p_action text, p_payload jsonb, p_store_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.log_audit_event(p_action text, p_payload jsonb, p_store_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.log_audit_event(p_action text, p_payload jsonb, p_store_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- log_transaction_changes() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'log_transaction_changes'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.log_transaction_changes() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.log_transaction_changes() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- manage_user_memberships(p_user_id uuid, p_memberships jsonb) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'manage_user_memberships'
      AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_memberships jsonb'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.manage_user_memberships(p_user_id uuid, p_memberships jsonb) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.manage_user_memberships(p_user_id uuid, p_memberships jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.manage_user_memberships(p_user_id uuid, p_memberships jsonb) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- managed_create_store(p_name text, p_address text) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'managed_create_store'
      AND pg_get_function_identity_arguments(p.oid) = 'p_name text, p_address text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.managed_create_store(p_name text, p_address text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.managed_create_store(p_name text, p_address text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- managed_create_user(p_max_users integer, p_max_stores integer, p_role text, p_fu…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'managed_create_user'
      AND pg_get_function_identity_arguments(p.oid) = 'p_max_users integer, p_max_stores integer, p_role text, p_full_name text, p_email text, p_creator_id uuid, p_target_user_id uuid, p_store_id uuid, p_memberships jsonb'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.managed_create_user(p_max_users integer, p_max_stores integer, p_role text, p_full_name text, p_email text, p_creator_id uuid, p_target_user_id uuid, p_store_id uuid, p_memberships jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.managed_create_user(p_max_users integer, p_max_stores integer, p_role text, p_full_name text, p_email text, p_creator_id uuid, p_target_user_id uuid, p_store_id uuid, p_memberships jsonb) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- managed_create_user_v2(p_email text, p_full_name text, p_role user_role, p_plan pla…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'managed_create_user_v2'
      AND pg_get_function_identity_arguments(p.oid) = 'p_email text, p_full_name text, p_role user_role, p_plan plan_t, p_store_id uuid, p_memberships jsonb, p_max_stores integer, p_max_users integer, p_target_user_id uuid, p_creator_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.managed_create_user_v2(p_email text, p_full_name text, p_role user_role, p_plan plan_t, p_store_id uuid, p_memberships jsonb, p_max_stores integer, p_max_users integer, p_target_user_id uuid, p_creator_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.managed_create_user_v2(p_email text, p_full_name text, p_role user_role, p_plan plan_t, p_store_id uuid, p_memberships jsonb, p_max_stores integer, p_max_users integer, p_target_user_id uuid, p_creator_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- managed_delete_product(p_product_id uuid) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'managed_delete_product'
      AND pg_get_function_identity_arguments(p.oid) = 'p_product_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.managed_delete_product(p_product_id uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.managed_delete_product(p_product_id uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.managed_delete_product(p_product_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- managed_reset_password(p_user_id uuid, p_caller_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'managed_reset_password'
      AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_caller_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.managed_reset_password(p_user_id uuid, p_caller_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.managed_reset_password(p_user_id uuid, p_caller_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- managed_revoke_membership(p_membership_id uuid, p_caller_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'managed_revoke_membership'
      AND pg_get_function_identity_arguments(p.oid) = 'p_membership_id uuid, p_caller_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.managed_revoke_membership(p_membership_id uuid, p_caller_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.managed_revoke_membership(p_membership_id uuid, p_caller_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- managed_soft_delete_user(p_user_id uuid, p_reason text, p_caller_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'managed_soft_delete_user'
      AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_reason text, p_caller_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.managed_soft_delete_user(p_user_id uuid, p_reason text, p_caller_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.managed_soft_delete_user(p_user_id uuid, p_reason text, p_caller_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- managed_toggle_product_active(p_product_id uuid, p_is_active boolean) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'managed_toggle_product_active'
      AND pg_get_function_identity_arguments(p.oid) = 'p_product_id uuid, p_is_active boolean'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.managed_toggle_product_active(p_product_id uuid, p_is_active boolean) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.managed_toggle_product_active(p_product_id uuid, p_is_active boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.managed_toggle_product_active(p_product_id uuid, p_is_active boolean) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- managed_toggle_user_status(p_user_id uuid, p_is_active boolean, p_caller_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'managed_toggle_user_status'
      AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_is_active boolean, p_caller_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.managed_toggle_user_status(p_user_id uuid, p_is_active boolean, p_caller_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.managed_toggle_user_status(p_user_id uuid, p_is_active boolean, p_caller_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- managed_update_membership(p_membership_id uuid, p_role user_role, p_status text, p_cal…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'managed_update_membership'
      AND pg_get_function_identity_arguments(p.oid) = 'p_membership_id uuid, p_role user_role, p_status text, p_caller_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.managed_update_membership(p_membership_id uuid, p_role user_role, p_status text, p_caller_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.managed_update_membership(p_membership_id uuid, p_role user_role, p_status text, p_caller_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- managed_update_tenant_plan(p_tenant_id uuid, p_plan plan_t, p_subscription_status text,…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'managed_update_tenant_plan'
      AND pg_get_function_identity_arguments(p.oid) = 'p_tenant_id uuid, p_plan plan_t, p_subscription_status text, p_caller_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.managed_update_tenant_plan(p_tenant_id uuid, p_plan plan_t, p_subscription_status text, p_caller_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.managed_update_tenant_plan(p_tenant_id uuid, p_plan plan_t, p_subscription_status text, p_caller_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- managed_update_user(p_user_id uuid, p_full_name text, p_role user_role, p_role_i…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'managed_update_user'
      AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_full_name text, p_role user_role, p_role_id uuid, p_is_active boolean, p_max_stores_limit integer, p_max_users_limit integer, p_plan plan_t, p_caller_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.managed_update_user(p_user_id uuid, p_full_name text, p_role user_role, p_role_id uuid, p_is_active boolean, p_max_stores_limit integer, p_max_users_limit integer, p_plan plan_t, p_caller_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.managed_update_user(p_user_id uuid, p_full_name text, p_role user_role, p_role_id uuid, p_is_active boolean, p_max_stores_limit integer, p_max_users_limit integer, p_plan plan_t, p_caller_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- mark_expired_lots(p_store_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'mark_expired_lots'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.mark_expired_lots(p_store_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.mark_expired_lots(p_store_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- next_document_number(p_store_id uuid, p_document_type text, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'next_document_number'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_document_type text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.next_document_number(p_store_id uuid, p_document_type text, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.next_document_number(p_store_id uuid, p_document_type text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- on_auth_user_created() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'on_auth_user_created'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.on_auth_user_created() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.on_auth_user_created() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric…) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'perform_inventory_adjustment'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric, p_operation_date timestamp with time zone'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric, p_operation_date timestamp with time zone) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric, p_operation_date timestamp with time zone) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric, p_operation_date timestamp with time zone) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- process_inventory_adjustment(p_store_id uuid, p_cashier_id uuid, p_items adjustment_item[…) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'process_inventory_adjustment'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_cashier_id uuid, p_items adjustment_item[], p_operation_date timestamp with time zone'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.process_inventory_adjustment(p_store_id uuid, p_cashier_id uuid, p_items adjustment_item[], p_operation_date timestamp with time zone) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.process_inventory_adjustment(p_store_id uuid, p_cashier_id uuid, p_items adjustment_item[], p_operation_date timestamp with time zone) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.process_inventory_adjustment(p_store_id uuid, p_cashier_id uuid, p_items adjustment_item[], p_operation_date timestamp with time zone) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- process_pick3_transaction(p_user_id uuid, p_type text, p_amount bigint, p_reference_dr…) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'process_pick3_transaction'
      AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_type text, p_amount bigint, p_reference_draw_id uuid, p_reference_play_id uuid, p_notes text, p_metadata jsonb'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.process_pick3_transaction(p_user_id uuid, p_type text, p_amount bigint, p_reference_draw_id uuid, p_reference_play_id uuid, p_notes text, p_metadata jsonb) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.process_pick3_transaction(p_user_id uuid, p_type text, p_amount bigint, p_reference_draw_id uuid, p_reference_play_id uuid, p_notes text, p_metadata jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.process_pick3_transaction(p_user_id uuid, p_type text, p_amount bigint, p_reference_draw_id uuid, p_reference_play_id uuid, p_notes text, p_metadata jsonb) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- receive_against_po(p_po_id uuid, p_received_items jsonb, p_user_id uuid, p_rece…) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'receive_against_po'
      AND pg_get_function_identity_arguments(p.oid) = 'p_po_id uuid, p_received_items jsonb, p_user_id uuid, p_reception_date timestamp with time zone, p_invoice_number text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.receive_against_po(p_po_id uuid, p_received_items jsonb, p_user_id uuid, p_reception_date timestamp with time zone, p_invoice_number text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.receive_against_po(p_po_id uuid, p_received_items jsonb, p_user_id uuid, p_reception_date timestamp with time zone, p_invoice_number text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.receive_against_po(p_po_id uuid, p_received_items jsonb, p_user_id uuid, p_reception_date timestamp with time zone, p_invoice_number text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- receive_production_output(p_order_id uuid, p_product_id uuid, p_quantity numeric, p_st…) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'receive_production_output'
      AND pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid, p_product_id uuid, p_quantity numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.receive_production_output(p_order_id uuid, p_product_id uuid, p_quantity numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.receive_production_output(p_order_id uuid, p_product_id uuid, p_quantity numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.receive_production_output(p_order_id uuid, p_product_id uuid, p_quantity numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- receive_to_warehouse(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_un…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'receive_to_warehouse'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost numeric, p_warehouse_id uuid, p_lot_number text, p_expiration_date date, p_user_id uuid, p_reason text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.receive_to_warehouse(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost numeric, p_warehouse_id uuid, p_lot_number text, p_expiration_date date, p_user_id uuid, p_reason text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.receive_to_warehouse(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost numeric, p_warehouse_id uuid, p_lot_number text, p_expiration_date date, p_user_id uuid, p_reason text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- reconcile_orphan_user(p_auth_user_id uuid, p_action text, p_reason text, p_caller_…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'reconcile_orphan_user'
      AND pg_get_function_identity_arguments(p.oid) = 'p_auth_user_id uuid, p_action text, p_reason text, p_caller_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.reconcile_orphan_user(p_auth_user_id uuid, p_action text, p_reason text, p_caller_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.reconcile_orphan_user(p_auth_user_id uuid, p_action text, p_reason text, p_caller_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- reconcile_stock(p_store_id uuid, p_fix boolean, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'reconcile_stock'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_fix boolean, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.reconcile_stock(p_store_id uuid, p_fix boolean, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.reconcile_stock(p_store_id uuid, p_fix boolean, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- record_counted_quantity(p_count_id uuid, p_product_id uuid, p_counted_quantity numer…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'record_counted_quantity'
      AND pg_get_function_identity_arguments(p.oid) = 'p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid, p_notes text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.record_counted_quantity(p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid, p_notes text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.record_counted_quantity(p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid, p_notes text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- register_reception(p_store_id uuid, p_supplier text, p_reception_date timestamp…) → certified EXECUTE: PUBLIC, authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'register_reception'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone, p_invoice_number text, p_items jsonb, p_user_id uuid, p_po_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM true
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.register_reception(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone, p_invoice_number text, p_items jsonb, p_user_id uuid, p_po_id uuid) FROM anon;
    GRANT EXECUTE ON FUNCTION public.register_reception(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone, p_invoice_number text, p_items jsonb, p_user_id uuid, p_po_id uuid) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.register_reception(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone, p_invoice_number text, p_items jsonb, p_user_id uuid, p_po_id uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.register_reception(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone, p_invoice_number text, p_items jsonb, p_user_id uuid, p_po_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- register_stock_movement(p_product_id uuid, p_store_id uuid, p_quantity numeric, p_mo…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'register_stock_movement'
      AND pg_get_function_identity_arguments(p.oid) = 'p_product_id uuid, p_store_id uuid, p_quantity numeric, p_movement_type text, p_reason text, p_user_id uuid, p_variant_id uuid, p_sale_id uuid, p_unit_cost numeric, p_notes text, p_operation_date timestamp with time zone, p_skip_access_check boolean'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.register_stock_movement(p_product_id uuid, p_store_id uuid, p_quantity numeric, p_movement_type text, p_reason text, p_user_id uuid, p_variant_id uuid, p_sale_id uuid, p_unit_cost numeric, p_notes text, p_operation_date timestamp with time zone, p_skip_access_check boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.register_stock_movement(p_product_id uuid, p_store_id uuid, p_quantity numeric, p_movement_type text, p_reason text, p_user_id uuid, p_variant_id uuid, p_sale_id uuid, p_unit_cost numeric, p_notes text, p_operation_date timestamp with time zone, p_skip_access_check boolean) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- register_supplier_payment(p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount nu…) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'register_supplier_payment'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid, p_currency text, p_exchange_rate numeric, p_reference text, p_notes text, p_idempotency_key text, p_payment_date timestamp with time zone'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.register_supplier_payment(p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid, p_currency text, p_exchange_rate numeric, p_reference text, p_notes text, p_idempotency_key text, p_payment_date timestamp with time zone) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.register_supplier_payment(p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid, p_currency text, p_exchange_rate numeric, p_reference text, p_notes text, p_idempotency_key text, p_payment_date timestamp with time zone) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.register_supplier_payment(p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid, p_currency text, p_exchange_rate numeric, p_reference text, p_notes text, p_idempotency_key text, p_payment_date timestamp with time zone) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- reject_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'reject_transfer'
      AND pg_get_function_identity_arguments(p.oid) = 'p_transfer_id uuid, p_reason text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.reject_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.reject_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- release_expired_reservations() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'release_expired_reservations'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.release_expired_reservations() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- reopen_cash_shift(p_closure_id uuid, p_reason text, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'reopen_cash_shift'
      AND pg_get_function_identity_arguments(p.oid) = 'p_closure_id uuid, p_reason text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.reopen_cash_shift(p_closure_id uuid, p_reason text, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.reopen_cash_shift(p_closure_id uuid, p_reason text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- reset_store_data(target_store_id uuid, p_keep_catalog boolean, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'reset_store_data'
      AND pg_get_function_identity_arguments(p.oid) = 'target_store_id uuid, p_keep_catalog boolean, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.reset_store_data(target_store_id uuid, p_keep_catalog boolean, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.reset_store_data(target_store_id uuid, p_keep_catalog boolean, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- restore_store_backup(p_store_id uuid, p_backup_payload jsonb, p_mode text, p_conf…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'restore_store_backup'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_backup_payload jsonb, p_mode text, p_confirmation_token text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.restore_store_backup(p_store_id uuid, p_backup_payload jsonb, p_mode text, p_confirmation_token text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.restore_store_backup(p_store_id uuid, p_backup_payload jsonb, p_mode text, p_confirmation_token text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- restore_transaction_snapshot(p_migration_id text, p_tx_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'restore_transaction_snapshot'
      AND pg_get_function_identity_arguments(p.oid) = 'p_migration_id text, p_tx_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.restore_transaction_snapshot(p_migration_id text, p_tx_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.restore_transaction_snapshot(p_migration_id text, p_tx_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- reverse_adjustment(p_adjustment_id uuid, p_reason text, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'reverse_adjustment'
      AND pg_get_function_identity_arguments(p.oid) = 'p_adjustment_id uuid, p_reason text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.reverse_adjustment(p_adjustment_id uuid, p_reason text, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.reverse_adjustment(p_adjustment_id uuid, p_reason text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- reverse_commissions_on_sale_void() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'reverse_commissions_on_sale_void'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.reverse_commissions_on_sale_void() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.reverse_commissions_on_sale_void() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'reverse_devolution'
      AND pg_get_function_identity_arguments(p.oid) = 'p_devolution_id uuid, p_reason text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- reverse_inventory_adjustment_v2(p_adjustment_id uuid, p_reason text, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'reverse_inventory_adjustment_v2'
      AND pg_get_function_identity_arguments(p.oid) = 'p_adjustment_id uuid, p_reason text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.reverse_inventory_adjustment_v2(p_adjustment_id uuid, p_reason text, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.reverse_inventory_adjustment_v2(p_adjustment_id uuid, p_reason text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'reverse_production_order'
      AND pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid, p_reason text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- reverse_receipt(p_receipt_id uuid, p_reason text, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'reverse_receipt'
      AND pg_get_function_identity_arguments(p.oid) = 'p_receipt_id uuid, p_reason text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.reverse_receipt(p_receipt_id uuid, p_reason text, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.reverse_receipt(p_receipt_id uuid, p_reason text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- reverse_receipt_v2(p_receipt_id uuid, p_reason text, p_user_id uuid) → certified EXECUTE: PUBLIC, authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'reverse_receipt_v2'
      AND pg_get_function_identity_arguments(p.oid) = 'p_receipt_id uuid, p_reason text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM true
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.reverse_receipt_v2(p_receipt_id uuid, p_reason text, p_user_id uuid) FROM anon;
    GRANT EXECUTE ON FUNCTION public.reverse_receipt_v2(p_receipt_id uuid, p_reason text, p_user_id uuid) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.reverse_receipt_v2(p_receipt_id uuid, p_reason text, p_user_id uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.reverse_receipt_v2(p_receipt_id uuid, p_reason text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- reverse_transaction_v2(p_transaction_id uuid, p_reason text, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'reverse_transaction_v2'
      AND pg_get_function_identity_arguments(p.oid) = 'p_transaction_id uuid, p_reason text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.reverse_transaction_v2(p_transaction_id uuid, p_reason text, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.reverse_transaction_v2(p_transaction_id uuid, p_reason text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'reverse_transfer'
      AND pg_get_function_identity_arguments(p.oid) = 'p_transfer_id uuid, p_reason text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- reverse_vale_salida(p_slip_id uuid, p_reason text, p_user_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'reverse_vale_salida'
      AND pg_get_function_identity_arguments(p.oid) = 'p_slip_id uuid, p_reason text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.reverse_vale_salida(p_slip_id uuid, p_reason text, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.reverse_vale_salida(p_slip_id uuid, p_reason text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- save_ai_api_key(p_provider text, p_api_key text, p_label text) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'save_ai_api_key'
      AND pg_get_function_identity_arguments(p.oid) = 'p_provider text, p_api_key text, p_label text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.save_ai_api_key(p_provider text, p_api_key text, p_label text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.save_ai_api_key(p_provider text, p_api_key text, p_label text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- save_product_cost_sheet(p_product_id uuid, p_store_id uuid, p_template_id text, p_mo…) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'save_product_cost_sheet'
      AND pg_get_function_identity_arguments(p.oid) = 'p_product_id uuid, p_store_id uuid, p_template_id text, p_modalidad text, p_calculated_data jsonb, p_cost_price numeric'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.save_product_cost_sheet(p_product_id uuid, p_store_id uuid, p_template_id text, p_modalidad text, p_calculated_data jsonb, p_cost_price numeric) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.save_product_cost_sheet(p_product_id uuid, p_store_id uuid, p_template_id text, p_modalidad text, p_calculated_data jsonb, p_cost_price numeric) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.save_product_cost_sheet(p_product_id uuid, p_store_id uuid, p_template_id text, p_modalidad text, p_calculated_data jsonb, p_cost_price numeric) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- set_purchase_order_status(p_po_id uuid, p_new_status purchase_status_enum, p_user_id u…) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'set_purchase_order_status'
      AND pg_get_function_identity_arguments(p.oid) = 'p_po_id uuid, p_new_status purchase_status_enum, p_user_id uuid, p_reason text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.set_purchase_order_status(p_po_id uuid, p_new_status purchase_status_enum, p_user_id uuid, p_reason text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.set_purchase_order_status(p_po_id uuid, p_new_status purchase_status_enum, p_user_id uuid, p_reason text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.set_purchase_order_status(p_po_id uuid, p_new_status purchase_status_enum, p_user_id uuid, p_reason text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- set_received_service_status(p_service_id uuid, p_new_status text, p_user_id uuid, p_reas…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'set_received_service_status'
      AND pg_get_function_identity_arguments(p.oid) = 'p_service_id uuid, p_new_status text, p_user_id uuid, p_reason text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.set_received_service_status(p_service_id uuid, p_new_status text, p_user_id uuid, p_reason text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.set_received_service_status(p_service_id uuid, p_new_status text, p_user_id uuid, p_reason text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- set_transfer_approval_rule(p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeri…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'set_transfer_approval_rule'
      AND pg_get_function_identity_arguments(p.oid) = 'p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric, p_threshold_quantity numeric, p_approver_roles text[], p_is_active boolean, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.set_transfer_approval_rule(p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric, p_threshold_quantity numeric, p_approver_roles text[], p_is_active boolean, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.set_transfer_approval_rule(p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric, p_threshold_quantity numeric, p_approver_roles text[], p_is_active boolean, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- snapshot_commission_rule() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'snapshot_commission_rule'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.snapshot_commission_rule() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.snapshot_commission_rule() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- soft_delete_store(p_store_id uuid, p_deleted_by uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'soft_delete_store'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_deleted_by uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.soft_delete_store(p_store_id uuid, p_deleted_by uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.soft_delete_store(p_store_id uuid, p_deleted_by uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- sync_inventory_from_products(p_store_id uuid) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'sync_inventory_from_products'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.sync_inventory_from_products(p_store_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.sync_inventory_from_products(p_store_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- sync_product_has_movements() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'sync_product_has_movements'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.sync_product_has_movements() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.sync_product_has_movements() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- sync_product_stock() → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'sync_product_stock'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.sync_product_stock() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.sync_product_stock() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- update_receipt_item_tasa(p_receipt_item_id uuid, p_new_tasa_cambio_recepcion numeric,…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'update_receipt_item_tasa'
      AND pg_get_function_identity_arguments(p.oid) = 'p_receipt_item_id uuid, p_new_tasa_cambio_recepcion numeric, p_new_moneda_recepcion text, p_motivo text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.update_receipt_item_tasa(p_receipt_item_id uuid, p_new_tasa_cambio_recepcion numeric, p_new_moneda_recepcion text, p_motivo text, p_user_id uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.update_receipt_item_tasa(p_receipt_item_id uuid, p_new_tasa_cambio_recepcion numeric, p_new_moneda_recepcion text, p_motivo text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- update_reception_items(p_receipt_id uuid, p_item_updates jsonb, p_user_id uuid) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'update_reception_items'
      AND pg_get_function_identity_arguments(p.oid) = 'p_receipt_id uuid, p_item_updates jsonb, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.update_reception_items(p_receipt_id uuid, p_item_updates jsonb, p_user_id uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.update_reception_items(p_receipt_id uuid, p_item_updates jsonb, p_user_id uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.update_reception_items(p_receipt_id uuid, p_item_updates jsonb, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- update_transaction_taxes(p_transaction_id uuid, p_applied_taxes jsonb, p_tax_amount n…) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'update_transaction_taxes'
      AND pg_get_function_identity_arguments(p.oid) = 'p_transaction_id uuid, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.update_transaction_taxes(p_transaction_id uuid, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.update_transaction_taxes(p_transaction_id uuid, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.update_transaction_taxes(p_transaction_id uuid, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- upsert_manual_exchange_rate_with_audit(p_actor_id uuid, p_currency text, p_rate numeric, p_rate_dat…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'upsert_manual_exchange_rate_with_audit'
      AND pg_get_function_identity_arguments(p.oid) = 'p_actor_id uuid, p_currency text, p_rate numeric, p_rate_date date, p_source text, p_capture_method text, p_source_ip text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.upsert_manual_exchange_rate_with_audit(p_actor_id uuid, p_currency text, p_rate numeric, p_rate_date date, p_source text, p_capture_method text, p_source_ip text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.upsert_manual_exchange_rate_with_audit(p_actor_id uuid, p_currency text, p_rate numeric, p_rate_date date, p_source text, p_capture_method text, p_source_ip text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- upsert_store_cost_template(p_store_id uuid, p_template_id text, p_template_data jsonb, …) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'upsert_store_cost_template'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_template_id text, p_template_data jsonb, p_modalidad text, p_pdf_format text, p_created_by uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.upsert_store_cost_template(p_store_id uuid, p_template_id text, p_template_data jsonb, p_modalidad text, p_pdf_format text, p_created_by uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.upsert_store_cost_template(p_store_id uuid, p_template_id text, p_template_data jsonb, p_modalidad text, p_pdf_format text, p_created_by uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- upsert_usage_aggregate(p_bucket_start timestamp with time zone, p_bucket_end timest…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'upsert_usage_aggregate'
      AND pg_get_function_identity_arguments(p.oid) = 'p_bucket_start timestamp with time zone, p_bucket_end timestamp with time zone, p_metric_type text, p_service text, p_endpoint text, p_count integer, p_sum_value double precision'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.upsert_usage_aggregate(p_bucket_start timestamp with time zone, p_bucket_end timestamp with time zone, p_metric_type text, p_service text, p_endpoint text, p_count integer, p_sum_value double precision) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.upsert_usage_aggregate(p_bucket_start timestamp with time zone, p_bucket_end timestamp with time zone, p_metric_type text, p_service text, p_endpoint text, p_count integer, p_sum_value double precision) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- void_closed_production_order(p_order_id uuid, p_reason text, p_user_id uuid) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'void_closed_production_order'
      AND pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid, p_reason text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.void_closed_production_order(p_order_id uuid, p_reason text, p_user_id uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.void_closed_production_order(p_order_id uuid, p_reason text, p_user_id uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.void_closed_production_order(p_order_id uuid, p_reason text, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- void_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'void_inventory_adjustment'
      AND pg_get_function_identity_arguments(p.oid) = 'p_adjustment_id uuid, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.void_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.void_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.void_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- void_pending_reception(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operatio…) → certified EXECUTE: PUBLIC, authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'void_pending_reception'
      AND pg_get_function_identity_arguments(p.oid) = 'p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM true
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.void_pending_reception(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone) FROM anon;
    GRANT EXECUTE ON FUNCTION public.void_pending_reception(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.void_pending_reception(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.void_pending_reception(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- void_received_service_with_reversal(p_service_id uuid, p_user_id uuid, p_reason text, p_operatio…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'void_received_service_with_reversal'
      AND pg_get_function_identity_arguments(p.oid) = 'p_service_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.void_received_service_with_reversal(p_service_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.void_received_service_with_reversal(p_service_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operatio…) → certified EXECUTE: service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'void_reception_with_reversal'
      AND pg_get_function_identity_arguments(p.oid) = 'p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- void_transaction(p_transaction_id uuid, p_reason text, p_operation_date times…) → certified EXECUTE: PUBLIC, authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'void_transaction'
      AND pg_get_function_identity_arguments(p.oid) = 'p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM true
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone, p_user_id uuid) FROM anon;
    GRANT EXECUTE ON FUNCTION public.void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone, p_user_id uuid) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone, p_user_id uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone, p_user_id uuid) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- withdraw_production_item_deprecated_6arg(p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_…) → certified EXECUTE: owner only
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'withdraw_production_item_deprecated_6arg'
      AND pg_get_function_identity_arguments(p.oid) = 'p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.withdraw_production_item_deprecated_6arg(p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text) FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- withdraw_production_item_deprecated_9arg(p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_…) → certified EXECUTE: owner only
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'withdraw_production_item_deprecated_9arg'
      AND pg_get_function_identity_arguments(p.oid) = 'p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text, p_reference_id uuid, p_reference_doc text, p_server_side_cost boolean'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.withdraw_production_item_deprecated_9arg(p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text, p_reference_id uuid, p_reference_doc text, p_server_side_cost boolean) FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- withdraw_production_item_v3(p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uu…) → certified EXECUTE: authenticated, service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'withdraw_production_item_v3'
      AND pg_get_function_identity_arguments(p.oid) = 'p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text, p_reference_id uuid, p_reference_doc text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.withdraw_production_item_v3(p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text, p_reference_id uuid, p_reference_doc text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.withdraw_production_item_v3(p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text, p_reference_id uuid, p_reference_doc text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.withdraw_production_item_v3(p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text, p_reference_id uuid, p_reference_doc text) TO service_role;
  END IF;
END
$acl$;

