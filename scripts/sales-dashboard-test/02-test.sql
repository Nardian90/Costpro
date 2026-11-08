-- ══ PRUEBAS DEL RPC get_sales_dashboard_analytics ══════════════════════════
-- Ejecutar como superuser: simula auth.uid() con SET LOCAL request.jwt.claim.sub
\set ON_ERROR_STOP on

-- ── T1: Admin (ambas tiendas, ámbito Centro) — cálculos exactos ────────────
BEGIN;
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT jsonb_pretty(
  public.get_sales_dashboard_analytics(
    '11111111-1111-1111-1111-111111111111'::uuid,
    '2026-11-01 00:00-05'::timestamptz, '2026-11-08 23:59-05'::timestamptz,
    '2026-10-01 00:00-05'::timestamptz, '2026-10-08 23:59-05'::timestamptz,
    NULL, NULL, NULL, 8)
) AS t1_admin_centro;
ROLLBACK;

-- ── T2: Clerk Ana (solo Centro) — mismo resultado que admin para Centro ────
BEGIN;
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
SELECT jsonb_pretty(
  public.get_sales_dashboard_analytics(
    '11111111-1111-1111-1111-111111111111'::uuid,
    '2026-11-01 00:00-05'::timestamptz, '2026-11-08 23:59-05'::timestamptz,
    '2026-10-01 00:00-05'::timestamptz, '2026-10-08 23:59-05'::timestamptz,
    NULL, NULL, NULL, 8)
) AS t2_ana_centro;
ROLLBACK;

-- ── T3: AISLAMIENTO — Ana NO puede ver Tienda Norte ────────────────────────
BEGIN;
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.get_sales_dashboard_analytics(
      '22222222-2222-2222-2222-222222222222'::uuid,
      '2026-11-01 00:00-05'::timestamptz, '2026-11-08 23:59-05'::timestamptz,
      '2026-10-01 00:00-05'::timestamptz, '2026-10-08 23:59-05'::timestamptz);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  IF v_err IS NULL OR v_err NOT LIKE '%ERR_PERMISSION_DENIED%' THEN
    RAISE EXCEPTION 'T3 FALLÓ: se esperaba ERR_PERMISSION_DENIED, llegó: %', COALESCE(v_err, 'NINGUNO');
  END IF;
  RAISE NOTICE 'T3 OK: aislamiento por tienda (Ana → Norte rechazado)';
END $$;
ROLLBACK;

-- ── T4: sin sesión → rechazo ───────────────────────────────────────────────
BEGIN;
SET LOCAL request.jwt.claim.sub = '';
DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.get_sales_dashboard_analytics(
      '11111111-1111-1111-1111-111111111111'::uuid,
      '2026-11-01 00:00-05'::timestamptz, '2026-11-08 23:59-05'::timestamptz,
      '2026-10-01 00:00-05'::timestamptz, '2026-10-08 23:59-05'::timestamptz);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  IF v_err IS NULL OR v_err NOT LIKE '%ERR_PERMISSION_DENIED%' THEN
    RAISE EXCEPTION 'T4 FALLÓ: se esperaba ERR_PERMISSION_DENIED, llegó: %', COALESCE(v_err, 'NINGUNO');
  END IF;
  RAISE NOTICE 'T4 OK: sin sesión → rechazado';
END $$;
ROLLBACK;

-- ── T5: ámbito global (store NULL) — Ana solo ve SU tienda, no Norte ───────
BEGIN;
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
SELECT
  (res->'kpi'->>'ops')::int AS ops_ana_global_debe_ser_5_sin_venta_norte,
  (res->'kpi'->>'net_cup')::numeric AS net_ana_global
  FROM public.get_sales_dashboard_analytics(NULL,
    '2026-11-01 00:00-05'::timestamptz, '2026-11-08 23:59-05'::timestamptz,
    '2026-10-01 00:00-05'::timestamptz, '2026-10-08 23:59-05'::timestamptz) res;
ROLLBACK;

-- ── T6: detalle por producto (drill-down) ──────────────────────────────────
BEGIN;
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.get_sales_dashboard_product_detail(
  '11111111-1111-1111-1111-111111111111'::uuid,
  '2026-11-01 00:00-05'::timestamptz, '2026-11-08 23:59-05'::timestamptz,
  'bbbbbbbb-0000-0000-0000-000000000001'::uuid) AS t6_detalle_refresco;
ROLLBACK;
