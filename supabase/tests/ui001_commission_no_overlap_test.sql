-- ============================================================================
-- CP-UI-001 (2/5) — PRUEBAS: constraint de exclusión de periodos de comisión
-- ============================================================================
-- Propósito: validar el EXCLUDE USING gist con btree_gist (rangos CERRADOS
--   '[]', parcial WHERE status <> 'cancelled') sobre commission_payments.
--   En CostproE2E conviven DOS constraints idénticos en definición:
--     · commission_payments_no_overlap (migración 20261022000002, CP-UI-001)
--     · no_overlapping_periods (migración 20260714000001 — efecto ya presente
--       en PRODUCCIÓN: la migración CP-UI-001 sería un duplicado allí).
--   Cualquiera de los dos rechaza; la batería no distingue el nombre.
-- Ejecución: CostproE2E, transaccional (BEGIN/ROLLBACK), cero residuos.
-- Cobertura (T2.3):
--   1. Pago vigente [01-01..01-31] → permitido.
--   2. Pago solapado [01-15..02-15] → RECHAZADO (exclusion_violation).
--   3. Pago contiguo [02-01..02-28] (sin día compartido) → permitido.
--   4. Frontera compartida [01-31..01-31] (el 01-31 está EN el rango cerrado
--      del pago 1) → RECHAZADO: dos periodos que comparten el día de corte son
--      solapados (semántica '[]').
--   5. Un pago CANCELADO no bloquea: cancelar el pago 1 y crear el solapado → OK.
--   6. Cancelar y recrear el MISMO periodo → OK (el cancelado sale del índice).
--   7. Reabrir (draft de nuevo) un cancelado SIN competencia → OK; CON
--      competencia (recreado) → RECHAZADO por el constraint (semántica BD; la
--      app hoy no ofrece "reabrir" en PATCH /api/commissions/payments/[id]).
--   8. Mismo rango, OTRO trabajador → permitido (la exclusión es por worker).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION test_assert(p_condition boolean, p_msg text) RETURNS void AS $test_assert_u1$
BEGIN
  IF NOT p_condition THEN
    RAISE EXCEPTION 'TEST_FAILED: %', p_msg;
  END IF;
END
$test_assert_u1$ LANGUAGE plpgsql;

-- Guard: el constraint debe existir (por cualquiera de sus dos nombres)
DO $u1_guard$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_constraint
  WHERE conrelid='public.commission_payments'::regclass AND contype='x';
  IF v_n = 0 THEN
    RAISE EXCEPTION 'GUARD: no hay constraint de exclusión en commission_payments; aplica la migración CP-UI-001';
  END IF;
END
$u1_guard$;

INSERT INTO public.tenants (id, name) VALUES
  ('b5e10000-0000-0000-0000-0000000000aa', 'U1_TENANT');
INSERT INTO public.stores (id, name, tenant_id) VALUES
  ('b5e10000-0000-0000-0000-000000000001', 'U1_TIENDA', 'b5e10000-0000-0000-0000-0000000000aa');
INSERT INTO public.workers (id, store_id, first_name, last_name, ci) VALUES
  ('b5e10000-0000-0000-0000-00000000d001', 'b5e10000-0000-0000-0000-000000000001', 'U1', 'WORKER1', 'U1CI000001'),
  ('b5e10000-0000-0000-0000-00000000d002', 'b5e10000-0000-0000-0000-000000000001', 'U1', 'WORKER2', 'U1CI000002');

-- Helper: intento de INSERT que debe rebotar por el constraint
CREATE OR REPLACE FUNCTION u1_expect_reject(p_start date, p_end date, p_worker uuid) RETURNS void AS $u1_expect_reject$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.commission_payments
      (store_id, worker_id, period_start, period_end, status)
    VALUES
      ('b5e10000-0000-0000-0000-000000000001'::uuid, p_worker, p_start, p_end, 'draft');
  EXCEPTION
    WHEN exclusion_violation THEN v_rejected := true;
    WHEN unique_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'TEST_FAILED: el pago [%..%] debería haber sido RECHAZADO por el constraint de exclusión', p_start, p_end;
  END IF;
END
$u1_expect_reject$ LANGUAGE plpgsql;

-- 1. Pago base vigente
INSERT INTO public.commission_payments (store_id, worker_id, period_start, period_end, status)
VALUES ('b5e10000-0000-0000-0000-000000000001'::uuid, 'b5e10000-0000-0000-0000-00000000d001'::uuid, '2026-01-01', '2026-01-31', 'draft');

-- 2. Solapado real → rechazado
SELECT u1_expect_reject('2026-01-15'::date, '2026-02-15'::date, 'b5e10000-0000-0000-0000-00000000d001'::uuid);

-- 3. Contiguo sin día compartido → permitido
INSERT INTO public.commission_payments (store_id, worker_id, period_start, period_end, status)
VALUES ('b5e10000-0000-0000-0000-000000000001'::uuid, 'b5e10000-0000-0000-0000-00000000d001'::uuid, '2026-02-01', '2026-02-28', 'draft');

-- 4. Frontera compartida (rango cerrado '[]') → rechazado
SELECT u1_expect_reject('2026-01-31'::date, '2026-01-31'::date, 'b5e10000-0000-0000-0000-00000000d001'::uuid);

-- 5. Un pago CANCELADO no bloquea (rango [01-15..01-20]: solapa el cancelado
--    [01-01..01-31] y es disjunto del contiguo [02-01..02-28] del caso 3)
UPDATE public.commission_payments SET status='cancelled'
WHERE worker_id='b5e10000-0000-0000-0000-00000000d001'::uuid AND period_start='2026-01-01';
INSERT INTO public.commission_payments (store_id, worker_id, period_start, period_end, status)
VALUES ('b5e10000-0000-0000-0000-000000000001'::uuid, 'b5e10000-0000-0000-0000-00000000d001'::uuid, '2026-01-15', '2026-01-20', 'draft');

-- 6. Cancelar y recrear el MISMO periodo → permitido
--    (se cancela también el [01-15..01-20] del caso 5 para dejar limpia la mesa)
UPDATE public.commission_payments SET status='cancelled'
WHERE worker_id='b5e10000-0000-0000-0000-00000000d001'::uuid AND period_start='2026-01-15';
INSERT INTO public.commission_payments (store_id, worker_id, period_start, period_end, status)
VALUES ('b5e10000-0000-0000-0000-000000000001'::uuid, 'b5e10000-0000-0000-0000-00000000d001'::uuid, '2026-01-01', '2026-01-31', 'draft');

-- 7. Reabrir
-- 7a. con competencia (el recreado #6 sigue vigente) → el cancelado no puede volver
DO $u1_7a$
DECLARE
  v_rejected boolean := false;
  v_cancelled_id uuid;
BEGIN
  SELECT id INTO v_cancelled_id FROM public.commission_payments
  WHERE worker_id='b5e10000-0000-0000-0000-00000000d001'::uuid
    AND period_start='2026-01-01' AND status='cancelled' LIMIT 1;
  BEGIN
    UPDATE public.commission_payments SET status='draft' WHERE id = v_cancelled_id;
  EXCEPTION
    WHEN exclusion_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'TEST_FAILED: reabrir un cancelado con competencia debería rechazarse (exclusion_violation)';
  END IF;
END
$u1_7a$;
-- 7b. sin competencia → reabrir permitido (se cancela el recreado y vuelve el original)
UPDATE public.commission_payments SET status='cancelled'
WHERE worker_id='b5e10000-0000-0000-0000-00000000d001'::uuid AND period_start='2026-01-01' AND status='draft';
DO $u1_7b$
DECLARE
  v_back boolean := false;
  v_cancelled_id uuid;
BEGIN
  SELECT id INTO v_cancelled_id FROM public.commission_payments
  WHERE worker_id='b5e10000-0000-0000-0000-00000000d001'::uuid
    AND period_start='2026-01-01' AND status='cancelled'
  ORDER BY created_at ASC LIMIT 1;
  UPDATE public.commission_payments SET status='draft' WHERE id = v_cancelled_id;
  SELECT count(*) = 1 INTO v_back FROM public.commission_payments
  WHERE id = v_cancelled_id AND status='draft';
  IF NOT v_back THEN
    RAISE EXCEPTION 'TEST_FAILED: reabrir un cancelado sin competencia debería permitir el UPDATE';
  END IF;
END
$u1_7b$;

-- 8. Mismo rango, OTRO trabajador → permitido
INSERT INTO public.commission_payments (store_id, worker_id, period_start, period_end, status)
VALUES ('b5e10000-0000-0000-0000-000000000001'::uuid, 'b5e10000-0000-0000-0000-00000000d002'::uuid, '2026-01-01', '2026-01-31', 'draft');

-- Resumen de la mesa de pruebas
SELECT test_assert((SELECT count(*) FROM public.commission_payments
  WHERE worker_id IN ('b5e10000-0000-0000-0000-00000000d001'::uuid,'b5e10000-0000-0000-0000-00000000d002'::uuid)
    AND status <> 'cancelled') = 3,
  'U1: deben quedar 3 pagos vigentes (contiguo d001, reabierto d001, d002) y los demás cancelados');

ROLLBACK;
