CREATE OR REPLACE FUNCTION public.fin_get_income_statement(p_store_id uuid, p_from date, p_to date, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_rows jsonb;
  v_ing_op numeric := 0; v_ing_aj numeric := 0; v_costo numeric := 0;
  v_gastos numeric := 0; v_ing_noop numeric := 0; v_gas_noop numeric := 0;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.sort_order), '[]'::jsonb),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'ingreso_operacional'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'ajuste_ingreso'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'costo_venta'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'gasto_operacional'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'ingreso_no_operacional'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'gasto_no_operacional'), 0)
    INTO v_rows, v_ing_op, v_ing_aj, v_costo, v_gastos, v_ing_noop, v_gas_noop
  FROM (
    SELECT c.code, c.name, c.grupo, c.sort_order,
           round(sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END), 2) AS saldo,
           count(DISTINCT m.entry_id) AS documentos
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
      AND c.clase IN ('ingreso', 'gasto')
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    GROUP BY c.code, c.name, c.grupo, c.sort_order
    HAVING round(sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END), 2) <> 0
  ) s;

  RETURN jsonb_build_object(
    'desde', p_from, 'hasta', p_to,
    'categorias', v_rows,
    'ingresos_operacionales', round(v_ing_op, 2),
    'ajustes_ingresos', round(v_ing_aj, 2),
    'ingresos_netos', round(v_ing_op + v_ing_aj, 2),
    'costo_ventas', round(v_costo, 2),
    'utilidad_bruta', round(v_ing_op + v_ing_aj + v_costo, 2),
    'gastos_operacionales', round(v_gastos, 2),
    'resultado_operativo', round(v_ing_op + v_ing_aj + v_costo + v_gastos, 2),
    'ingresos_no_operacionales', round(v_ing_noop, 2),
    'gastos_no_operacionales', round(v_gas_noop, 2),
    'resultado_neto', round(v_ing_op + v_ing_aj + v_costo + v_gastos + v_ing_noop + v_gas_noop, 2));
END $function$;
