-- ============================================================================
-- Migration: 20260703000003_receipt_items_tasa_validation.sql
-- RED FLAG F-21: Validación server-side para evitar tasa=1.0 en moneda no-CUP
--
-- CONTEXTO
--   La auditoría detectó que `receipt_items` tiene defaults
--   `moneda_recepcion='CUP'` y `tasa_cambio_recepcion=1.0` (migration
--   20260629000001). Si el auto-fill de tasa falla (bug F-03 ya arreglado,
--   pero defensa en profundidad), se guardaría `USD × 1.0` → costeo
--   absurdo (impacto cambiario ficticio 574×).
--
-- OBJETIVO
--   Añadir constraint CHECK a nivel de BD para garantizar que, si la moneda
--   no es CUP, la tasa_cambio_recepcion sea > 1.5 (umbral razonable porque
--   la tasa oficial más baja histórica fue ~120 CUP/USD).
--
--   Este constraint actúa como DEFENSE IN DEPTH: la validación TS también
--   rechaza con 400 antes de tocar la BD, pero si algún RPC o proceso
--   futuro intenta insertar un item inválido, la BD lo impedirá.
--
-- REGLAS
--   - NO cambia defaults de columnas existentes.
--   - NO elimina constraints existentes (solo AÑADE).
--   - Compatible con items históricos en CUP/1.0 (siguen siendo válidos).
-- ============================================================================

-- 1. BACKFILL DE FILAS EXISTENTES QUE VIOLARÍAN EL NUEVO CONSTRAINT
--
--    Antes de añadir el CHECK, identificamos items con moneda != 'CUP'
--    y tasa <= 1.5 (caso del bug F-21) y los reseteamos a CUP/1.0.
--    Interpretación: si la tasa es 1.0, lógicamente la moneda era CUP.
--
--    Cada fila corregida se registra en `receipt_tasa_audit` para
--    trazabilidad. La migración es idempotente (se puede re-ejecutar).
--
--    NOTA: Usamos un bloque DO anónimo para iterar uno a uno y poder
--    insertar el log de auditoría con los valores anteriores.
DO $$
DECLARE
  v_bad_row RECORD;
  v_fixed_count INTEGER := 0;
BEGIN
  FOR v_bad_row IN
    SELECT id, moneda_recepcion, tasa_cambio_recepcion
    FROM public.receipt_items
    WHERE moneda_recepcion <> 'CUP'
      AND COALESCE(tasa_cambio_recepcion, 1.0) <= 1.5
  LOOP
    -- 1a. Registrar en auditoría para trazabilidad
    INSERT INTO public.receipt_tasa_audit (
      receipt_item_id, valor_anterior, valor_nuevo,
      moneda_anterior, moneda_nueva, modificado_por, motivo
    ) VALUES (
      v_bad_row.id,
      COALESCE(v_bad_row.tasa_cambio_recepcion, 1.0),
      1.0,
      v_bad_row.moneda_recepcion,
      'CUP',
      NULL,
      'F-21 backfill: tasa_cambio_recepcion inválida (<=1.5) para moneda no-CUP. Reset automático a CUP/1.0 al añadir constraint receipt_items_tasa_cambio_valida.'
    );

    -- 1b. Resetear el item a CUP/1.0
    UPDATE public.receipt_items
    SET moneda_recepcion = 'CUP',
        tasa_cambio_recepcion = 1.0,
        updated_at = NOW()
    WHERE id = v_bad_row.id;

    v_fixed_count := v_fixed_count + 1;
  END LOOP;

  RAISE NOTICE 'F-21 backfill: % filas reseteadas a CUP/1.0', v_fixed_count;
END
$$;

-- 2. AÑADIR CONSTRAINT CHECK
--
--    Si moneda_recepcion != 'CUP', tasa_cambio_recepcion debe ser NOT NULL
--    y > 1.5.
--
--    Idempotente: si el constraint ya existe (re-run), no falla.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'receipt_items'
      AND constraint_name = 'receipt_items_tasa_cambio_valida'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.receipt_items
      ADD CONSTRAINT receipt_items_tasa_cambio_valida
      CHECK (
        moneda_recepcion = 'CUP'
        OR (tasa_cambio_recepcion IS NOT NULL AND tasa_cambio_recepcion > 1.5)
      );
  END IF;
END
$$;

-- 3. Comentario explicativo para futuros desarrolladores / DBAs.
COMMENT ON CONSTRAINT receipt_items_tasa_cambio_valida ON public.receipt_items IS
  'F-21: Si moneda_recepcion != CUP, tasa_cambio_recepcion debe ser > 1.5 CUP por unidad. Evita costeos absurdos cuando falla el auto-fill de tasa (defense in depth junto a validación TS).';

-- 4. Notificación a PostgREST para que refresque el schema cache.
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
