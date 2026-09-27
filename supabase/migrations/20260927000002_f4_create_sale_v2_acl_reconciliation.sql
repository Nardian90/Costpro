-- ============================================================================
-- F4 — Reconciliación definitiva de create_sale_v2: ACL de la firma /24
-- ============================================================================
-- Contexto (FASE F4 — audit/f4-create-sale-v2-reconciliation):
--
--   20260926000001_esec_price_integrity.sql     (E-SEC R-SEC-1)   → firma /21
--   20260927000001_esec_final_definitive_policy (E-SEC-FINAL D1-D5) → DROP /21 + CREATE /24
--
-- La migración E-SEC-FINAL redefinió la función (DROP+CREATE de la firma de 24
-- parámetros) pero NO reestableció su ACL. En un replay limpio
-- (supabase db reset) la función /24 quedaba con el ACL por defecto
-- (EXECUTE a PUBLIC, sin grants explícitos), divergiendo del estado certificado
-- LIVE: {PUBLIC, authenticated, service_role} — patrón canónico establecido por
-- 20260916000002_rem_inv_6_reconcile_function_acl.sql para la firma /21
-- (REVOKE FROM anon + GRANT TO PUBLIC/authenticated/service_role).
--
-- El despliegue directo de E-SEC-FINAL a LIVE (Management API, patrón REM/E-SEC)
-- dejó además una entrada explícita `anon=X` (ruido del despliegue; redundante
-- con PUBLIC y ajena al patrón canónico). Esta fase la normalizó en LIVE con:
--
--   REVOKE EXECUTE ON FUNCTION public.create_sale_v2(<24 args>) FROM anon;
--
-- (sin cambio de privilegios efectivos: anon conserva EXECUTE vía PUBLIC,
-- exactamente como en el estado certificado /21 pre-drift).
--
-- Esta migración cierra el drift en la cadena de migraciones para que
-- replay(limpio) == LIVE == snapshot certificado (contract-surface.sql):
--
--   grants EXECUTE = {PUBLIC, authenticated, service_role}
--
-- Patrón idéntico al de rem_inv_6 (firma actualizada a 24 parámetros).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text) TO service_role;

-- ----------------------------------------------------------------------------
-- Verificación post-aplicación (LIVE, ejecutada en la FASE F4-CI):
--   proacl    = {=X/postgres, postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
--   prosecdef = true | proconfig = {search_path=public, pg_temp}
--   pg_get_functiondef(oid) = 26981 chars (cuerpo E-SEC-FINAL intacto)
-- ----------------------------------------------------------------------------
