-- ============================================================================
-- 20261121230100 — CP-FIN-INV-EXPORT-AND-CONTINUOUS-RECONCILIATION-001 (PR B)
-- Exportación documental del mayor por categoría: campos adicionales del
-- drilldown fin_get_category_detail para Excel/PDF completos y verificables.
-- ============================================================================
-- MISIÓN: OBJETIVOS C (Excel de TODOS los movimientos) y §7 (PDF con período).
--
-- Qué añade (ADITIVO, sin cambiar la firma ni el comportamiento):
--   · m.exchange_rate por fila  — «Tasa documentada» de la exportación.
--   · 'generacion' {id, code}   — generación activa consultada (encabezado y
--                                  columna de la hoja Movimientos / PDF).
--   · 'saldo_inicial'           — saldo acumulado ANTES de p_from (misma
--                                  convención naturaleza-aware del mayor),
--                                  para reconstruir: saldo_final = inicial +
--                                  débitos − créditos (activo/gasto) o
--                                  inicial − débitos + créditos (resto).
--   · 'clase'                   — clase contable de la categoría (necesaria
--                                  para aplicar la reconstrucción del saldo).
--
-- No toca: fin_entries/fin_movements (libro inmutable), ninguna otra vista.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fin_get_category_detail(
  p_store_id uuid, p_category text, p_from date, p_to date,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_rows jsonb; v_total int;
  v_saldo_inicial numeric := 0; v_clase text;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT c.clase INTO v_clase FROM public.fin_categories c WHERE c.code = p_category;

  -- Saldo acumulado anterior al rango (naturaleza-aware, misma convención
  -- del mayor: activo/gasto → débito−crédito; resto → crédito−débito).
  SELECT round(coalesce(sum(
           CASE WHEN v_clase IN ('activo', 'gasto')
             THEN CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END
             ELSE CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END
           END), 0), 2)
    INTO v_saldo_inicial
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.category_code = p_category
    AND m.economic_date < p_from
    AND e.generation_id IS NOT DISTINCT FROM v_gen;

  SELECT count(*) INTO v_total
  FROM public.fin_movements m JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.category_code = p_category
    AND m.economic_date BETWEEN p_from AND p_to
    AND e.generation_id IS NOT DISTINCT FROM v_gen;
  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.economic_date DESC, s.posted_at DESC), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT m.id, m.entry_id, e.document_type, e.document_id, m.document_number,
           m.economic_date, e.event, m.sense, m.amount, m.amount_cup,
           m.currency, m.currency_origin, m.amount_origin, m.exchange_rate,
           m.description, e.posted_at
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    WHERE m.store_id = p_store_id AND m.category_code = p_category
      AND m.economic_date BETWEEN p_from AND p_to
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    ORDER BY m.economic_date DESC, e.posted_at DESC
    LIMIT greatest(coalesce(p_limit, 50), 1) OFFSET greatest(coalesce(p_offset, 0), 0)
  ) s;
  RETURN jsonb_build_object(
    'categoria', p_category, 'total', v_total,
    'desde', p_from, 'hasta', p_to, 'movimientos', v_rows,
    'generacion', (SELECT jsonb_build_object('id', id, 'code', code)
                   FROM public.fin_posting_generations WHERE id = v_gen),
    'saldo_inicial', v_saldo_inicial,
    'clase', v_clase);
END $function$;

-- ACL re-declarada (patrón repo: cada migración re-declara los grants).
REVOKE EXECUTE ON FUNCTION public.fin_get_category_detail(uuid, text, date, date, integer, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_get_category_detail(uuid, text, date, date, integer, integer, uuid) TO service_role;

COMMENT ON FUNCTION public.fin_get_category_detail(uuid, text, date, date, integer, integer, uuid) IS
  'Drilldown paginado por categoría (generación activa). CP-FIN-REC-001/PR B: añade exchange_rate por fila + generacion/saldo_inicial/clase en la respuesta (aditivo) para las exportaciones Excel/PDF completas.';

COMMIT;
