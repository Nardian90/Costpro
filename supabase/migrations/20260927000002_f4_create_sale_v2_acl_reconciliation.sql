-- ============================================================================
-- F4 — Reconciliación definitiva de create_sale_v2: ACL de la firma /24
-- [REESCRITA POR H0-R §12.3 — ANTI-RESURRECCIÓN]
-- ============================================================================
-- Contexto (FASE F4 → H0-R):
--
--   20260926000001_esec_price_integrity.sql     (E-SEC R-SEC-1)   → firma /21
--   20260927000001_esec_final_definitive_policy (E-SEC-FINAL D1-D5) → DROP /21 + CREATE /24
--
-- La migración E-SEC-FINAL redefinió la función (DROP+CREATE de la firma de 24
-- parámetros) sin reestablecer su ACL: en un replay limpio (supabase db reset)
-- la función /24 quedaba con el ACL por defecto (EXECUTE implícito para el
-- rol genérico de base de datos), divergiendo del estado certificado.
--
-- La versión ORIGINAL de este reconciler cerró aquel drift canonizando un
-- grant EXECUTE amplio (rol genérico incluido) — patrón identificado por la
-- FASE H1 como VECTOR DE RESURRECCIÓN del privilegio peligroso (T-AR-003):
-- cualquier replay futuro del chain volvía a abrir el RPC al oráculo anónimo
-- de claves de idempotencia (T-H1-003/T-H1-004).
--
-- CONTRATO H0-R §12 (CREATE-SALE-V2-HARDENING-SPEC-RECOVERED.md): el estado
-- canónico de TODA función sensible es:
--
--   grants EXECUTE = {authenticated, service_role}  ·  PUBLIC/anon = REVOCADO
--
-- Este reconciler reescrito establece exactamente ese estado para la firma /24.
-- Refuerzos posteriores en la cadena:
--   20261004130000_h0r_create_sale_v2_hardening.sql  (cuerpo endurecido + ACL)
--   20261004130004_h0r_acl_reconciler.sql            (reconciler final §12.3)
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text) TO service_role;

-- ----------------------------------------------------------------------------
-- Verificación post-aplicación (H0-R — estado canónico verificado en LIVE):
--   proacl    = {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
--               (sin entrada de grantee vacío = rol genérico, sin anon)
--   prosecdef = true | proconfig = {search_path=public, pg_temp}
-- ----------------------------------------------------------------------------
