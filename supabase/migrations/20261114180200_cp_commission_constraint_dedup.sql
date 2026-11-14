-- ═══════════════════════════════════════════════════════════════════════════
-- CP-COMMISSION-CONSTRAINT — ELIMINAR LA RESTRICCIÓN DUPLICADA DE COMISIONES
-- Misión CP-SECURITY-AND-BACKLOG-CLOSURE-001 (2026-11-14)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DUPLICACIÓN COMPROBADA en producción (2026-11-14 [MEDIDO], fase 1):
--   commission_payments tiene DOS restricciones EXCLUDE con la MISMA
--   semántica (pg_constraint, contype='x'):
--     1. no_overlapping_periods
--        (migración 20260714000001_commission_no_overlap_constraint.sql,
--         aplicada fuera del registro schema_migrations — regla 11 del
--         expediente SEC-003/UI-001)
--        EXCLUDE USING gist (worker_id WITH =, daterange(period_start,
--        period_end, '[]') WITH &&) WHERE (status <> 'cancelled')
--     2. commission_payments_no_overlap
--        (migración 20261022000002_cp_ui_001_commission_payments_no_overlap.sql,
--         aplicada 2026-11-08 con la autorización «AUTORIZO SEC-003 UI-001
--         PROD», opción B del propietario)
--        EXCLUDE USING gist (worker_id WITH =, daterange(period_start,
--        period_end, '[]') WITH &&) WHERE (status <> 'cancelled')
--
-- RESTRICCIÓN CANÓNICA QUE PERMANECE: commission_payments_no_overlap
--   · Es la vigente documentada en el libro (fila 20261022000002) y en el
--     expediente de la opción B del propietario.
--   · Su migración tiene guard fail-closed de pre-condición (0 solapes) e
--     idempotencia; la de julio no.
--   · Sigue la convención de nombres tabla_regla del esquema.
--   · La aplicación y los tests (ui001_commission_no_overlap_test.sql) no
--     dependen del nombre no_overlapping_periods [verificado por grep].
--
-- SEGURIDAD DE LA ELIMINACIÓN:
--   · Se elimina SOLO la duplicación comprobada: guard fail-closed que
--     exige que la canónica EXISTA con la semántica correcta antes de
--     tocar la duplicada; si no existe, ABORTA (nunca deja la tabla sin
--     protección).
--   · DROP CONSTRAINT no toca datos: la validación vigente la sigue
--     ejerciendo la restricción canónica (mismo predicado, mismo índice
--     GiST subyacente reconstruido por la canónica).
--   · Verificación previa de que los datos cumplen la restricción que
--     permanece: la canónica ya está VIVA y siendo evaluada (0 solapes
--     vigentes garantizado por su propio guard al aplicarse y por la
--     duplicada hasta hoy — eliminar una de dos restricciones idénticas
--     no puede invalidar dato alguno).
--
-- REVERSIBILIDAD: ALTER TABLE public.commission_payments ADD CONSTRAINT
--   no_overlapping_periods EXCLUDE USING gist (worker_id WITH =,
--   daterange(period_start, period_end, '[]') WITH &&)
--   WHERE (status <> 'cancelled');
--
-- Idempotente: IF EXISTS + verificación.
-- ═══════════════════════════════════════════════════════════════════════════

DO $cp_commission_dedup$
DECLARE
  v_canonica_def text;
  v_duplicada_def text;
  v_canonica_existe boolean;
  v_duplicada_existe boolean;
BEGIN
  -- 1) Estado real por catálogo (pg_constraint)
  SELECT pg_get_constraintdef(oid) INTO v_canonica_def
    FROM pg_constraint
   WHERE conrelid = 'public.commission_payments'::regclass
     AND contype = 'x' AND conname = 'commission_payments_no_overlap';
  v_canonica_existe := v_canonica_def IS NOT NULL;

  SELECT pg_get_constraintdef(oid) INTO v_duplicada_def
    FROM pg_constraint
   WHERE conrelid = 'public.commission_payments'::regclass
     AND contype = 'x' AND conname = 'no_overlapping_periods';
  v_duplicada_existe := v_duplicada_def IS NOT NULL;

  -- 2) Guard fail-closed: la canónica debe existir con la semántica correcta
  IF NOT v_canonica_existe THEN
    RAISE EXCEPTION
      'CP-COMMISSION-CONSTRAINT: la restricción canónica commission_payments_no_overlap NO existe — abortando sin eliminar nada (la tabla no debe quedar sin protección)';
  END IF;
  IF v_canonica_def NOT ILIKE '%worker_id WITH =%'
     OR v_canonica_def NOT ILIKE '%daterange(period_start, period_end, %''[]''%) WITH &&%'
     OR v_canonica_def NOT ILIKE '%status <> ''cancelled''%' THEN
    RAISE EXCEPTION
      'CP-COMMISSION-CONSTRAINT: la canónica tiene una definición inesperada (%) — abortando por seguridad', v_canonica_def;
  END IF;

  -- 3) Si la duplicada existe, comprobar que es realmente equivalente
  --    (misma finalidad) antes de eliminarla. Si difiere, ABORTAR: nunca
  --    eliminar por similitud de nombre.
  IF v_duplicada_existe THEN
    IF v_duplicada_def IS DISTINCT FROM v_canonica_def THEN
      RAISE EXCEPTION
        'CP-COMMISSION-CONSTRAINT: no_overlapping_periods existe pero NO es equivalente (canónica: %; duplicada: %) — requiere análisis manual', v_canonica_def, v_duplicada_def;
    END IF;
    ALTER TABLE public.commission_payments
      DROP CONSTRAINT no_overlapping_periods;
    RAISE NOTICE 'CP-COMMISSION-CONSTRAINT: eliminada la duplicada no_overlapping_periods (equivalente byte a byte a la canónica)';
  ELSE
    RAISE NOTICE 'CP-COMMISSION-CONSTRAINT: la duplicada no existe (ya limpiada) — nada que hacer';
  END IF;
END
$cp_commission_dedup$;

-- Verificación final: exactamente UNA restricción EXCLUDE, la canónica
DO $cp_commission_verify$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_constraint
   WHERE conrelid = 'public.commission_payments'::regclass AND contype = 'x';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CP-COMMISSION-CONSTRAINT: % restricciones EXCLUDE vivas (esperado exactamente 1: commission_payments_no_overlap)', v_n;
  END IF;
  RAISE NOTICE 'CP-COMMISSION-CONSTRAINT OK: 1 sola restricción EXCLUDE (la canónica)';
END
$cp_commission_verify$;
