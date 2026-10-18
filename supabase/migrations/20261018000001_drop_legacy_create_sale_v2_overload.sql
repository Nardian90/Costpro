-- ============================================================================
-- FIX AMBIGÜEDAD DE OVERLOAD create_sale_v2 (2026-10-18) — MISIÓN FECHAS DE
-- TRABAJO.
--
-- PROBLEMA (hallazgo verificado contra la BD viva durante la misión):
--   La migración 20261017000000 (MISIÓN-FLEX, PR #1415) creó un SEGUNDO
--   create_sale_v2 con 26 params (+ p_notes, + p_payment_incidents) usando
--   CREATE OR REPLACE — que con lista de parámetros DISTINTA no reemplaza
--   sino que crea un OVERLOAD. Resultado: la BD quedó con DOS funciones:
--     · oid 144702 — 24 params (legado)
--     · oid 166610 — 26 params (MISIÓN-FLEX, canónica: superconjunto estricto)
--   PostgREST no puede desambiguar una llamada con los 24 args nombrados
--   (ambas candidatas aplican: la de 26 acepta los 24 con defaults) →
--   error PGRST203 «Could not choose the best candidate function» →
--   /api/pos/checkout y /api/sync/batch fallaban con 400 en TODA venta sin
--   nota ni incidencias de pago (evidencia: sonda directa contra
--   /rest/v1/rpc/create_sale_v2 con 24 args → PGRST203; con p_notes →
--   resuelve al de 26 y entra al cuerpo).
--
-- CORRECCIÓN MÍNIMA (dos capas, la 2ª es esta migración):
--   1. APP (ya en este PR): las rutas /api/pos/checkout y /api/sync/batch
--      envían SIEMPRE p_notes y p_payment_incidents (null cuando ausentes)
--      → resolución única al overload de 26 params desde el deploy de la app.
--   2. BD (esta migración): elimina el overload LEGADO de 24 params para que
--      cualquier llamada con 24 args nombrados (presente o futura) también
--      resuelva — la de 26 params es un superconjunto estricto con defaults
--      idénticos, por lo que el comportamiento observable NO cambia.
--
-- SEGURIDAD:
--   · DROP FUNCTION solo toca la firma legada exacta (24 args). IF EXISTS →
--     idempotente (si ya se aplicó o el entorno nunca tuvo el overload, no
--     falla).
--   · Sin cambios de columnas, RLS, grants ni triggers.
--   · Aplicación por el procedimiento autorizado del propietario (igual que
--     la migración 20261018000000 del PR #1422 — NO aplicada aquí).
-- ============================================================================

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
  p_discount_reason text
);

-- Verificación post-aplicación (manual, en el editor SQL):
--   SELECT p.oid, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'create_sale_v2';
--   → debe retornar UNA fila (la de 26 params).
--   Luego: NOTIFY pgrst, 'reload schema' (o reinicio) para refrescar el cache.
