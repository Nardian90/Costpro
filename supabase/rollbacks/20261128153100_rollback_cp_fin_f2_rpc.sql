-- ============================================================================
-- Rollback: 20261128153100_rollback_cp_fin_f2_rpc.sql
-- Restaura las 6 RPC fin_get_* con has_store_access_as y el patrón v_caller IS NOT NULL
-- NO borra asientos ni movimientos; NO toca tablas comerciales. Solo restaura
-- políticas, funciones, privilegios y triggers al estado previo del 2026-11-28.
-- ============================================================================
BEGIN;

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

REVOKE ALL ON FUNCTION public.fin_get_balance_sheet(p_store_id uuid, p_as_of date, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_balance_sheet(p_store_id uuid, p_as_of date, p_user_id uuid) TO authenticated, service_role;

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

REVOKE ALL ON FUNCTION public.fin_get_income_statement(p_store_id uuid, p_from date, p_to date, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_income_statement(p_store_id uuid, p_from date, p_to date, p_user_id uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fin_get_dashboard(p_store_id uuid, p_from date, p_to date, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_ings numeric := 0; v_costo numeric := 0; v_gastos numeric := 0;
  v_efectivo_cup numeric := 0; v_efectivo_usd numeric := 0; v_bancos numeric := 0;
  v_exterior numeric := 0;
  v_cxc numeric := 0; v_cxp numeric := 0; v_nomina numeric := 0; v_retenc numeric := 0;
  v_inv numeric := 0; v_series jsonb; v_top jsonb;
  v_sin_cfg int; v_errores int; v_desbalance numeric;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Resultado del período
  SELECT
    coalesce(sum(CASE WHEN c.clase = 'ingreso'
      THEN CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN c.grupo = 'costo_venta'
      THEN CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN c.clase = 'gasto' AND c.grupo <> 'costo_venta'
      THEN CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0)
    INTO v_ings, v_costo, v_gastos
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  JOIN public.fin_categories c ON c.code = m.category_code
  WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
    AND e.generation_id IS NOT DISTINCT FROM v_gen;

  -- Saldos de balance a la fecha final
  SELECT
    coalesce(sum(CASE WHEN m.category_code = 'ACT_EFECTIVO_CUP' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_EFECTIVO_USD' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_BANCOS' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_TRANSF_EXTERIOR' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_CXC' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code IN ('PAS_CXP_PROV', 'PAS_SERV_PEND') THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'PAS_NOMINA_PEND' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'PAS_RETENCIONES' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0)
    INTO v_efectivo_cup, v_efectivo_usd, v_bancos, v_exterior, v_cxc, v_cxp, v_nomina, v_retenc
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.economic_date <= p_to
    AND e.generation_id IS NOT DISTINCT FROM v_gen;

  -- Valor de inventario (en vivo, del motor de valoración real)
  SELECT coalesce(round(sum(p.stock_current * coalesce(p.cost_average, 0)), 2), 0) INTO v_inv
  FROM public.products p WHERE p.store_id = p_store_id;

  -- Series mensuales
  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.mes), '[]'::jsonb) INTO v_series
  FROM (
    SELECT to_char(date_trunc('month', m.economic_date), 'YYYY-MM') AS mes,
           round(sum(CASE WHEN c.clase = 'ingreso' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2) AS ingresos,
           round(sum(CASE WHEN c.clase = 'gasto' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2) AS gastos
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    GROUP BY 1
  ) s;

  -- Top gastos
  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.total DESC), '[]'::jsonb) INTO v_top
  FROM (
    SELECT c.code, c.name, round(sum(m.amount_cup), 2) AS total
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
      AND c.clase = 'gasto' AND m.sense = 'debito'
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    GROUP BY c.code, c.name
    HAVING sum(m.amount_cup) > 0
    LIMIT 8
  ) s;

  SELECT count(*) INTO v_sin_cfg
  FROM public.fin_document_types dt
  WHERE dt.is_postable AND dt.is_active AND NOT EXISTS (
    SELECT 1 FROM public.fin_rule_versions rv
    WHERE rv.document_type = dt.code AND rv.status = 'active'
      AND (rv.store_id = p_store_id OR rv.store_id IS NULL));
  SELECT count(*) INTO v_errores
  FROM public.fin_posting_errors WHERE store_id = p_store_id AND resolved_at IS NULL;

  -- Identidad pura de partida doble (CP-FIN-002) sobre la generación activa
  SELECT coalesce(round(sum(
    CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END), 0), 0)
    INTO v_desbalance
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.economic_date <= p_to
    AND e.generation_id IS NOT DISTINCT FROM v_gen;

  RETURN jsonb_build_object(
    'desde', p_from, 'hasta', p_to,
    'generacion', (SELECT jsonb_build_object('id', id, 'code', code)
                   FROM public.fin_posting_generations WHERE id = v_gen),
    'kpis', jsonb_build_object(
      'ingresos', round(v_ings, 2), 'costo_ventas', round(v_costo, 2),
      'gastos', round(v_gastos, 2),
      'utilidad_bruta', round(v_ings - v_costo, 2),
      'resultado_neto', round(v_ings - v_costo - v_gastos, 2),
      'efectivo_cup', round(v_efectivo_cup, 2), 'efectivo_usd', round(v_efectivo_usd, 2),
      'bancos', round(v_bancos, 2),
      'transfer_exterior', round(v_exterior, 2),
      'cuentas_por_cobrar', round(v_cxc, 2), 'cuentas_por_pagar', round(v_cxp, 2),
      'nomina_pendiente', round(v_nomina, 2), 'retenciones_pendientes', round(v_retenc, 2),
      'inventario_valor', v_inv),
    'series_mensuales', v_series,
    'top_gastos', v_top,
    'alertas', jsonb_build_object(
      'gastos_mayores_que_ingresos', v_gastos + v_costo > v_ings AND v_ings > 0,
      'desequilibrio_balance', abs(v_desbalance) > 0.01,
      'desequilibrio_monto', round(v_desbalance, 2),
      'tipos_sin_configurar', v_sin_cfg,
      'errores_contabilizacion', v_errores));
END $function$;

REVOKE ALL ON FUNCTION public.fin_get_dashboard(p_store_id uuid, p_from date, p_to date, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_dashboard(p_store_id uuid, p_from date, p_to date, p_user_id uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fin_get_category_detail(p_store_id uuid, p_category text, p_from date, p_to date, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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

REVOKE ALL ON FUNCTION public.fin_get_category_detail(p_store_id uuid, p_category text, p_from date, p_to date, p_limit integer, p_offset integer, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_category_detail(p_store_id uuid, p_category text, p_from date, p_to date, p_limit integer, p_offset integer, p_user_id uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fin_get_document_types_status(p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(s) ORDER BY s.sort_order)
    FROM (
      SELECT dt.code, dt.name, dt.module, dt.source_table, dt.description,
             dt.trigger_status, dt.is_postable, dt.sort_order,
             (rv.id IS NOT NULL) AS configurado,
             rv.id AS rule_version_id, rv.version, rv.movements, rv.effective_from,
             (SELECT count(*) FROM public.fin_entries e
              WHERE e.document_type = dt.code AND e.store_id = p_store_id
                AND e.generation_id IS NOT DISTINCT FROM v_gen) AS asientos,
             (SELECT count(*) FROM public.fin_posting_errors pe
              WHERE pe.document_type = dt.code AND pe.store_id = p_store_id
                AND pe.resolved_at IS NULL) AS errores
      FROM public.fin_document_types dt
      LEFT JOIN public.fin_rule_versions rv
        ON rv.document_type = dt.code AND rv.status = 'active'
       AND rv.effective_from <= CURRENT_DATE
       AND (rv.store_id = p_store_id
            OR (rv.store_id IS NULL AND NOT EXISTS (
                  SELECT 1 FROM public.fin_rule_versions x
                  WHERE x.document_type = dt.code AND x.status = 'active'
                    AND x.store_id = p_store_id)))
      WHERE dt.is_active
    ) s
  ), '[]'::jsonb);
END $function$;

REVOKE ALL ON FUNCTION public.fin_get_document_types_status(p_store_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_document_types_status(p_store_id uuid, p_user_id uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fin_get_reconciliation(p_store_id uuid, p_as_of date, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_gen uuid := public.fin_active_generation(p_store_id);
  v_hist date := '1900-01-01';
  -- CP-FIN-REC-001/v2 (misión CP-FIN-110): cambios documentados frente a v1 —
  --   (a) detector de vales sin asiento excluye los de costo cero (sin efecto
  --       contable material: el motor prohíbe movimientos con importe <= 0);
  --   (b) detector de fallback USD restringido a ventas SIN filas en el riel
  --       de pagos (riel-primacía CP-FIN-002; el motor ya no puede divergir);
  --   (c) GAS_COSTO_VENTAS operacional redondea POR VENTA (misma convención
  --       de decimales del motor: round por documento, no global del período);
  --   (d) ACT_CXC restringido a órdenes COMPLETADAS con saldo (las draft no
  --       generan derecho de cobro contable);
  --   (e) PAS_ANTICIPOS_CLI pasa a CONCILIABLE (crédito de tienda + anticipos
  --       de órdenes no completadas);
  --   (f) ING_SERVICIOS_PREST pasa a CONCILIABLE (órdenes completadas del
  --       período — regla ORDEN_TRABAJO v1 del motor);
  --   (g) fuente production_orders en fuentes_actualizadas.
  -- Impacto histórico: ninguno sobre saldos; mejora exactitud de los puentes.
  -- CP-FIN-REC-001/v3 (misión POSTREVIEW-HARDENING-111, PR que resuelve la
  --   revisión de #1682) — cambios frente a v2:
  --   (h) órdenes RECONOCIBLES = status 'completed' O 'closed' CON
  --       completion_date (evidencia documental de finalización real): ACT_CXC,
  --       ING_SERVICIOS_PREST y PAS_ANTICIPOS_CLI usan el MISMO predicado que el
  --       pase 5 del build (P0-1); voided/reversed/closed-sin-evidencia siguen
  --       fuera y sus anticipos permanecen en el pasivo;
  --   (i) ACT_CXC: presupuesto convertido a CUP (budget_total × tasa
  --       documental) ANTES de restar los pagos acumulados en CUP (P0-2) y
  --       filtro de corte por coalesce(completion_date, order_date);
  --   (j) detector de fallback: mismo criterio semántico que fin_compute_metrics
  --       — sin cobro de EFECTIVO canónico (suma 0 por moneda), una fila de
  --       transferencia NO suprime el hallazgo (P0-3);
  --   (k) docs_pend/sin_resp cubren ORDEN_TRABAJO (reconocimiento y pagos).
  v_met_ver text := 'CP-FIN-REC-001/v3';
  v_res jsonb;
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  WITH
  -- ── Inventario: estadísticas del maestro (valoración WAC del sistema) ──
  inv AS (
    SELECT count(*) AS productos_total,
           count(*) FILTER (WHERE p.stock_current > 0) AS con_stock,
           count(*) FILTER (WHERE p.stock_current = 0) AS stock_cero,
           count(*) FILTER (WHERE p.stock_current < 0) AS stock_negativo,
           round(coalesce(sum(p.stock_current), 0), 2) AS cantidad_total,
           round(coalesce(sum(p.stock_current * coalesce(p.cost_average, 0)), 0), 2) AS valor_wac,
           round(coalesce(sum(p.stock_current * coalesce(p.cost_price, 0)), 0), 2) AS valor_cost_price,
           CASE WHEN coalesce(sum(p.stock_current), 0) <> 0
             THEN round(coalesce(sum(p.stock_current * coalesce(p.cost_average, 0)), 0)
                        / sum(p.stock_current), 4) END AS costo_promedio_ponderado,
           count(*) FILTER (WHERE p.stock_current <> 0 AND coalesce(p.cost_average, 0) = 0) AS sin_costo,
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'sku', x.sku, 'nombre', x.name, 'existencia', x.stock_current,
                     'costo_promedio', x.cost_average, 'valor', x.valor) ORDER BY x.valor DESC), '[]'::jsonb)
            FROM (SELECT p2.sku, p2.name, p2.stock_current, p2.cost_average,
                         round(p2.stock_current * coalesce(p2.cost_average, 0), 2) AS valor
                  FROM public.products p2
                  WHERE p2.store_id = p_store_id AND p2.stock_current <> 0
                  ORDER BY valor DESC LIMIT 15) x) AS top_productos,
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'sku', x.sku, 'nombre', x.name, 'existencia', x.stock_current)
                    ORDER BY x.sku), '[]'::jsonb)
            FROM (SELECT p3.sku, p3.name, p3.stock_current
                  FROM public.products p3
                  WHERE p3.store_id = p_store_id AND p3.stock_current <> 0
                    AND coalesce(p3.cost_average, 0) = 0
                  ORDER BY p3.sku LIMIT 10) x) AS sin_costo_detalle
    FROM public.products p WHERE p.store_id = p_store_id
  ),
  -- Kardex: valor del último saldo por producto al corte (reconstrucción histórica)
  krd AS (
    SELECT round(coalesce(sum(k.balance_total_value), 0), 2) AS valor_kardex,
           count(*) AS productos_con_kardex,
           max(k.ultimo)::date AS ultima_fecha
    FROM (
      SELECT DISTINCT ON (ke.product_id) ke.product_id, ke.balance_total_value,
             max(ke.created_at) OVER () AS ultimo
      FROM public.kardex_entries ke
      WHERE ke.store_id = p_store_id AND ke.created_at::date <= p_as_of
      ORDER BY ke.product_id, ke.created_at DESC
    ) k
  ),
  -- Detector de ventas con fallback de liquidación USD (settlement/carve):
  -- su cobro contable (cob_cash_cup/cob_cash_usd_cup reescritos por el motor)
  -- puede divergir del riel de payment_transactions → calidad PARCIAL en cajas.
  fb AS (
    -- v2: SOLO ventas sin NINGUNA fila en el riel de pagos (era pre-riel) cuya
    -- reconstrucción física (settlement/carve) contenga USD: son las únicas que
    -- el motor contabiliza con fuente distinta del riel y pueden divergir de él.
    SELECT count(*) AS n FROM public.transactions t
    WHERE t.store_id = p_store_id AND t.status = 'completed'
      AND t.created_at::date <= p_as_of
      -- CP-FIN-111 (P0-3): exactamente el criterio del fallback del motor —
      -- el fallback aplica cuando la venta NO tiene cobro de EFECTIVO en las
      -- monedas canónicas (suma por grupo = 0). La mera existencia de una fila
      -- de transferencia/zelle NO suprime el hallazgo (venta legacy con
      -- liquidación de efectivo + solo transferencia en el riel sigue
      -- detectándose); con cobro efectivo REAL en el riel no se detecta.
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_transactions pt
        WHERE pt.ref_type = 'sale' AND pt.ref_id = t.id
          AND pt.payment_method = 'cash'
          AND coalesce(pt.direction, 'in') = 'in'
          AND lower(coalesce(pt.currency, 'cup')) IN ('cup', 'usd', 'eur', 'mlc')
        GROUP BY lower(coalesce(pt.currency, 'cup'))
        HAVING sum(pt.amount_cup) <> 0)
      AND (
        coalesce(t.cash_received_usd, 0) - coalesce(t.change_given_usd, 0) > 0
        OR EXISTS (
          SELECT 1 FROM public.transaction_items ti
          WHERE ti.transaction_id = t.id AND ti.cash_currency = 'USD'
            AND ti.currency = 'USD' AND coalesce(ti.cash_paid, 0) > 0))
  ),
  -- Cuentas financieras: flujos operacionales por (medios × moneda)
  cash AS (
    SELECT cur.*, (f ->> 'apertura')::numeric AS apertura, (f ->> 'flujos')::numeric AS flujos,
           (f ->> 'n_flujos')::bigint AS n_flujos, f -> 'desglose' AS desglose
    FROM (
      SELECT 'CUP' AS cur, public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'CUP', p_as_of) AS f
      UNION ALL SELECT 'USD', public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'USD', p_as_of)
      UNION ALL SELECT 'EUR', public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'EUR', p_as_of)
      UNION ALL SELECT 'MLC', public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'MLC', p_as_of)
      UNION ALL SELECT 'BANCOS', public.fin_cash_flows_operacional(p_store_id, ARRAY['transfer'], NULL, p_as_of)
      UNION ALL SELECT 'EXTERIOR', public.fin_cash_flows_operacional(p_store_id, ARRAY['external_transfer', 'zelle'], NULL, p_as_of)
    ) cur(cur, f)
  ),
  -- Documentos operacionales postables SIN asiento en la generación activa
  docs_pend AS (
    SELECT 'VENTA' AS tipo, count(*) AS n FROM public.transactions t
    WHERE t.store_id = p_store_id AND t.status = 'completed' AND t.created_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'VENTA'
                        AND e.document_id = t.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'DEVOLUCION_VENTA', count(*) FROM public.devolutions d
    WHERE d.store_id = p_store_id AND d.status = 'completed' AND d.processed_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'DEVOLUCION_VENTA'
                        AND e.document_id = d.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'RECEPCION', count(*) FROM public.receipts r
    WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'RECEPCION'
                        AND e.document_id = r.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'SERVICIO_RECIBIDO', count(*) FROM public.received_services s
    WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'SERVICIO_RECIBIDO'
                        AND e.document_id = s.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    -- v2: los vales de costo 0.00 no tienen efecto contable material (el motor
    -- prohíbe movimientos <= 0): no son documentos pendientes, son sin-asiento
    -- legítimo (clasificación CP-FIN-110 D5: 34 vales históricos costo cero).
    SELECT 'VALE_SALIDA', count(*) FROM public.issue_slips i
    WHERE i.store_id = p_store_id AND i.status = 'completed' AND i.created_at::date <= p_as_of
      AND coalesce(i.total_cost, 0) > 0
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'VALE_SALIDA'
                        AND e.document_id = i.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'AJUSTE_INVENTARIO', count(*) FROM public.inventory_adjustments a
    WHERE a.store_id = p_store_id AND a.status = 'confirmed' AND a.confirmed_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'AJUSTE_INVENTARIO'
                        AND e.document_id = a.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'COMISION', count(*) FROM public.commission_payments c
    WHERE c.store_id = p_store_id AND c.status = 'paid' AND c.paid_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'COMISION'
                        AND e.document_id = c.id AND e.event = 'pago'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'NOMINA', count(*) FROM public.payrolls n
    WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'NOMINA'
                        AND e.document_id = n.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'FLUJO_CAJA', count(*) FROM public.cash_flow_documents cfd
    WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado' AND cfd.operation_date::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'FLUJO_CAJA'
                        AND e.document_id = cfd.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    -- CP-FIN-111 (P0-1/k): reconocimientos faltantes de órdenes RECONOCIBLES
    -- (mismo predicado que el pase 5 del build: completed, o closed con
    -- completion_date; voided/closed-sin-evidencia NO se exigen).
    SELECT 'ORDEN_TRABAJO', count(*) FROM public.production_orders o
    WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
      AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
      AND coalesce(o.completion_date, o.order_date) <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'ORDEN_TRABAJO'
                        AND e.document_id = o.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    -- Anticipos (pagos de órdenes service/work) sin asiento en la generación.
    SELECT 'ORDEN_TRABAJO', count(*) FROM public.payment_transactions pt
    JOIN public.production_orders po ON po.id = pt.ref_id
    WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
      AND coalesce(pt.direction, 'in') = 'in' AND po.order_type IN ('service', 'work')
      AND pt.payment_date::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'ORDEN_TRABAJO'
                        AND e.document_id = pt.ref_id AND e.event = 'pago'
                        AND e.payment_ref = pt.id
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
  ),
  -- Asientos cuyo documento de origen YA NO EXISTE en la tabla fuente
  sin_resp AS (
    SELECT e.document_type AS tipo, count(*) AS n
    FROM public.fin_entries e
    WHERE e.store_id = p_store_id AND e.generation_id IS NOT DISTINCT FROM v_gen
      AND e.document_id IS NOT NULL AND e.economic_date <= p_as_of
      AND (e.document_type = 'VENTA' AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = e.document_id)
        OR e.document_type = 'DEVOLUCION_VENTA' AND NOT EXISTS (SELECT 1 FROM public.devolutions d WHERE d.id = e.document_id)
        OR e.document_type = 'RECEPCION' AND NOT EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = e.document_id)
        OR e.document_type = 'SERVICIO_RECIBIDO' AND NOT EXISTS (SELECT 1 FROM public.received_services s WHERE s.id = e.document_id)
        OR e.document_type = 'VALE_SALIDA' AND NOT EXISTS (SELECT 1 FROM public.issue_slips i WHERE i.id = e.document_id)
        OR e.document_type = 'AJUSTE_INVENTARIO' AND NOT EXISTS (SELECT 1 FROM public.inventory_adjustments a WHERE a.id = e.document_id)
        OR e.document_type = 'COMISION' AND NOT EXISTS (SELECT 1 FROM public.commission_payments c WHERE c.id = e.document_id)
        OR e.document_type = 'NOMINA' AND NOT EXISTS (SELECT 1 FROM public.payrolls n WHERE n.id = e.document_id)
        OR e.document_type = 'FLUJO_CAJA' AND NOT EXISTS (SELECT 1 FROM public.cash_flow_documents cfd WHERE cfd.id = e.document_id)
        OR e.document_type = 'ORDEN_TRABAJO' AND NOT EXISTS (SELECT 1 FROM public.production_orders o WHERE o.id = e.document_id))
    GROUP BY e.document_type
  ),
  -- ── Lado OPERACIONAL por cuenta (UNION: una fila por cuenta conciliable) ──
  op AS (
    -- ACT_INVENTARIO · valoración WAC del sistema (hoy) o kardex al corte (histórico)
    SELECT 'ACT_INVENTARIO' AS cuenta, false AS es_periodo, 10::int AS orden,
           CASE WHEN p_as_of < CURRENT_DATE THEN krd.valor_kardex ELSE inv.valor_wac END AS valor_op,
           inv.con_stock AS docs_op,
           (SELECT max(sm.created_at)::date FROM public.stock_movements sm WHERE sm.store_id = p_store_id) AS ultima_op,
           CASE WHEN inv.sin_costo > 0
                 OR inv.con_stock <> krd.productos_con_kardex
                 OR p_as_of < CURRENT_DATE
                THEN 'PARCIAL' ELSE 'COMPLETA' END::text AS calidad,
           CASE WHEN p_as_of < CURRENT_DATE
             THEN 'Valor según Kardex al corte (último saldo por producto): reconstrucción histórica documental.'
             ELSE 'Σ products.stock_current × cost_average (WAC — método de valoración del sistema). Fuente viva del maestro de productos.' END AS metodologia,
           ARRAY['products', 'kardex_entries', 'stock_movements']::text[] AS fuentes,
           jsonb_build_object(
             'productos_total', inv.productos_total, 'con_stock_positivo', inv.con_stock,
             'stock_cero', inv.stock_cero, 'stock_negativo', inv.stock_negativo,
             'cantidad_total', inv.cantidad_total, 'valor_wac', inv.valor_wac,
             'valor_cost_price', inv.valor_cost_price, 'valor_kardex', krd.valor_kardex,
             'costo_promedio_ponderado', inv.costo_promedio_ponderado,
             'productos_sin_costo', inv.sin_costo, 'sin_costo_detalle', inv.sin_costo_detalle,
             'top_productos', inv.top_productos,
             'diferencia_wac_kardex', round(inv.valor_wac - krd.valor_kardex, 2),
             'documentos_pendientes', coalesce((SELECT jsonb_object_agg(tipo, n) FROM (SELECT tipo, n FROM docs_pend WHERE n > 0 AND tipo IN ('VENTA','DEVOLUCION_VENTA','RECEPCION','VALE_SALIDA','AJUSTE_INVENTARIO')) z), '{}'::jsonb),
             'movimientos_sin_respaldo', coalesce((SELECT jsonb_object_agg(tipo, n) FROM (SELECT tipo, n FROM sin_resp WHERE tipo IN ('VENTA','DEVOLUCION_VENTA','RECEPCION','VALE_SALIDA','AJUSTE_INVENTARIO')) z), '{}'::jsonb),
             'nota_corte', CASE WHEN p_as_of < CURRENT_DATE THEN 'Corte histórico: el valor vivo del maestro refleja HOY; se usa el Kardex al corte como fuente primaria.' END) AS detalle
    FROM inv CROSS JOIN krd
    -- Cajas por moneda (medio = efectivo físico)
    UNION ALL
    SELECT 'ACT_EFECTIVO_' || c.cur, false, 11,
           c.apertura + c.flujos, c.n_flujos,
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
             WHERE pt.store_id = p_store_id AND pt.payment_method = 'cash'
               AND pt.currency = c.cur AND pt.payment_date::date <= p_as_of),
           CASE WHEN (c.cur IN ('CUP', 'USD') AND fb.n > 0) THEN 'PARCIAL' ELSE 'COMPLETA' END,
           'Apertura declarada + flujos operacionales de payment_transactions/comisiones/nóminas por (efectivo × ' || c.cur || '), en equivalente CUP (amount_cup). Réplica de la semántica de fechas del motor.',
           ARRAY['payment_transactions', 'cash_flow_documents', 'commission_payments', 'payrolls', 'fin_opening_balances']::text[],
           jsonb_build_object('apertura', c.apertura, 'flujos', c.flujos, 'desglose', c.desglose,
             'ventas_con_fallback_usd', fb.n,
             'documentos_pendientes', coalesce((SELECT jsonb_object_agg(tipo, n) FROM (SELECT tipo, n FROM docs_pend WHERE n > 0 AND tipo IN ('VENTA','DEVOLUCION_VENTA','FLUJO_CAJA','COMISION','NOMINA','RECEPCION','SERVICIO_RECIBIDO')) z), '{}'::jsonb))
    FROM cash c CROSS JOIN fb WHERE c.cur IN ('CUP', 'USD', 'EUR', 'MLC')
    -- Bancos (transferencias, cualquier moneda)
    UNION ALL
    SELECT 'ACT_BANCOS', false, 12,
           c.apertura + c.flujos, c.n_flujos,
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
             WHERE pt.store_id = p_store_id AND pt.payment_method = 'transfer'
               AND pt.payment_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + flujos por transferencia (cualquier moneda) según mapeo canónico fin_account_mapping (transfer × * → ACT_BANCOS).',
           ARRAY['payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('apertura', c.apertura, 'flujos', c.flujos, 'desglose', c.desglose)
    FROM cash c WHERE c.cur = 'BANCOS'
    -- Transferencias del exterior (external_transfer + zelle heredado)
    UNION ALL
    SELECT 'ACT_TRANSF_EXTERIOR', false, 13,
           c.apertura + c.flujos, c.n_flujos,
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
             WHERE pt.store_id = p_store_id AND pt.payment_method IN ('external_transfer', 'zelle')
               AND pt.payment_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + flujos Transf. Exterior (external_transfer canónico + zelle heredado normalizado), equivalente CUP.',
           ARRAY['payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('apertura', c.apertura, 'flujos', c.flujos, 'desglose', c.desglose)
    FROM cash c WHERE c.cur = 'EXTERIOR'
    -- Cuentas por cobrar: órdenes service/work RECONOCIBLES con saldo
    UNION ALL
    SELECT 'ACT_CXC', false, 14,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'ACT_CXC' AND ob.as_of_date <= p_as_of), 0)
           -- CP-FIN-111 (P0-2): unidades homogéneas — el presupuesto se
           -- convierte a CUP (budget_total × tasa documental) ANTES de restar
           -- los pagos acumulados en CUP (paid_amount). Ejemplo obligatorio:
           -- 100 USD @ 800 con 10 USD pagado (8.000 CUP) → CxC 72.000 CUP
           -- (la fórmula v2 restaba monedas distintas: daba 0).
           + coalesce((SELECT round(sum(greatest(o.budget_total
                * CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP'
                            OR coalesce(o.budget_exchange_rate, 0) <= 0 THEN 1
                       ELSE o.budget_exchange_rate END
                - o.paid_amount, 0)), 2)
              FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) <= p_as_of), 0),
           (SELECT count(*) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) <= p_as_of
               AND greatest(o.budget_total * CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP'
                            OR coalesce(o.budget_exchange_rate, 0) <= 0 THEN 1
                       ELSE o.budget_exchange_rate END
                     - o.paid_amount, 0) > 0.01),
           (SELECT max(coalesce(o.completion_date, o.order_date)) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ (budget_total × tasa documental − paid_amount) de órdenes service/work RECONOCIBLES (completed, o closed con completion_date — v3 P0-1), con el presupuesto convertido ANTES de restar los pagos (v3 P0-2: misma unidades CUP). Las draft/voided/closed-sin-evidencia no generan derecho contable; su anticipo vive en PAS_ANTICIPOS_CLI. Contrapartida del motor: regla ORDEN_TRABAJO v1 (línea ow-rec-cxc-d).',
           ARRAY['production_orders', 'fin_opening_balances']::text[],
           jsonb_build_object(
             'ordenes_pendientes', (SELECT count(*) FROM public.production_orders o
               WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
                 AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                 AND coalesce(o.completion_date, o.order_date) <= p_as_of
                 AND greatest(o.budget_total * CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP'
                            OR coalesce(o.budget_exchange_rate, 0) <= 0 THEN 1
                       ELSE o.budget_exchange_rate END
                     - o.paid_amount, 0) > 0.01),
             'anticipos_cobrados', coalesce((SELECT round(sum(pt.amount_cup), 2) FROM public.payment_transactions pt
               WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                 AND coalesce(pt.direction, 'in') = 'in' AND pt.payment_date::date <= p_as_of), 0))
    -- Entregas de efectivo para depósito (ACT_OTROS_CORR · FLUJO_CAJA v2)
    UNION ALL
    SELECT 'ACT_OTROS_CORR', false, 15,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'ACT_OTROS_CORR' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(cfd.amount_cup), 2) FROM public.cash_flow_documents cfd
              WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
                AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
                AND cfd.operation_date::date <= p_as_of), 0),
           (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
               AND cfd.operation_date::date <= p_as_of),
           (SELECT max(cfd.operation_date)::date FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
               AND cfd.operation_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ entregas de efectivo confirmadas (cash_flow_documents egreso/entrega_efectivo → ACT_OTROS_CORR, regla FLUJO_CAJA v2).',
           ARRAY['cash_flow_documents', 'fin_opening_balances']::text[],
           jsonb_build_object('entregas_confirmadas', (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
               AND cfd.operation_date::date <= p_as_of))
    -- Cuentas por pagar a proveedores: recepciones activas − pagos
    UNION ALL
    SELECT 'PAS_CXP_PROV', false, 30,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_CXP_PROV' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(x.total - x.pagos), 2) FROM (
                SELECT r.id,
                       (SELECT coalesce(sum(ri.quantity * ri.unit_cost * coalesce(NULLIF(ri.tasa_cambio_recepcion, 0), 1)), 0)
                          FROM public.receipt_items ri WHERE ri.receipt_id = r.id) AS total,
                       (SELECT coalesce(sum(pt.amount_cup), 0) FROM public.payment_transactions pt
                         WHERE pt.ref_type = 'receipt' AND pt.ref_id = r.id
                           AND coalesce(pt.direction, 'in') = 'in') AS pagos
                FROM public.receipts r
                WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of) x), 0),
           (SELECT count(*) FROM public.receipts r
             WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of),
           (SELECT max(r.reception_date) FROM public.receipts r
             WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ recepciones activas (Σ receipt_items qty×unit_cost×tasa) − pagos registrados (payment_transactions). Misma semántica de fecha del motor: el asiento de pago lleva la fecha del documento.',
           ARRAY['receipts', 'receipt_items', 'payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('recepciones_activas', (SELECT count(*) FROM public.receipts r
             WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of))
    -- Servicios pendientes de pago
    UNION ALL
    SELECT 'PAS_SERV_PEND', false, 31,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_SERV_PEND' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(x.total - x.pagos), 2) FROM (
                SELECT s.id,
                       CASE WHEN coalesce(s.currency, 'CUP') = 'CUP' OR coalesce(s.exchange_rate, 0) <= 0
                            THEN coalesce(s.total_amount, 0)
                            ELSE coalesce(s.total_amount, 0) * s.exchange_rate END AS total,
                       (SELECT coalesce(sum(pt.amount_cup), 0) FROM public.payment_transactions pt
                         WHERE pt.ref_type = 'service' AND pt.ref_id = s.id
                           AND coalesce(pt.direction, 'in') = 'in') AS pagos
                FROM public.received_services s
                WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of) x), 0),
           (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of),
           (SELECT max(s.service_date) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ servicios activos (total × tasa documental) − pagos registrados. Misma métrica del motor (fin_compute_metrics SERVICIO_RECIBIDO).',
           ARRAY['received_services', 'payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('servicios_activos', (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of))
    -- Nómina pendiente (confirmada, no pagada: neto)
    UNION ALL
    SELECT 'PAS_NOMINA_PEND', false, 32,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_NOMINA_PEND' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(n.total_net), 2) FROM public.payrolls n
              WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.currency = 'CUP'
                AND n.period_end <= p_as_of), 0),
           (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.period_end <= p_as_of),
           (SELECT max(n.period_end) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.period_end <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ total_net de nóminas confirmadas (devengadas) no pagadas. El pago cancela la obligación (regla NOMINA v1: np-neto-d).',
           ARRAY['payrolls', 'fin_opening_balances']::text[],
           jsonb_build_object('nominas_confirmadas', (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.period_end <= p_as_of))
    -- Retenciones de nómina (pendientes de liquidación)
    UNION ALL
    SELECT 'PAS_RETENCIONES', false, 33,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_RETENCIONES' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(n.total_deductions), 2) FROM public.payrolls n
              WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
                AND n.currency = 'CUP' AND n.period_end <= p_as_of), 0),
           (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of),
           (SELECT max(n.period_end) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ total_deductions de nóminas confirmadas/pagadas (las retenciones permanecen hasta su liquidación — regla NOMINA v1).',
           ARRAY['payrolls', 'fin_opening_balances']::text[],
           jsonb_build_object('nominas_con_retenciones', (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of))
    -- Crédito de tienda (store credit)
    UNION ALL
    SELECT 'PAS_ANTICIPOS_CLI', false, 36,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_ANTICIPOS_CLI' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(scl.amount), 2) FROM public.store_credit_ledger scl
              WHERE scl.store_id = p_store_id AND scl.created_at::date <= p_as_of), 0)
           -- v2: anticipos cobrados por órdenes service/work NO completadas (el
           -- dinero del cliente por trabajos aún no ejecutados: pasivo real). Las
           -- órdenes completadas consumen su anticipo en el reconocimiento
           -- (ow-rec-ant-d); un exceso sobre el presupuesto queda aquí.
           + coalesce((SELECT round(sum(pt.amount_cup), 2) FROM public.payment_transactions pt
              JOIN public.production_orders o ON o.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                AND coalesce(pt.direction, 'in') = 'in'
                AND o.order_type IN ('service', 'work')
                AND NOT (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                AND pt.payment_date::date <= p_as_of), 0)
           + coalesce((SELECT round(coalesce(sum(x.exc), 0), 2) FROM (
                SELECT greatest(sum(pt.amount_cup) - CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP'
                            OR coalesce(o.budget_exchange_rate, 0) <= 0
                       THEN coalesce(o.budget_total, 0) ELSE o.budget_total * o.budget_exchange_rate END, 0) AS exc
                FROM public.production_orders o
                JOIN public.payment_transactions pt ON pt.ref_id = o.id
                     AND pt.ref_type IN ('production_order', 'work') AND coalesce(pt.direction, 'in') = 'in'
                WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
                  AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                  AND coalesce(o.completion_date, o.order_date) <= p_as_of
                GROUP BY o.id) x), 0),
           (SELECT count(*) FROM public.store_credit_ledger scl
             WHERE scl.store_id = p_store_id AND scl.created_at::date <= p_as_of)
           + (SELECT count(*) FROM public.payment_transactions pt
              JOIN public.production_orders o ON o.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                AND coalesce(pt.direction, 'in') = 'in'
                AND o.order_type IN ('service', 'work')
                AND NOT (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                AND pt.payment_date::date <= p_as_of),
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
              JOIN public.production_orders o ON o.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                AND coalesce(pt.direction, 'in') = 'in'
                AND o.order_type IN ('service', 'work')
                AND NOT (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                AND pt.payment_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ store_credit_ledger (crédito de tienda) + Σ anticipos de órdenes service/work NO completadas + excesos de anticipos sobre presupuesto de órdenes completadas (v2). Contrapartida del motor: regla ORDEN_TRABAJO v1 (anticipos → PAS_ANTICIPOS_CLI).',
           ARRAY['store_credit_ledger', 'payment_transactions', 'production_orders', 'fin_opening_balances']::text[],
           jsonb_build_object('creditos_emitidos', (SELECT count(*) FROM public.store_credit_ledger scl
             WHERE scl.store_id = p_store_id AND scl.amount > 0 AND scl.created_at::date <= p_as_of),
             'anticipos_pendientes', (SELECT coalesce(round(sum(pt.amount_cup), 2), 0) FROM public.payment_transactions pt
              JOIN public.production_orders o ON o.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                AND coalesce(pt.direction, 'in') = 'in'
                AND o.order_type IN ('service', 'work')
                AND NOT (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                AND pt.payment_date::date <= p_as_of),
             'ordenes_no_reconocibles', (SELECT count(*) FROM public.production_orders o
              WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
                AND NOT (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                AND o.order_date <= p_as_of))
    -- ══ Cuentas de PERÍODO (mismo rango que el Estado de Rendimiento) ══
    -- Ingresos por ventas (neteo canónico v4: ventas − devoluciones)
    UNION ALL
    SELECT 'ING_VENTAS', true, 60,
           round(coalesce((SELECT sum(t.total_amount) FROM public.transactions t
               WHERE t.store_id = p_store_id AND t.status = 'completed'
                 AND t.created_at::date BETWEEN p_from AND p_to), 0)
               - coalesce((SELECT sum(d.total_amount) FROM public.devolutions d
               WHERE d.store_id = p_store_id AND d.status = 'completed'
                 AND d.processed_at::date BETWEEN p_from AND p_to), 0), 2),
           (SELECT count(*) FROM public.transactions t
             WHERE t.store_id = p_store_id AND t.status = 'completed'
               AND t.created_at::date BETWEEN p_from AND p_to)
           + (SELECT count(*) FROM public.devolutions d
             WHERE d.store_id = p_store_id AND d.status = 'completed'
               AND d.processed_at::date BETWEEN p_from AND p_to),
           (SELECT max(d.processed_at)::date FROM public.devolutions d
             WHERE d.store_id = p_store_id AND d.status = 'completed'
               AND d.processed_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total_amount de ventas completadas − Σ devoluciones completadas del período (neteo canónico de la regla VENTA v4: d-ing-d debita ING_VENTAS).',
           ARRAY['transactions', 'devolutions']::text[],
           jsonb_build_object(
             'ventas_completadas', (SELECT count(*) FROM public.transactions t
               WHERE t.store_id = p_store_id AND t.status = 'completed'
                 AND t.created_at::date BETWEEN p_from AND p_to),
             'devoluciones', (SELECT count(*) FROM public.devolutions d
               WHERE d.store_id = p_store_id AND d.status = 'completed'
                 AND d.processed_at::date BETWEEN p_from AND p_to))
    -- Descuentos / diferencias de cobro
    UNION ALL
    -- Ingresos por servicios prestados (órdenes service/work completadas) — v2
    SELECT 'ING_SERVICIOS_PREST', true, 61,
           coalesce((SELECT round(sum(CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP'
                            OR coalesce(o.budget_exchange_rate, 0) <= 0
                       THEN coalesce(o.budget_total, 0) ELSE o.budget_total * o.budget_exchange_rate END), 2)
              FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) BETWEEN p_from AND p_to),
           (SELECT max(coalesce(o.completion_date, o.order_date)) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ budget_total × tasa documental de órdenes service/work RECONOCIBLES del período, por fecha real de finalización (v3 P0-1: completed, o closed con completion_date — mismas que reconoce el pase 5 del build). Contrapartida del motor: regla ORDEN_TRABAJO v1 (línea ow-rec-ing-c).',
           ARRAY['production_orders']::text[],
           jsonb_build_object('ordenes_completadas', (SELECT count(*) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) BETWEEN p_from AND p_to))
    -- Descuentos / diferencias de cobro
    UNION ALL
    SELECT 'ING_DESCUENTOS', true, 66,
           round(coalesce((SELECT sum(pt.amount_cup)
               FROM public.payment_transactions pt
               JOIN public.transactions t ON t.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type = 'sale'
                AND coalesce(pt.direction, 'in') = 'in'
                AND t.status = 'completed'
                AND t.created_at::date BETWEEN p_from AND p_to), 0)
             - coalesce((SELECT sum(t.total_amount) FROM public.transactions t
               WHERE t.store_id = p_store_id AND t.status = 'completed'
                 AND t.created_at::date BETWEEN p_from AND p_to), 0), 2),
           (SELECT count(*) FROM public.transactions t
             WHERE t.store_id = p_store_id AND t.status = 'completed'
               AND t.created_at::date BETWEEN p_from AND p_to),
           NULL::date,
           CASE WHEN (SELECT fb2.n FROM fb fb2) > 0 THEN 'PARCIAL' ELSE 'COMPLETA' END,
           'Σ (cobrado − facturado) de las ventas del período (diferencia_cobro de la métrica del motor; presentación crédito−débito). Las ventas con fallback de liquidación USD pueden divergir del riel de pagos.',
           ARRAY['transactions', 'payment_transactions']::text[],
           jsonb_build_object('ventas_con_fallback_usd', (SELECT fb2.n FROM fb fb2))
    -- Costo de ventas (WAC congelado a la venta − costo devuelto)
    UNION ALL
    SELECT 'GAS_COSTO_VENTAS', true, 70,
           -- v2: redondeo POR VENTA/DEVOLUCIÓN (round por documento, idéntico al
           -- motor) — elimina la diferencia de precisión 0.01 del redondeo global
           -- del período sin ocultarla: ambas fuentes aplican la MISMA política.
           round(coalesce((SELECT sum(x.s)
               FROM (SELECT round(sum(ti.quantity * coalesce(NULLIF(ti.cost_at_sale, 0), p.cost_average, 0)), 2) AS s
                     FROM public.transaction_items ti
                     JOIN public.transactions t ON t.id = ti.transaction_id
                     LEFT JOIN public.products p ON p.id = ti.product_id
                    WHERE t.store_id = p_store_id AND t.status = 'completed'
                      AND t.created_at::date BETWEEN p_from AND p_to
                    GROUP BY t.id) x), 0)
             - coalesce((SELECT sum(x.s)
               FROM (SELECT round(sum(di.quantity * coalesce(NULLIF(oti.cost_at_sale, 0), p.cost_average, 0)), 2) AS s
                     FROM public.devolution_items di
                     JOIN public.devolutions d ON d.id = di.devolution_id
                     LEFT JOIN public.transaction_items oti
                       ON oti.transaction_id = d.original_transaction_id AND oti.product_id = di.product_id
                     LEFT JOIN public.products p ON p.id = di.product_id
                    WHERE d.store_id = p_store_id AND d.status = 'completed'
                      AND d.processed_at::date BETWEEN p_from AND p_to
                    GROUP BY d.id) x), 0), 2),
           (SELECT count(*) FROM public.transactions t
             WHERE t.store_id = p_store_id AND t.status = 'completed'
               AND t.created_at::date BETWEEN p_from AND p_to),
           NULL::date,
           'COMPLETA',
           'Σ qty×COALESCE(cost_at_sale, cost_average) de ventas completadas − costo devuelto de devoluciones (misma fórmula de fin_compute_metrics v5: costo_productos_cup y costo_devuelto_cup). El costo queda CONGELADO a la venta (DF-02): no se recalcula.',
           ARRAY['transaction_items', 'devolution_items', 'products']::text[],
           jsonb_build_object(
             'nota', 'COGS histórico congelado (cost_at_sale de la era de cada venta). La brecha frente al inventario vivo de la era FAC-VITALLCONS-001 está documentada en el expediente CP-FIN-003 §5.1.')
    -- Vales de salida (consumo interno)
    UNION ALL
    SELECT 'GAS_VALES', true, 74,
           coalesce((SELECT round(sum(i.total_cost), 2) FROM public.issue_slips i
              WHERE i.store_id = p_store_id AND i.status = 'completed'
                AND i.created_at::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.issue_slips i
             WHERE i.store_id = p_store_id AND i.status = 'completed'
               AND i.created_at::date BETWEEN p_from AND p_to),
           (SELECT max(i.created_at)::date FROM public.issue_slips i
             WHERE i.store_id = p_store_id AND i.status = 'completed'
               AND i.created_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total_cost de vales completados del período (métrica costo_cup del motor).',
           ARRAY['issue_slips']::text[],
           jsonb_build_object('vales_completados', (SELECT count(*) FROM public.issue_slips i
             WHERE i.store_id = p_store_id AND i.status = 'completed'
               AND i.created_at::date BETWEEN p_from AND p_to))
    -- Servicios recibidos (gasto)
    UNION ALL
    SELECT 'GAS_SERVICIOS', true, 71,
           coalesce((SELECT round(sum(CASE WHEN coalesce(s.currency, 'CUP') = 'CUP' OR coalesce(s.exchange_rate, 0) <= 0
                        THEN coalesce(s.total_amount, 0)
                        ELSE coalesce(s.total_amount, 0) * s.exchange_rate END), 2)
              FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to),
           (SELECT max(s.service_date) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total×tasa de servicios recibidos activos del período (métrica total_cup del motor).',
           ARRAY['received_services']::text[],
           jsonb_build_object('servicios_activos', (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to))
    -- Comisiones pagadas
    UNION ALL
    SELECT 'GAS_COMISIONES', true, 73,
           coalesce((SELECT round(sum(CASE WHEN coalesce(c.currency, 'CUP') = 'CUP' OR coalesce(c.exchange_rate, 0) <= 0
                        THEN coalesce(c.final_amount, 0)
                        ELSE coalesce(c.final_amount, 0) * c.exchange_rate END), 2)
              FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to),
           (SELECT max(c.paid_at)::date FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ final_amount×tasa de comisiones pagadas del período (métrica total_cup del motor; gasto y pago en el mismo evento).',
           ARRAY['commission_payments']::text[],
           jsonb_build_object('comisiones_pagadas', (SELECT count(*) FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to))
    -- Nóminas (gasto devengado)
    UNION ALL
    SELECT 'GAS_NOMINAS', true, 72,
           coalesce((SELECT round(sum(n.total_gross), 2) FROM public.payrolls n
              WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
                AND n.currency = 'CUP' AND n.period_end BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
               AND n.period_end BETWEEN p_from AND p_to),
           (SELECT max(n.period_end) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
               AND n.period_end BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total_gross de nóminas confirmadas/pagadas del período (métrica total_gross_cup del motor).',
           ARRAY['payrolls']::text[],
           jsonb_build_object('nominas', (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
               AND n.period_end BETWEEN p_from AND p_to))
    -- Pérdidas de inventario (faltantes confirmados, valorados al WAC del momento)
    UNION ALL
    SELECT 'GAS_PERDIDA_INV', true, 75,
           coalesce((SELECT round(sum((-i.difference) * coalesce(NULLIF(w.wac, 0), p.cost_average, 0))
                 FILTER (WHERE i.difference < 0), 2)
              FROM public.inventory_adjustments a
              JOIN public.inventory_adjustment_items i ON i.adjustment_id = a.id
              JOIN public.products p ON p.id = i.product_id
              LEFT JOIN LATERAL (
                SELECT wcl.wac_after AS wac FROM public.wac_change_log wcl
                WHERE wcl.product_id = i.product_id AND wcl.store_id = a.store_id
                  AND wcl.created_at <= a.confirmed_at
                ORDER BY wcl.created_at DESC LIMIT 1) w ON true
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.inventory_adjustments a
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to),
           (SELECT max(a.confirmed_at)::date FROM public.inventory_adjustments a
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ faltantes (difference<0 × WAC del momento del ajuste según wac_change_log, fallback cost_average) de ajustes confirmados — métrica valor_faltante_cup del motor.',
           ARRAY['inventory_adjustments', 'inventory_adjustment_items', 'wac_change_log', 'products']::text[],
           jsonb_build_object('ajustes_confirmados', (SELECT count(*) FROM public.inventory_adjustments a
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to))
    -- Otros ingresos operacionales (sobrantes + ingresos de caja)
    UNION ALL
    SELECT 'ING_OTROS_OPER', true, 62,
           round(coalesce((SELECT sum(i.difference * coalesce(NULLIF(w.wac, 0), p.cost_average, 0))
                 FILTER (WHERE i.difference > 0)
              FROM public.inventory_adjustments a
              JOIN public.inventory_adjustment_items i ON i.adjustment_id = a.id
              JOIN public.products p ON p.id = i.product_id
              LEFT JOIN LATERAL (
                SELECT wcl.wac_after AS wac FROM public.wac_change_log wcl
                WHERE wcl.product_id = i.product_id AND wcl.store_id = a.store_id
                  AND wcl.created_at <= a.confirmed_at
                ORDER BY wcl.created_at DESC LIMIT 1) w ON true
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to), 0)
             + coalesce((SELECT sum(cfd.amount_cup) FROM public.cash_flow_documents cfd
              WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
                AND cfd.doc_type = 'ingreso'
                AND cfd.operation_date::date BETWEEN p_from AND p_to), 0), 2),
           (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'ingreso'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           (SELECT max(cfd.operation_date)::date FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'ingreso'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ sobrantes de inventario (WAC del momento) + ingresos de caja documentados del período (reglas AJUSTE_INVENTARIO v1 y FLUJO_CAJA v2: fc-in-c).',
           ARRAY['inventory_adjustments', 'inventory_adjustment_items', 'wac_change_log', 'cash_flow_documents']::text[],
           jsonb_build_object('ingresos_caja', coalesce((SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'ingreso'
               AND cfd.operation_date::date BETWEEN p_from AND p_to), 0))
    -- Otros gastos operacionales (egresos de caja ordinarios ≠ entrega_efectivo)
    UNION ALL
    SELECT 'GAS_OTROS_OPER', true, 81,
           coalesce((SELECT round(sum(cfd.amount_cup), 2) FROM public.cash_flow_documents cfd
              WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
                AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
                AND cfd.operation_date::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           (SELECT max(cfd.operation_date)::date FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ egresos de caja ordinarios confirmados (concepto ≠ entrega_efectivo) del período — regla FLUJO_CAJA v2: fc-eg-d.',
           ARRAY['cash_flow_documents']::text[],
           jsonb_build_object('egresos_confirmados', (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
               AND cfd.operation_date::date BETWEEN p_from AND p_to))
  ),
  -- ── Lado CONTABLE (mayor de la generación activa, ventana por naturaleza) ──
  led AS (
    SELECT o.cuenta, o.es_periodo, o.orden, o.valor_op, o.docs_op, o.ultima_op,
           o.calidad, o.metodologia, o.fuentes, o.detalle,
           c.name AS nombre, c.clase, c.grupo, c.sort_order,
           CASE WHEN o.es_periodo THEN lper.saldo ELSE lcut.saldo END AS valor_contable,
           CASE WHEN o.es_periodo THEN lper.movimientos ELSE lcut.movimientos END AS movs,
           CASE WHEN o.es_periodo THEN lper.ultima_fecha ELSE lcut.ultima_fecha END AS ultima_cont
    FROM op o
    JOIN public.fin_categories c ON c.code = o.cuenta
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, o.cuenta, v_gen, v_hist, p_as_of) ls) lcut ON true
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, o.cuenta, v_gen, p_from, p_to) ls) lper ON true
  ),
  calc AS (
    SELECT l.*,
           round(l.valor_op - l.valor_contable, 2) AS diferencia,
           round(coalesce(cf.tolerancia, 0.01), 2) AS tolerancia,
           greatest(coalesce(cf.materialidad_min, 1), round(coalesce(cf.materialidad_pct, 0)
                 * greatest(abs(l.valor_op), abs(l.valor_contable)), 2)) AS materialidad
    FROM led l LEFT JOIN public.fin_reconciliation_config cf ON cf.category_code = l.cuenta
  ),
  final_rows AS (
    SELECT calc.cuenta, calc.nombre, calc.clase, calc.grupo, calc.sort_order,
           calc.es_periodo,
           CASE WHEN calc.es_periodo AND (p_from IS NULL OR p_to IS NULL) THEN NULL
                ELSE calc.valor_op END AS valor_operacional,
           calc.valor_contable,
           CASE WHEN calc.es_periodo AND (p_from IS NULL OR p_to IS NULL) THEN NULL
                ELSE calc.diferencia END AS diferencia,
           CASE WHEN abs(calc.valor_contable) > 0.005
             THEN round(abs(calc.valor_op - calc.valor_contable) / abs(calc.valor_contable) * 100, 2) END AS diferencia_pct,
           CASE
             WHEN calc.es_periodo AND (p_from IS NULL OR p_to IS NULL) THEN 'PENDIENTE'
             WHEN calc.calidad = 'SIN_FUENTE' THEN 'INCOMPLETO'
             WHEN abs(calc.diferencia) <= calc.tolerancia
               THEN CASE WHEN calc.calidad = 'PARCIAL' THEN 'INCOMPLETO' ELSE 'CONCILIADO' END
             WHEN abs(calc.diferencia) > calc.materialidad THEN 'ALERTA'
             ELSE 'DIFERENCIA'
           END AS estado,
           calc.tolerancia, calc.materialidad,
           calc.docs_op AS documentos_operacionales, calc.movs AS movimientos_contables,
           calc.ultima_op AS ultima_fecha_operacional, calc.ultima_cont AS ultima_fecha_contable,
           calc.calidad, calc.metodologia, calc.fuentes, calc.detalle,
           calc.orden
    FROM calc
    UNION ALL
    -- Resto del catálogo: SIN fuente operacional independiente (misión §5.3)
    SELECT c.code, c.name, c.clase, c.grupo, c.sort_order,
           (c.clase IN ('ingreso', 'gasto')) AS es_periodo,
           NULL::numeric AS valor_operacional,
           CASE WHEN c.clase IN ('ingreso', 'gasto') AND (p_from IS NULL OR p_to IS NULL) THEN NULL
                ELSE CASE WHEN c.clase IN ('ingreso', 'gasto')
                     THEN lper.saldo ELSE lcut.saldo END END AS valor_contable,
           NULL::numeric AS diferencia, NULL::numeric AS diferencia_pct,
           CASE WHEN c.clase IN ('ingreso', 'gasto') AND (p_from IS NULL OR p_to IS NULL)
             THEN 'PENDIENTE' ELSE 'NO_CONCILIABLE' END AS estado,
           NULL::numeric AS tolerancia, NULL::numeric AS materialidad,
           NULL::bigint AS documentos_operacionales,
           CASE WHEN c.clase IN ('ingreso', 'gasto') THEN lper.movimientos ELSE lcut.movimientos END AS movimientos_contables,
           NULL::date AS ultima_fecha_operacional,
           CASE WHEN c.clase IN ('ingreso', 'gasto') THEN lper.ultima_fecha ELSE lcut.ultima_fecha END AS ultima_fecha_contable,
           'SIN_FUENTE' AS calidad,
           'NO CONCILIABLE — FALTA FUENTE OPERACIONAL: ninguna tabla operativa independiente respalda esta cuenta (sin módulo documental que la genere).' AS metodologia,
           ARRAY[]::text[] AS fuentes,
           NULL::jsonb AS detalle,
           c.sort_order AS orden
    FROM public.fin_categories c
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, c.code, v_gen, v_hist, p_as_of) ls) lcut ON true
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, c.code, v_gen, p_from, p_to) ls) lper ON true
    WHERE c.is_active AND NOT EXISTS (SELECT 1 FROM op o WHERE o.cuenta = c.code)
  )
  SELECT jsonb_build_object(
    'ejecucion', jsonb_build_object(
      'calculado_en', now(),
      'fecha_corte', p_as_of,
      'desde', p_from, 'hasta', p_to,
      'generacion', (SELECT jsonb_build_object('id', id, 'code', code)
                     FROM public.fin_posting_generations WHERE id = v_gen),
      'metodologia_version', v_met_ver,
      'fuentes_actualizadas', jsonb_build_object(
        'products', (SELECT max(updated_at)::text FROM public.products WHERE store_id = p_store_id),
        'inventory', (SELECT max(updated_at)::text FROM public.inventory WHERE store_id = p_store_id),
        'stock_movements', (SELECT max(created_at)::text FROM public.stock_movements WHERE store_id = p_store_id),
        'kardex_entries', (SELECT max(created_at)::text FROM public.kardex_entries WHERE store_id = p_store_id),
        'payment_transactions', (SELECT max(created_at)::text FROM public.payment_transactions WHERE store_id = p_store_id),
        'transactions', (SELECT max(created_at)::text FROM public.transactions WHERE store_id = p_store_id),
        'receipts', (SELECT max(created_at)::text FROM public.receipts WHERE store_id = p_store_id),
        'received_services', (SELECT max(created_at)::text FROM public.received_services WHERE store_id = p_store_id),
        'issue_slips', (SELECT max(created_at)::text FROM public.issue_slips WHERE store_id = p_store_id),
        'production_orders', (SELECT max(updated_at)::text FROM public.production_orders WHERE store_id = p_store_id),
        'fin_entries', (SELECT max(posted_at)::text FROM public.fin_entries
                         WHERE store_id = p_store_id AND generation_id IS NOT DISTINCT FROM v_gen)),
      'convention', 'Diferencia = valor operacional − valor contable (naturaleza-aware).'),
    'resumen', jsonb_build_object(
      'conciliadas', count(*) FILTER (WHERE r.estado = 'CONCILIADO'),
      'diferencias', count(*) FILTER (WHERE r.estado = 'DIFERENCIA'),
      'alertas', count(*) FILTER (WHERE r.estado = 'ALERTA'),
      'incompletas', count(*) FILTER (WHERE r.estado = 'INCOMPLETO'),
      'no_conciliables', count(*) FILTER (WHERE r.estado = 'NO_CONCILIABLE'),
      'pendientes', count(*) FILTER (WHERE r.estado = 'PENDIENTE'),
      'documentos_pendientes', coalesce((SELECT sum(n) FROM docs_pend), 0),
      'movimientos_sin_respaldo', coalesce((SELECT sum(n) FROM sin_resp), 0)),
    'hallazgos', jsonb_build_object(
      'documentos_pendientes', coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'pendientes', n)
                          ORDER BY tipo) FROM docs_pend WHERE n > 0), '[]'::jsonb),
      'movimientos_sin_respaldo', coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'n', n)
                          ORDER BY tipo) FROM sin_resp), '[]'::jsonb),
      'ventas_con_fallback_usd', max(fb.n)),
    'cuentas', coalesce(jsonb_agg(row_to_json(r) ORDER BY r.orden), '[]'::jsonb))
  INTO v_res
  FROM final_rows r, fb;

  RETURN v_res;
END $function$;

REVOKE ALL ON FUNCTION public.fin_get_reconciliation(p_store_id uuid, p_as_of date, p_from date, p_to date, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_reconciliation(p_store_id uuid, p_as_of date, p_from date, p_to date, p_user_id uuid) TO service_role;

COMMIT;
