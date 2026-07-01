-- ============================================================================
-- REFACTORIZACIÓN: Política Forward-Only de GLOBAL a PER-STORE
-- ----------------------------------------------------------------------------
-- Antes: get_global_max_operation_date() retornaba MAX de TODAS las tiendas.
-- Ahora: cada tienda tiene su propia fecha MAX. Los documentos se validan
-- contra el MAX de SU tienda, no contra el global.
--
-- Excepción: transferencias involucran 2 tiendas (origin + destination).
-- Se validan contra el MAX de AMBAS (el más reciente de las dos).
-- ============================================================================

-- ============================================================
-- 1. Reemplazar get_global_max_operation_date → per-store
-- ============================================================
-- Nueva firma: get_global_max_operation_date(p_store_id UUID DEFAULT NULL)
-- - Si p_store_id es NULL → retorna MAX global (fallback para docs sin tienda)
-- - Si p_store_id viene → retorna MAX solo de esa tienda

DROP FUNCTION IF EXISTS public.get_global_max_operation_date();
DROP FUNCTION IF EXISTS public.get_global_max_operation_date(UUID);

CREATE OR REPLACE FUNCTION public.get_global_max_operation_date(
  p_store_id UUID DEFAULT NULL
)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT MAX(operation_date)
  FROM v_global_operation_dates
  WHERE p_store_id IS NULL OR store_id = p_store_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_global_max_operation_date(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_global_max_operation_date(UUID) IS
'Retorna la fecha MAX de los documentos operativos. Si p_store_id es NULL, retorna MAX global. Si p_store_id viene, retorna MAX solo de esa tienda (política per-store forward-only).';

-- ============================================================
-- 2. Reemplazar validate_operation_date → per-store
-- ============================================================
-- Nueva firma: validate_operation_date(p_new_date, p_store_id)
-- - Valida contra el MAX de la tienda especificada
-- - Si p_store_id es NULL → valida contra MAX global (fallback)

DROP FUNCTION IF EXISTS public.validate_operation_date(TIMESTAMP WITH TIME ZONE);
DROP FUNCTION IF EXISTS public.validate_operation_date(TIMESTAMP WITH TIME ZONE, UUID);

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
  v_max_date TIMESTAMP WITH TIME ZONE;
  v_max_date_str TEXT;
  v_store_label TEXT;
BEGIN
  IF p_new_date IS NULL THEN
    RETURN; -- sin fecha = usar NOW() implícitamente, no bloquea
  END IF;

  -- Obtener MAX de la tienda específica (o global si no hay store_id)
  SELECT public.get_global_max_operation_date(p_store_id) INTO v_max_date;

  IF v_max_date IS NOT NULL AND p_new_date < v_max_date THEN
    v_max_date_str := to_char(v_max_date AT TIME ZONE 'America/Havana', 'DD/MM/YYYY HH24:MI');
    v_store_label := CASE WHEN p_store_id IS NULL THEN 'global' ELSE 'de la tienda' END;
    RAISE EXCEPTION 'ERR_BACKDATED_DOCUMENT: La fecha % es anterior a la fecha mínima permitida % (%). No se puede retroceder en el tiempo operativo.',
      to_char(p_new_date AT TIME ZONE 'America/Havana', 'DD/MM/YYYY HH24:MI'),
      v_max_date_str,
      v_store_label
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_operation_date(TIMESTAMP WITH TIME ZONE, UUID) TO authenticated;

COMMENT ON FUNCTION public.validate_operation_date(TIMESTAMP WITH TIME ZONE, UUID) IS
'Valida que la fecha de un nuevo documento no sea anterior a la fecha MAX de la tienda especificada. Si p_store_id es NULL, valida contra el MAX global. Lanza ERR_BACKDATED_DOCUMENT si viola la política forward-only per-store.';

-- ============================================================
-- 3. Helper para transferencias: valida contra MAX de AMBAS tiendas
-- ============================================================
-- Las transferencias afectan inventario de origin Y destination.
-- Deben validar contra el MAX más reciente de ambas tiendas.

DROP FUNCTION IF EXISTS public.validate_transfer_operation_date(TIMESTAMP WITH TIME ZONE, UUID, UUID);

CREATE OR REPLACE FUNCTION public.validate_transfer_operation_date(
  p_new_date TIMESTAMP WITH TIME ZONE,
  p_origin_store_id UUID,
  p_destination_store_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_origin TIMESTAMP WITH TIME ZONE;
  v_max_dest TIMESTAMP WITH TIME ZONE;
  v_max_date TIMESTAMP WITH TIME ZONE;
  v_max_date_str TEXT;
BEGIN
  IF p_new_date IS NULL THEN
    RETURN;
  END IF;

  -- MAX de cada tienda involucrada
  SELECT public.get_global_max_operation_date(p_origin_store_id) INTO v_max_origin;
  SELECT public.get_global_max_operation_date(p_destination_store_id) INTO v_max_dest;

  -- El más restrictivo de los dos
  v_max_date := GREATEST(v_max_origin, v_max_dest);

  IF v_max_date IS NOT NULL AND p_new_date < v_max_date THEN
    v_max_date_str := to_char(v_max_date AT TIME ZONE 'America/Havana', 'DD/MM/YYYY HH24:MI');
    RAISE EXCEPTION 'ERR_BACKDATED_DOCUMENT: La fecha % es anterior a la fecha mínima permitida (%). La transferencia afecta 2 tiendas y debe respetar el MAX de ambas.',
      to_char(p_new_date AT TIME ZONE 'America/Havana', 'DD/MM/YYYY HH24:MI'),
      v_max_date_str
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_transfer_operation_date(TIMESTAMP WITH TIME ZONE, UUID, UUID) TO authenticated;

-- ============================================================
-- 4. Verificación
-- ============================================================

SELECT proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_global_max_operation_date',
    'validate_operation_date',
    'validate_transfer_operation_date'
  )
ORDER BY p.proname;
