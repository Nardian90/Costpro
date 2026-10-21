-- ═══════════════════════════════════════════════════════════════════════════
-- CP-UI-001 (2/5) — Exclusion constraint: sin periodos solapados de comisión
-- Misión Continua de Resolución del Inventario · 2026-10-22
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA (decisions-complejas-audit-multi-tienda.md §2, C4 — contable
-- CRÍTICO): el índice UNIQUE actual solo bloquea periodos IDÉNTICOS.
-- Permite solapamientos reales (p. ej. [01-01, 01-31] y [01-15, 02-15])
-- que duplican el pago de comisiones del mismo trabajador.
--
-- SOLUCIÓN: exclusion constraint GiST (btree_gist) que impide dos pagos
-- NO cancelados del mismo worker con rangos de periodo que se cruzan.
-- Parcial (WHERE status <> 'cancelled'): los cancelados no bloquean.
--
-- PRE-CONDICIÓN (verificada por el guard fail-closed de abajo, que ABORTA
-- la aplicación con el detalle de los conflictos si no se cumple):
--   0 pares solapados vigentes. La query de verificación manual previa
--   (solo lectura) es la recomendada por el propio documento de decisiones:
--     SELECT cp1.id, cp2.id, cp1.worker_id
--     FROM public.commission_payments cp1
--     JOIN public.commission_payments cp2
--       ON cp1.id < cp2.id
--      AND cp1.worker_id = cp2.worker_id
--      AND cp1.status <> 'cancelled'
--      AND cp2.status <> 'cancelled'
--      AND daterange(cp1.period_start, cp1.period_end, '[]')
--          && daterange(cp2.period_start, cp2.period_end, '[]');
--   Si retorna filas: resolver cada solape por decisión del negocio
--   (cancelar/re(periodizar) el duplicado) ANTES de aplicar.
--
-- REVERSIBILIDAD: ALTER TABLE ... DROP CONSTRAINT IF EXISTS
-- commission_payments_no_overlap; — elimina el constraint sin pérdida de
-- datos. La extensión btree_gist es trusted y puede quedarse instalada.
-- ═══════════════════════════════════════════════════════════════════════════

-- btree_gist: permite mezclar = (btree) con && (range) en un EXCLUDE.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $cp_ui_001_guard$
DECLARE
    v_overlaps bigint;
    v_detail text;
BEGIN
    SELECT count(*) INTO v_overlaps
    FROM public.commission_payments cp1
    JOIN public.commission_payments cp2
      ON cp1.id < cp2.id
     AND cp1.worker_id = cp2.worker_id
     AND cp1.status <> 'cancelled'
     AND cp2.status <> 'cancelled'
     AND daterange(cp1.period_start, cp1.period_end, '[]')
         && daterange(cp2.period_start, cp2.period_end, '[]');

    IF v_overlaps > 0 THEN
        SELECT string_agg(cp1.id::text || ' ↔ ' || cp2.id::text, ', ')
        INTO v_detail
        FROM public.commission_payments cp1
        JOIN public.commission_payments cp2
          ON cp1.id < cp2.id
         AND cp1.worker_id = cp2.worker_id
         AND cp1.status <> 'cancelled'
         AND cp2.status <> 'cancelled'
         AND daterange(cp1.period_start, cp1.period_end, '[]')
             && daterange(cp2.period_start, cp2.period_end, '[]');

        RAISE EXCEPTION
            'CP-UI-001 PRE-CONDICIÓN NO CUMPLIDA: existen % par(es) de periodos solapados vigentes (%). Resolver cada solape por decisión del negocio (cancelar o re-periodizar el duplicado) antes de crear el constraint de exclusión.',
            v_overlaps, COALESCE(v_detail, '(detalle no disponible)')
            USING HINT = 'Ver la query de verificación en el encabezado de esta migración';
    END IF;
END
$cp_ui_001_guard$;

-- Idempotencia: si el constraint ya existe (reintento parcial), no duplicar.
DO $cp_ui_001_add$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.commission_payments'::regclass
          AND conname = 'commission_payments_no_overlap'
    ) THEN
        EXECUTE 'ALTER TABLE public.commission_payments
                 ADD CONSTRAINT commission_payments_no_overlap
                 EXCLUDE USING gist (
                     worker_id WITH =,
                     daterange(period_start, period_end, ''[]'') WITH &&
                 ) WHERE (status <> ''cancelled'')';
    END IF;
END
$cp_ui_001_add$;
