CREATE OR REPLACE FUNCTION public.fin_get_balance_sheet(p_store_id uuid, p_as_of date, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_rows jsonb; v_activos numeric := 0; v_pasivos numeric := 0; v_patrim numeric := 0;
  v_ing numeric := 0; v_gas numeric := 0;
  v_primer_doc date; v_primera_apertura date; v_resultado numeric;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.sort_order), '[]'::jsonb),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'activo'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'pasivo'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'patrimonio'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'ingreso'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'gasto'), 0)
    INTO v_rows, v_activos, v_pasivos, v_patrim, v_ing, v_gas
  FROM (
    SELECT c.code, c.name, c.clase, c.grupo, c.sort_order,
           round(CASE WHEN c.clase IN ('activo', 'gasto')
                 THEN sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END)
                 ELSE sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END)
               END, 2) AS saldo,
           count(DISTINCT m.entry_id) AS movimientos
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date <= p_as_of
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    GROUP BY c.code, c.name, c.clase, c.grupo, c.sort_order
    HAVING round(CASE WHEN c.clase IN ('activo', 'gasto')
                 THEN sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END)
                 ELSE sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END)
               END, 2) <> 0
  ) s;

  v_resultado := round(v_ing - v_gas, 2);
  SELECT min(economic_date) INTO v_primer_doc
  FROM public.fin_entries
  WHERE store_id = p_store_id AND event <> 'apertura'
    AND generation_id IS NOT DISTINCT FROM v_gen;
  SELECT min(economic_date) INTO v_primera_apertura
  FROM public.fin_entries
  WHERE store_id = p_store_id AND event = 'apertura'
    AND generation_id IS NOT DISTINCT FROM v_gen;

  RETURN jsonb_build_object(
    'as_of', p_as_of,
    'generacion', (SELECT jsonb_build_object('id', id, 'code', code)
                   FROM public.fin_posting_generations WHERE id = v_gen),
    'categorias', v_rows,
    'total_activos', round(v_activos, 2),
    'total_pasivos', round(v_pasivos, 2),
    'patrimonio_movimientos', round(v_patrim, 2),
    'resultado_acumulado', v_resultado,
    'patrimonio_total', round(v_patrim + v_resultado, 2),
    'ecuacion', jsonb_build_object(
      'activos', round(v_activos, 2),
      'pasivos_mas_patrimonio', round(v_pasivos + v_patrim + v_resultado, 2),
      'diferencia', round(v_activos - (v_pasivos + v_patrim + v_resultado), 2),
      'equilibrado', abs(v_activos - (v_pasivos + v_patrim + v_resultado)) <= 0.01),
    'completitud', jsonb_build_object(
      'sin_apertura', v_primer_doc IS NOT NULL AND v_primera_apertura IS NULL,
      'apertura_tardia', v_primer_doc IS NOT NULL AND v_primera_apertura IS NOT NULL
                         AND v_primer_doc < v_primera_apertura,
      'primer_documento', v_primer_doc,
      'primera_apertura', v_primera_apertura));
END $function$;
