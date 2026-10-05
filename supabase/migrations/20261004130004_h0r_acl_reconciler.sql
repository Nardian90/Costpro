-- ============================================================================
-- H0-R IMPLEMENTATION — FASE H1 · RECONCILER DEFINITIVO DE ACL (§12.3)
-- ============================================================================
-- Contrato: CREATE-SALE-V2-HARDENING-SPEC-RECOVERED.md §12 (anti-resurrección).
--
-- REESCRITURA DEL PATRÓN CANÓNICO DE RECONCILIACIÓN: el patrón F4/rem_inv_6
-- anterior canonizaba EXECUTE para PUBLIC sobre create_sale_v2 (vector de
-- resurrección #4/#5). El estado certificado a partir de esta fase es:
--
--   create_sale_v2 /24            → {postgres, authenticated, service_role}
--   update_transaction_taxes /3   → {costpro_transaction_adjuster, authenticated, service_role}
--
-- NEVER: entrada "=X" (grantee vacío = PUBLIC) ni "anon=X" en proacl. Este
-- reconciler corre AL FINAL de la cadena de migraciones: replay(limpio) ==
-- LIVE == snapshot certificado. Idempotente: solo actúa si hay drift.
-- El census CI (security-gate) debe validar: (a) grants literalmente
-- peligrosos en migraciones, (b) DROP+CREATE sin REVOKE, (c) proacl LIVE,
-- (d) contract-surface sin la entrada de PUBLIC.
-- ============================================================================

DO $acl$
BEGIN
  -- create_sale_v2 (firma /24) → EXECUTE: authenticated + service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'create_sale_v2'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text) TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- update_transaction_taxes (firma /3 endurecida) → EXECUTE: authenticated + service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'update_transaction_taxes'
      AND pg_get_function_identity_arguments(p.oid) = 'p_transaction_id uuid, p_applied_taxes jsonb, p_reason text'
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.update_transaction_taxes(p_transaction_id uuid, p_applied_taxes jsonb, p_reason text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.update_transaction_taxes(p_transaction_id uuid, p_applied_taxes jsonb, p_reason text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.update_transaction_taxes(p_transaction_id uuid, p_applied_taxes jsonb, p_reason text) TO service_role;
  END IF;
END
$acl$;
