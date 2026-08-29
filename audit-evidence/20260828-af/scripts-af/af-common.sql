-- ============================================================================
-- af-common.sql — Fixture compartido + helpers de aserción (W6 casos A–F)
-- Lab: costpro_audit_v2 @ 127.0.0.1:5433 — SOLO LABORATORIO
-- Procedencia: W6.0 canonical cases (definiciones canónicas del dueño, §14)
-- IDs deterministas para reproducibilidad bit-a-bit.
-- ============================================================================

-- Identidades del fixture (deterministas)
-- U  = 11111111-1111-1111-1111-111111111111  (usuario admin del audit)
-- S  = 22222222-2222-2222-2222-222222222222  (tienda del audit)
-- PA = 33333333-3333-3333-3333-33333333a001  (producto caso A)
-- PB = ...a002  PC = ...a003  PD = ...a004
-- PE_MP = ...a005  PE_PT = ...a006  PF = ...a007
\set U 11111111-1111-1111-1111-111111111111
\set S 22222222-2222-2222-2222-222222222222
\set PA 33333333-3333-3333-3333-33333333a001
\set PB 33333333-3333-3333-3333-33333333a002
\set PC 33333333-3333-3333-3333-33333333a003
\set PD 33333333-3333-3333-3333-33333333a004
\set PEMP 33333333-3333-3333-3333-33333333a005
\set PEPT 33333333-3333-3333-3333-33333333a006
\set PF 33333333-3333-3333-3333-33333333a007

-- Contexto JWT del shim (llamadas RPC con usuario autenticado)
SET LOCAL request.jwt.claim.sub = :'U';
SET LOCAL request.jwt.claim.role = 'authenticated';

-- ── Fixture base (idempotente dentro de la TX del caso) ──
INSERT INTO auth.users (id) VALUES (:'U'::uuid) ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, role, full_name, is_active)
VALUES (:'U'::uuid, 'admin', 'AF Forensic Auditor', true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.stores (id, name) VALUES (:'S'::uuid, 'AF Audit Store')
ON CONFLICT (id) DO NOTHING;

-- Helper: recepción canónica pending→confirm (camino E-R del catálogo 61)
-- UUIDs del fixture incrustados como literales deterministas (psql no interpola
-- variables dentro de dollar-quotes): S=22222222-…, U=11111111-…
CREATE OR REPLACE FUNCTION pg_temp.af_reception(p_product uuid, p_qty numeric, p_cost numeric, p_tag text, p_opdate timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_r uuid;
BEGIN
  INSERT INTO public.receipts (id, store_id, user_id, status, reference_doc)
  VALUES (gen_random_uuid(), '22222222-2222-2222-2222-222222222222'::uuid,
          '11111111-1111-1111-1111-111111111111'::uuid, 'pending', 'AF-'||p_tag)
  RETURNING id INTO v_r;
  INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost, tasa_cambio_recepcion)
  VALUES (v_r, p_product, p_qty, p_cost, 1.0);
  PERFORM public.confirm_pending_reception(v_r, '11111111-1111-1111-1111-111111111111'::uuid,
    COALESCE(p_opdate, '2026-08-28 10:00:00+00'::timestamptz));
  RETURN v_r;
END $fn$;

-- Helper de aserción: emite fila canónica ASSERT|id|desc|expected|actual|PASS/FAIL
CREATE OR REPLACE FUNCTION pg_temp.af_assert(p_id text, p_desc text, p_expected numeric, p_actual numeric)
RETURNS text LANGUAGE sql AS $fn$
  SELECT 'ASSERT|' || p_id || '|' || p_desc || '|expected=' || p_expected || '|actual=' || p_actual ||
         '|' || CASE WHEN round(p_expected,6) = round(p_actual,6) THEN 'PASS' ELSE 'FAIL' END
$fn$;
CREATE OR REPLACE FUNCTION pg_temp.af_assert_bool(p_id text, p_desc text, p_expected boolean, p_actual boolean)
RETURNS text LANGUAGE sql AS $fn$
  SELECT 'ASSERT|' || p_id || '|' || p_desc || '|expected=' || p_expected || '|actual=' || p_actual ||
         '|' || CASE WHEN p_expected IS NOT DISTINCT FROM p_actual THEN 'PASS' ELSE 'FAIL' END
$fn$;

-- Helper: hash de estado del producto (stock, WAC, cost_price) + movimientos
CREATE OR REPLACE FUNCTION pg_temp.af_state_hash(p_product uuid)
RETURNS text LANGUAGE sql AS $fn$
  SELECT md5(coalesce((
    SELECT json_agg(row_to_json(t))::text FROM (
      SELECT p.stock_current, p.cost_average, p.cost_price,
             (SELECT coalesce(json_agg(row_to_json(m)),'[]'::json) FROM (
                SELECT movement_type, quantity_change, unit_cost, balance_after
                FROM public.stock_movements WHERE product_id = p_product
                ORDER BY movement_date, created_at) m) AS movements
      FROM public.products p WHERE p.id = p_product
    ) t)::text, 'null'))
$fn$;

\echo '── fixture listo ──'
