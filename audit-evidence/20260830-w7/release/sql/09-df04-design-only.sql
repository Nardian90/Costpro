-- ============================================================================
-- 09-df04-design-only.sql — W6.2 LAB · DF-04 HISTÓRICOS (SOLO DISEÑO)
-- Diseño: W62-03 DF-04. NO BACKFILL. NO reescritura de históricos.
-- Contenido: (1) parámetros de diseño T_canon/ventana/elegibilidad/exclusiones;
--   (2) fixtures SINTÉTICOS en tabla propia; (3) clasificador determinista
--   ENTRA/NO ENTRAN; (4) demostración de cero mutación de datos reales.
-- ============================================================================

-- ─── D1. Parámetros del diseño (artefacto, no ejecución) ───
CREATE TABLE IF NOT EXISTS public.w62_df04_design_params (
  param text PRIMARY KEY,
  value jsonb NOT NULL,
  source text
);
INSERT INTO public.w62_df04_design_params (param, value, source) VALUES
 ('T_canon',              jsonb_build_object('definition','instante de corte a definir por el dueño en W8','value_in_w62',null,'placeholder','<owner_decision_W8>'), 'W62-03 DF-04 §3'),
 ('ventana',              jsonb_build_object('definition','[origen_de_datos_fiable, T_canon)','delimitacion','a_definir_por_dueño'), 'W62-03 DF-04 §3'),
 ('fuente_de_verdad',     jsonb_build_object('source','receipt_items válidos + service_cost_distributions','recalculo','UNA sola vez bajo fn_recalc_wac (PR-1 prerequisito duro = DF-01)'), 'W62-03 DF-04 §3'),
 ('elegibilidad',         jsonb_build_object('rule','SKUs con documentación de costo o recepciones válidas','else','recon_gap'), 'W62-03 DF-04 §3'),
 ('ventas_historicas',    jsonb_build_object('rule','NO se reescriben','label','cost_at_sale queda como evidencia histórica etiquetada'), 'W62-03 DF-04 §3'),
 ('margenes_legacy',      jsonb_build_object('rule','LEGACY_UNVERIFIABLE_MARGIN','policy','etiqueta permanente, jamás fingido'), 'W62-03 DF-04 §3'),
 ('regla_CR_W6_6',        jsonb_build_object('rule','entradas pre-T con costo NULL/0 → EXCLUIDAS del numerador con marca recon_gap','never','ingerir un cero como costo válido'), 'W62-03 DF-04 §3'),
 ('rollback',             jsonb_build_object('rule','idempotente solo dentro de su ventana; bitácora punto a punto en wac_change_log (DF-01)'), 'W62-03 DF-04 §3'),
 ('calibracion',          jsonb_build_object('control','Puerto Padre 36/36 MATCH','purpose','test de paridad del job antes de uso real'), 'W62-03 DF-04 §3'),
 ('T_canon_demo',         jsonb_build_object('value','2026-06-01T00:00:00Z','nota','SOLO para demostración del clasificador en lab — NO es decisión del dueño'), 'W6.2 LAB')
ON CONFLICT (param) DO NOTHING;

-- ─── D2. Fixtures 100% sintéticos (tabla propia; NINGÚN dato real tocado) ───
CREATE TABLE IF NOT EXISTS public.w62_df04_synthetic_rows (
  row_id int PRIMARY KEY,
  case_label text,
  receipt_ts timestamptz,          -- sintético (dentro/fuera de ventana)
  qty numeric,
  unit_cost numeric,               -- NULL/0/válido
  has_cost_doc boolean,            -- documentación de costo del SKU
  expected text                    -- ENTRA | EXCLYE:* (esperado por diseño)
);
TRUNCATE public.w62_df04_synthetic_rows;
INSERT INTO public.w62_df04_synthetic_rows VALUES
 (1, 'SINT pre-T costo válido documentado',      '2026-01-10 10:00+00', 10, 100.0, true,  'ENTRA'),
 (2, 'SINT pre-T costo NULL',                    '2026-01-12 10:00+00',  5, NULL,  true,  'EXCLYE:CR-W6-6_COSTO_NULO_RECON_GAP'),
 (3, 'SINT pre-T costo 0',                       '2026-01-14 10:00+00',  8, 0.0,   true,  'EXCLYE:CR-W6-6_COSTO_CERO_RECON_GAP'),
 (4, 'SINT pre-T SKU sin documentación',         '2026-01-16 10:00+00',  3, 50.0,  false, 'EXCLYE:SKU_SIN_DOCUMENTACION_RECON_GAP'),
 (5, 'SINT pre-T servicio sin distribución',     '2026-01-18 10:00+00',  2, 20.0,  true,  'ENTRA'),
 (6, 'SINT post-T (fuera de ventana)',           '2026-12-31 10:00+00',  7, 90.0,  true,  'EXCLYE:POSTERIOR_A_T_CANON_FUERA_DE_VENTANA'),
 (7, 'SINT dentro de ventana qty 0',             '2026-02-01 10:00+00',  0, 30.0,  true,  'EXCLYE:QTY_CERO_NO_APORTA'),
 (8, 'SINT pre-T costo válido + servicio adjunto','2026-02-03 10:00+00', 4, 60.0,  true,  'ENTRA')
;

-- ─── D3. Clasificador determinista del DISEÑO (función pura, sin mutación) ───
CREATE OR REPLACE FUNCTION public.w62_df04_classify(
  p_receipt_ts timestamptz, p_qty numeric, p_unit_cost numeric, p_has_doc boolean
) RETURNS text
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN p_qty IS NULL OR p_qty <= 0
         THEN 'EXCLYE:QTY_CERO_NO_APORTA'
    WHEN p_receipt_ts >= COALESCE((SELECT NULLIF(value->>'placeholder','<owner_decision_W8>')::timestamptz FROM public.w62_df04_design_params WHERE param='T_canon'), (SELECT (value->>'value')::timestamptz FROM public.w62_df04_design_params WHERE param='T_canon_demo'), 'infinity'::timestamptz)
         THEN 'EXCLYE:POSTERIOR_A_T_CANON_FUERA_DE_VENTANA'
    WHEN p_unit_cost IS NULL
         THEN 'EXCLYE:CR-W6-6_COSTO_NULO_RECON_GAP'
    WHEN p_unit_cost = 0
         THEN 'EXCLYE:CR-W6-6_COSTO_CERO_RECON_GAP'
    WHEN NOT p_has_doc
         THEN 'EXCLYE:SKU_SIN_DOCUMENTACION_RECON_GAP'
    ELSE 'ENTRA'
  END
$fn$;

\echo '09: DF-04 aplicado — SOLO DISEÑO: parámetros T_canon + clasificador determinista + fixtures sintéticos. NO BACKFILL.'
