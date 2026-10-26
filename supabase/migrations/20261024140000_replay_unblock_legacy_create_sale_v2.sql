-- ============================================================================
-- CP-E2E-RECONCILE-004 — DESBLOQUEO DEL REPLAY: retiro de los overloads
-- legados de create_sale_v2 (firmas /26 y /31) ANTES de la antigua
-- posición 75 (20261024150000).
--
-- CAUSA HISTÓRICA (documentada con evidencia por el propio repo):
--   · CP-E2E-RECONCILE-003 (2026-10-27, docs/audits/
--     CP_E2E_RECONCILE_003_REPLAY_C2_C3.md §6–§7): el replay C2 sobre
--     CostproE2E aplicó 72–74 y la posición 75 (20261024150000) ABORTÓ de
--     forma determinista con `42725: function name "public.create_sale_v2"
--     is not unique` — rollback íntegro probado en vivo, cero daño.
--   · CP-MONEY-002 (docs/audits/CP_MONEY_002_POSTMERGE_AUDITORIA_2026-10-24.md
--     §9.2, evidencia S-06) ya lo había predicho: la 20261024150000 sobre una
--     BD con firma /31 viva «ABORTA inofensivamente con 42725 y hace rollback
--     completo».
--
--   El stream aplicado con fidelidad llega a la posición 75 con DOS firmas
--   legadas vivas y NINGÚN DROP en el stream retira la primera:
--     · /26 — creada por 20261017000000 (pos_payment_incidents, ≤71). Censo
--       exhaustivo de `DROP FUNCTION` × `create_sale_v2` en
--       supabase/migrations/: ninguna migración la elimina.
--     · /31 — creada por 20261023230000 (v2.24.0) y reemplazada IN PLACE por
--       20261024120000 (v2.24.1); su DROP calificado está en 20261025120000
--       (antigua posición 80), DESPUÉS de la 75.
--   En ese estado, el `CREATE OR REPLACE` de la firma /32 de la 20261024150000
--   crea un TERCER overload y su `COMMENT ON FUNCTION public.create_sale_v2`
--   (línea 1183) — SIN lista de argumentos — es ambiguo: 42725 + rollback.
--   La 20261025120000 (línea 1253) bloquearía igual: su DROP solo retira la
--   /31 y quedaría /26 + /32 al ejecutar su propio COMMENT sin calificar.
--
-- CORRECCIÓN MÍNIMA (Opción A del dictamen RECONCILE-003 §13):
--   Retirar aquí las DOS firmas legadas exactas para que, al ejecutarse la
--   migración siguiente (20261024150000), la /32 nazca como firma ÚNICA y su
--   COMMENT resuelva sin ambigüedad; la 20261025120000 queda entonces
--   idempotente: DROP IF EXISTS no-op + CREATE OR REPLACE in place + COMMENT
--   único. El estado final convergente es el ya certificado por el repo:
--   UNA sola firma /32 (p_payment_components) con EXECUTE para
--   authenticated + service_role y anon revocado (20261025130000).
--
-- POR QUÉ ESTE TIMESTAMP Y ESTA POSICIÓN (20261024140000):
--   El orden de aplicación ES el lexicográfico por nombre de archivo (regla
--   oficial del runner — docs/e2e/E2E_AISLADO.md §2 nota de orden): queda
--   estrictamente después de 20261024120000 (última aplicada y registrada en
--   CostproE2E, posición 74) y estrictamente antes de 20261024150000
--   (antigua 75). Insertar ENTRE ambas preserva el orden de dependencias: la
--   /31 ya existe en su versión final (v2.24.1) y la /32 todavía no.
--   Precedentes del propio repo: 20261018000001 (retiro calificado del
--   overload legado /24, mismo patrón) y las inserciones retrospectivas
--   20261024230000/20261024400000/20261025130000 (creadas cuando
--   20261025120000 ya existía en el árbol). El generador oficial
--   (scripts/e2e/build-migrations-replay.mjs) ordena por nombre y solo exige
--   monotonicidad de FECHA (YYYYMMDD) — sin colisión aquí (20261024).
--
-- SEGURIDAD:
--   · DROP FUNCTION IF EXISTS calificado, SIN CASCADE: si existiera una
--     dependencia inesperada (vista/trigger/defecto de columna/policy sobre
--     estas firmas), el DROP FALLA (fail-safe) y la migración aborta con
--     rollback — nunca arrastra objetos ajenos. Censo estático del stream: 0
--     vistas/triggers/defaults/policies referencian las firmas /26 o /31
--     (solo comentarios, literales de idempotencia y ACL calificadas).
--   · La firma final certificada /32 NO se toca: este archivo NO contiene
--     CREATE de create_sale_v2 ni DROP alguno de la /32.
--   · Entornos ya certificados (firma /32 única, p. ej. producción tras la
--     companion): ambos DROP son no-ops (IF EXISTS sobre firmas ausentes).
--   · Cero DML. Cero tablas/columnas. Cero roles, membresías, políticas RLS,
--     triggers o datos. Los GRANTs de las firmas retiradas mueren con ellas
--     — es exactamente el retiro certificado por CP-MONEY-002 D2; el estado
--     final de ACL queda definido por 20261024150000/20261025120000 (GRANT)
--     y 20261025130000 (REVOKE a PUBLIC/anon).
--
-- NO APLICADA aquí: este archivo se aplica por el procedimiento autorizado
-- del propietario (apilador oficial E2E / procedimiento manual productivo);
-- ver expedientes CP-E2E-RECONCILE-003 §13 y CP-E2E-RECONCILE-004.
-- ============================================================================

-- Firma legada /26 (20261017000000, pos_payment_incidents): 26 argumentos,
-- termina en p_payment_incidents jsonb.
DROP FUNCTION IF EXISTS public.create_sale_v2(
  p_store_id uuid,
  p_seller_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_discount_type text,
  p_discount_value numeric,
  p_applied_taxes jsonb,
  p_tax_amount numeric,
  p_total_amount numeric,
  p_subtotal numeric,
  p_cash_amount numeric,
  p_transfer_amount numeric,
  p_zelle_amount numeric,
  p_sale_currency text,
  p_sale_exchange_rate numeric,
  p_customer_id uuid,
  p_customer_name text,
  p_supervisor_user_id uuid,
  p_idempotency_key text,
  p_operation_date timestamp with time zone,
  p_user_id uuid,
  p_supervisor_token_jti text,
  p_supervisor_scope jsonb,
  p_discount_reason text,
  p_notes text,
  p_payment_incidents jsonb
);

-- Firma legada /31 (20261023230000 v2.24.0 → 20261024120000 v2.24.1):
-- 31 argumentos, termina en p_change_currency text.
DROP FUNCTION IF EXISTS public.create_sale_v2(
  p_store_id uuid,
  p_seller_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_discount_type text,
  p_discount_value numeric,
  p_applied_taxes jsonb,
  p_tax_amount numeric,
  p_total_amount numeric,
  p_subtotal numeric,
  p_cash_amount numeric,
  p_transfer_amount numeric,
  p_zelle_amount numeric,
  p_sale_currency text,
  p_sale_exchange_rate numeric,
  p_customer_id uuid,
  p_customer_name text,
  p_supervisor_user_id uuid,
  p_idempotency_key text,
  p_operation_date timestamp with time zone,
  p_user_id uuid,
  p_supervisor_token_jti text,
  p_supervisor_scope jsonb,
  p_discount_reason text,
  p_notes text,
  p_payment_incidents jsonb,
  p_cash_received_cup numeric,
  p_cash_received_usd numeric,
  p_change_given_cup numeric,
  p_change_given_usd numeric,
  p_change_currency text
);

-- Verificación post-aplicación (manual, en el editor SQL):
--   SELECT p.oid, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'create_sale_v2';
--   → tras la posición siguiente (20261024150000) debe retornar UNA fila
--     (la de 32 params, p_payment_components). Antes de ella: cero filas.
--   Tras la 20261025120000: UNA fila (la de 32 params, idéntica).
--   Luego: NOTIFY pgrst, 'reload schema' (patrón del repo) para refrescar
--   el cache de PostgREST.
