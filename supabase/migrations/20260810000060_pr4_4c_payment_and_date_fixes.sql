-- ============================================================================
-- PR-4.4C — Fix chk_mixed_payment_consistency + validate_operation_date 2 meses
-- ============================================================================
-- BUG CRITICAL (PR-4.4B): chk_mixed_payment_consistency NO incluía zelle_amount
-- Esto hacía que toda venta `mixed` con zelle > 0 fallara con error 23514.
--
-- CAMBIO DE POLÍTICA: validate_operation_date pasaba de "forward-only"
-- (no puede retroceder antes de la última operación) a "lookback 2 meses"
-- (permite fechas históricas hasta 2 meses atrás desde hoy).
-- Esto es necesario para importar ventas históricas del PDF.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- Fix 1: chk_mixed_payment_consistency — incluir zelle_amount
-- ════════════════════════════════════════════════════════════════════════════
-- ANTES: CHECK (payment_method <> 'mixed' OR (cash_amount + transfer_amount) = total_amount)
--        ❌ No incluye zelle_amount → ventas mixed con zelle fallan
-- DESPUÉS: CHECK (payment_method <> 'mixed' OR (cash_amount + transfer_amount + zelle_amount) = total_amount)
--          ✅ Incluye zelle_amount

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS chk_mixed_payment_consistency;

ALTER TABLE public.transactions ADD CONSTRAINT chk_mixed_payment_consistency
  CHECK (
    payment_method <> 'mixed'
    OR (cash_amount + transfer_amount + zelle_amount) = total_amount
  );

COMMENT ON CONSTRAINT chk_mixed_payment_consistency ON public.transactions IS
'PR-4.4C: Para ventas mixed, la suma de cash + transfer + zelle debe igualar total_amount. Antes no incluía zelle (bug CRITICAL).';

-- ════════════════════════════════════════════════════════════════════════════
-- Fix 2: validate_operation_date — cambiar de forward-only a lookback 2 meses
-- ════════════════════════════════════════════════════════════════════════════
-- ANTES: Forward-only — no permite fecha anterior al MAX de la tienda
--        Problemático para importación de ventas históricas
-- DESPUÉS: Lookback 2 meses — permite fechas desde (NOW() - 2 meses) hasta (NOW() + 1 día)
--          Suficiente para importar datasets históricos reales
--
-- Mantiene la protección contra fechas futuras lejanas (margen 1 día).

CREATE OR REPLACE FUNCTION public.validate_operation_date(
  p_new_date TIMESTAMP WITH TIME ZONE,
  p_store_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_date TIMESTAMP WITH TIME ZONE;
  v_max_date TIMESTAMP WITH TIME ZONE;
  v_min_date_str TEXT;
BEGIN
  IF p_new_date IS NULL THEN
    RETURN; -- sin fecha = usar NOW() implícitamente, no bloquea
  END IF;

  -- PR-4.4C: política lookback 2 meses (reemplaza forward-only)
  -- Permite fechas desde (NOW() - 2 meses) hasta (NOW() + 1 día)
  v_min_date := NOW() - INTERVAL '2 months';
  v_max_date := NOW() + INTERVAL '1 day';

  IF p_new_date < v_min_date THEN
    v_min_date_str := to_char(v_min_date AT TIME ZONE 'America/Havana', 'DD/MM/YYYY');
    RAISE EXCEPTION 'ERR_BACKDATED_DOCUMENT: La fecha % es anterior al límite histórico permitido de 2 meses (mínimo: %). No se pueden registrar operaciones con más de 2 meses de antigüedad.',
      to_char(p_new_date AT TIME ZONE 'America/Havana', 'DD/MM/YYYY'),
      v_min_date_str
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_new_date > v_max_date THEN
    RAISE EXCEPTION 'ERR_FUTURE_DATED_DOCUMENT: La fecha % es posterior al máximo permitido (hoy + 1 día). No se pueden registrar operaciones con fechas futuras.',
      to_char(p_new_date AT TIME ZONE 'America/Havana', 'DD/MM/YYYY HH24:MI')
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_operation_date(TIMESTAMP WITH TIME ZONE, UUID) TO authenticated;

COMMENT ON FUNCTION public.validate_operation_date(TIMESTAMP WITH TIME ZONE, UUID) IS
'PR-4.4C: Política lookback 2 meses. Permite fechas desde (NOW() - 2 meses) hasta (NOW() + 1 día). Reemplaza la política forward-only anterior que bloqueaba importación de ventas históricas.';
