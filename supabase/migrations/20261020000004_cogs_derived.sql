-- =====================================================================
-- 20261020000004_cogs_derived.sql — Decisión C ratificada (2026-10-20)
-- Backfill de COGS derivado, EVIDENCIA-BASED, SIN MUTAR las entradas
-- originales del Kardex (Decisión C, alternativa 2 del documento
-- docs/audits/DECISIONES_PENDIENTES_MISION_C_2026-10-18.md §C):
--   * columnas NUEVAS (unit_cost_derived + origen + id de evidencia + estado)
--   * deriva SOLO donde existe respaldo documental: wac_change_log con
--     wac_after > 0 para (producto, tienda) a fecha <= movimiento
--   * marca 'not_derivable' lo que no tiene respaldo (no inventa costos)
--   * CERO UPDATE destructivo: unit_cost original queda intacto
--
-- Estado vivo verificado (2026-10-20, read-only):
--   * stock_movements: 1676 filas, 632 con unit_cost = 0
--   * derivables con evidencia WAC (regla LATERAL más reciente <= fecha): 8
--   * no determinables: 624 (marcados, no inventados)
--   * productos con WAC = 0: 39 · wac_change_log: 616 entradas
-- Preview de las 8 derivaciones: docs/audits/evidence/20261020-mision-c-cierre/
--   cogs_8_derivables_preview.json (valores WAC y fechas de evidencia exactos)
--
-- La aprobación CONTABLE de los valores derivados es decisión posterior del
-- propietario: este cambio separa la corrección técnica de la contable.
-- Idempotente: re-ejecutar reproduce exactamente el mismo estado.
-- =====================================================================
BEGIN;

-- §1 Columnas derivadas (aditivas, nulas por defecto)
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS unit_cost_derived numeric,
  ADD COLUMN IF NOT EXISTS unit_cost_derived_source text,
  ADD COLUMN IF NOT EXISTS unit_cost_derived_evidence_id uuid,
  ADD COLUMN IF NOT EXISTS unit_cost_derived_at timestamptz,
  ADD COLUMN IF NOT EXISTS cogs_derivation_status text;

-- §2 Derivar CON evidencia: WAC (wac_after>0) más reciente a fecha <= movimiento
UPDATE public.stock_movements m
SET unit_cost_derived            = d.wac_after,
    unit_cost_derived_source     = 'wac_change_log',
    unit_cost_derived_evidence_id = d.evidence_id,
    unit_cost_derived_at         = now(),
    cogs_derivation_status       = 'derived'
FROM (
  SELECT DISTINCT ON (m2.id)
         m2.id AS mid, w.id AS evidence_id, w.wac_after
  FROM public.stock_movements m2
  JOIN LATERAL (
    SELECT w2.id, w2.wac_after
    FROM public.wac_change_log w2
    WHERE w2.product_id = m2.product_id
      AND w2.store_id   = m2.store_id
      AND w2.wac_after > 0
      AND w2.created_at <= m2.movement_date
    ORDER BY w2.created_at DESC
    LIMIT 1
  ) w ON TRUE
  WHERE m2.unit_cost = 0
) d
WHERE m.id = d.mid;

-- §3 Marcar los NO determinables (sin respaldo documental) — no se inventan costos
UPDATE public.stock_movements
SET cogs_derivation_status = 'not_derivable'
WHERE unit_cost = 0
  AND cogs_derivation_status IS NULL;

-- §4 Verificación de cierre (esperado: derived=8, not_derivable=624, total 632)
DO $$
DECLARE
  v_derived int; v_not_derivable int; v_sin_marca int;
BEGIN
  SELECT count(*) INTO v_derived FROM public.stock_movements WHERE cogs_derivation_status = 'derived';
  SELECT count(*) INTO v_not_derivable FROM public.stock_movements WHERE cogs_derivation_status = 'not_derivable';
  SELECT count(*) INTO v_sin_marca FROM public.stock_movements WHERE unit_cost = 0 AND cogs_derivation_status IS NULL;
  RAISE NOTICE 'COGS derivado: derived=%, not_derivable=%, sin_marca=%', v_derived, v_not_derivable, v_sin_marca;
  IF v_sin_marca <> 0 THEN
    RAISE EXCEPTION 'INCONSISTENCIA: quedan % movimientos con costo 0 sin estado de derivación', v_sin_marca;
  END IF;
END $$;

COMMIT;
