-- ============================================================================
-- Reconciliación ACL de create_sale_v2 firma /26 (canónica) — 2026-10-19
-- ============================================================================
-- Contexto:
--
--   20261017000000_pos_payment_incidents_negative_guard.sql (MISIÓN-FLEX,
--   PR #1415) creó el SEGUNDO create_sale_v2 de 26 params (+p_notes,
--   +p_payment_incidents) con CREATE OR REPLACE — que con lista de parámetros
--   DISTINTA no reemplaza sino que crea un OVERLOAD alongside la firma /24.
--
--   Ese CREATE no reestableció el ACL contractual: la función /26 quedó en la
--   BD viva con grants EXECUTE para PUBLIC y anon (estado verificado el
--   2026-10-19: proacl={=X, postgres=X, anon=X, authenticated=X,
--   service_role=X}), divergiendo del contrato H0-R §12. El drift era INVISIBLE
--   al contrato estático porque el overload /26 no estaba en el surface
--   certificado (la última certificación, 2026-10-15, capturó la firma /24) y
--   porque el replay-parser no podía ver funciones cuyas definiciones carecían
--   de terminadores de statement (fix del PR #1422).
--
--   20261018000001_drop_legacy_create_sale_v2_overload.sql (PR #1423) eliminó
--   la firma legada /24 de la BD viva — la /26 es ahora la ÚNICA firma y por
--   tanto la que debe cumplir el estado canónico.
--
-- CONTRATO H0-R §12 (doctrina f4 / 20260927000002): el estado canónico de
-- TODA función sensible es:
--
--   grants EXECUTE = {authenticated, service_role}  ·  PUBLIC/anon = REVOCADO
--
-- Este reconciler establece exactamente ese estado para la firma /26 (26
-- parámetros: los 24 de la firma endurecida + p_notes + p_payment_incidents).
--
-- Idempotente: REVOKE de grants ausentes es no-op; GRANT de grants presentes
-- es no-op. Sin cambios de cuerpo, columnas, RLS ni triggers.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text, p_notes text, p_payment_incidents jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text, p_notes text, p_payment_incidents jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text, p_notes text, p_payment_incidents jsonb) TO service_role;

-- ----------------------------------------------------------------------------
-- Verificación post-aplicación (H0-R — estado canónico):
--   proacl    = {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
--               (sin entrada de grantee vacío = rol genérico, sin anon)
--   Una sola fila para create_sale_v2 (firma /26, oid estable del deploy).
-- ----------------------------------------------------------------------------
