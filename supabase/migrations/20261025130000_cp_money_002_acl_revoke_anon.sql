-- ============================================================================
-- 20261025130000 · CP-MONEY-002 (D5-ACL, posmerge #1469): REVOKE PUBLIC/anon
-- sobre la firma /32 de create_sale_v2 creada por la companion 20261025120000.
--
-- CONTEXTO Y EVIDENCIA (2026-10-24, solo lectura contra producción):
--   · La companion hace DROP de la firma legada /31 y CREATE de la /32 como
--     función NUEVA. En Supabase, toda función nueva creada por postgres (o
--     supabase_admin) en el schema public hereda el default ACL verificado en
--     pg_default_acl: {postgres=X, anon=X, authenticated=X, service_role=X}.
--   · La /31 viva hoy NO tiene anon (pro ACL: {postgres, authenticated,
--     service_role}) porque fue endurecida expresamente: REVOKE PUBLIC/anon en
--     20260807000003_v2_16_3, 20260810000070_pr4_4e, 20260927000001_esec
--     («vector #6 de resurrección») y 20261004130000_h0r_create_sale_v2_hardening
--     §17.2 («REVOKE FROM PUBLIC es el que cierra de verdad; anon hereda de
--     PUBLIC; el REVOKE FROM anon adicional normaliza»).
--   · Sin este REVOKE, tras aplicar la companion la /32 nacería con anon=X:
--     (1) regresión de superficie ejecutable respecto a la /31 endurecida y
--     (2) el check EN VIVO `secdef_public_grant` (scripts/ci-gate-sql-checks.js,
--     tolerancia CERO, allowlist vacía) marcaría SQL DB Security Checks en
--     ROJO en el primer run de CI posterior a la ventana.
--
-- PROPIEDADES:
--   · Idempotente: re-ejecutar no produce error ni cambia el ACL resultante
--     (REVOKE de privilegios que ya no están concedidos es no-op).
--   · Forward-only: no reescribe ni depende de re-ejecutar migraciones
--     históricas; se aplica DESPUÉS de 20261025120000 (orden por filename).
--   · Explota el mismo bloqueo que el resto del repo: la autorización real
--     vive DENTRO de create_sale_v2 (ERR_UNAUTHORIZED para auth.uid() nulo,
--     binding seller/actor y aislamiento por tienda verificados en BD
--     aislada); el REVOKE elimina la exposición RPC a anónimos en origen.
--
-- ORDEN DE APLICACIÓN (ventana autorizada): 20261025120000 → este archivo.
-- Verificación posterior esperada (SELECT de lectura):
--   proacl == {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   (sin «=X» para anon ni PUBLIC) y has_function_privilege('anon',
--   'create_sale_v2(...)', 'EXECUTE') == false.
-- ============================================================================

-- Cierre del vector PUBLIC (anon hereda de PUBLIC; cerrar PUBLIC solo no
-- retira un anon concedido DIRECTAMENTE por el default ACL de Supabase —
-- por eso se requieren AMBOS revoke, igual que el precedente §17.2 H0R).
REVOKE EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text, p_notes text, p_payment_incidents jsonb, p_cash_received_cup numeric, p_cash_received_usd numeric, p_change_given_cup numeric, p_change_given_usd numeric, p_change_currency text, p_payment_components jsonb) FROM PUBLIC;

-- Normalización del grant DIRECTO a anon heredado del pg_default_acl de
-- Supabase (rol objetivo de este proyecto; en entornos no-Supabase este rol
-- no existe y el statement aborta la migración — comportamiento aceptable
-- porque el único entorno de aplicación autorizado es Supabase).
REVOKE EXECUTE ON FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text, p_notes text, p_payment_incidents jsonb, p_cash_received_cup numeric, p_cash_received_usd numeric, p_change_given_cup numeric, p_change_given_usd numeric, p_change_currency text, p_payment_components jsonb) FROM anon;

-- Recarga del caché de PostgREST (patrón del repo): la retirada de EXECUTE
-- para anon debe reflejarse inmediatamente en el endpoint REST.
NOTIFY pgrst, 'reload schema';
