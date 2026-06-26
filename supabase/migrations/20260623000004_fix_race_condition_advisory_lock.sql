-- ============================================================================
-- FIX: Race condition en validate_operation_date
-- ----------------------------------------------------------------------------
-- Problema: dos usuarios pueden crear documentos simultáneamente y ambos
-- pasan la validación porque leen el MAX antes de que el otro INSERT commit.
--
-- Solución: usar SELECT ... FOR UPDATE en un advisory lock que serializa
-- la validación+inserción de documentos por tienda.
--
-- Usamos pg_advisory_xact_lock que se libera automáticamente al finalizar
-- la transacción (commit o rollback).
-- ============================================================================

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
  v_lock_key BIGINT;
BEGIN
  IF p_new_date IS NULL THEN
    RETURN;
  END IF;

  -- FIX: Advisory lock per-store para prevenir race condition.
  -- Dos transacciones que validan la misma tienda se serializan.
  -- La segunda espera a que la primera haga commit (con su nuevo documento)
  -- antes de leer el MAX, garantizando que vea la fecha actualizada.
  --
  -- Usamos un hash del store_id como lock key para distribuir locks.
  -- Si p_store_id es NULL, usamos lock key 0 (lock global).
  IF p_store_id IS NOT NULL THEN
    v_lock_key := hashtext(p_store_id::text);
  ELSE
    v_lock_key := 0;
  END IF;

  -- Bloquear hasta obtener el lock (se libera al final de la transacción)
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Ahora leer el MAX con garantía de que no hay otra transacción
  -- concurrente que esté insertando un documento para esta tienda
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
'Valida forward-only per-store con advisory lock para prevenir race conditions. pg_advisory_xact_lock serializa validaciones concurrentes por tienda.';

-- Verificación
SELECT proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND proname = 'validate_operation_date';
