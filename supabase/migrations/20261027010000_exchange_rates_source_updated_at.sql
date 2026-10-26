-- ============================================================================
-- 20261027010000_exchange_rates_source_updated_at.sql
-- MISIÓN IC-DIVIZA-002 (2026-10-26): persistir la hora en que el PROVEEDOR
-- (Diviza) actualizó su cotización, distinta de captured_at (hora en que
-- CostPro ejecutó la captura).
--
-- CONTRATO (misión §5): la tarjeta USD informal debe mostrar
--   1. la tasa vigente,
--   2. la procedencia («Real · Diviza»),
--   3. la fecha y hora de ACTUALIZACIÓN de Diviza convertidas a la zona
--      horaria de Cuba,
--   4. la fecha de captura de CostPro (valor diagnóstico),
--   5. advertencia de antigüedad cuando corresponda.
-- El punto 3 exige persistir el sello del proveedor («Actualizado el …» que
-- Diviza publica junto a la cotización): sin columna, la hora se pierde al
-- recargar la vista y solo existiría en la respuesta instantánea de captura.
--
-- SEGURIDAD / COMPATIBILIDAD:
--   - ADD COLUMN IF NOT EXISTS: idempotente, 100% aditiva. Ninguna fila ni
--     valor existente cambia; las filas actuales quedan NULL.
--   - NINGUNA función, CHECK, RLS o índice se modifica: las 4 funciones vivas
--     del paso informal (create_sale_v2, create_cash_flow_document,
--     get_cash_balances_by_currency, open_cash_shift) seleccionan por
--     (rate_date, captured_at) — esa prioridad NO cambia (source_updated_at
--     es metadato de presentación, jamás criterio de frescura contable).
--   - La superficie certificada (contract surface, PR #1500) cubre funciones,
--     no columnas: este ALTER no la altera.
--   - Upserts REST existentes que no envíen la columna siguen funcionando
--     (nullable, sin default).
-- ============================================================================

ALTER TABLE public.exchange_rates
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz;

COMMENT ON COLUMN public.exchange_rates.source_updated_at IS
  'Hora en que el PROVEEDOR actualizó la cotización que se capturó (p.ej. Diviza: «Actualizado el 25 de octubre de 2026, 8:03 p. m. (hora de Cuba)»). Distinta de captured_at (hora de la captura de CostPro). NULL cuando la fuente no declara sello (BCC, histórico elToque, manual). Metadato de presentación: NO es criterio de frescura contable.';

-- Verificación de sanidad (no-op en ejecución normal): la columna queda
-- nullable y sin default — ningún upsert legado puede romperse.
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exchange_rates'
      AND column_name = 'source_updated_at'
      AND (is_nullable <> 'YES' OR column_default IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'source_updated_at debe ser nullable y sin default (aditiva)';
  END IF;
END
$do$;
