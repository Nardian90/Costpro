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
