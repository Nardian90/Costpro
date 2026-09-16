-- 20260916000008_rem_f2bug_transfers_status_cast.sql
-- REM-R2-F2BUG-FIX · ciclo separado aprobado por el propietario
--
-- F2-BUG (preexistente, documentado en
-- audit-evidence/R2-SECDEF-READ-SURFACE/04_R2-REMEDIATION-EXECUTION.md §5):
-- get_transfers era INEJECUTABLE en producción —
--   ERROR 42883: operator does not exist: transfer_status = text
-- el cuerpo comparaba t.status (enum transfer_status) con p_status (text);
-- PostgreSQL no define el operador enum = text → fallo de planificación en
-- TODA llamada (con cualquier p_status, incluido NULL). Reproducido por SQL
-- directo y por PostgREST (service_role) en la fase R2-EXEC.
--
-- FIX (1 línea, recomendado en §5): t.status::text = p_status.
--   - p_status NULL → corta a TRUE (contrato NULL=todos los estados, intacto)
--   - p_status sin etiqueta válida → sin filas (nunca error)
--   - el guard REM-R2-READ (auth.role() + NULL-reject + has_store_access +
--     42501) queda BYTE-IDÉNTICO; firma, secdef, volatility, config, owner,
--     ACL: sin cambios. Sin DROP/GRANT/REVOKE.
--
-- Verificación: staging efímero PG17 (REPRO 42883 pre → OK post + T1-T7 +
-- filtro por estado sobre enum real byte-exacto) + verificación LIVE POST.
-- Rollback function-specific: restaurar el cuerpo PRE congelado en
-- scripts/f2bug-pre-live.json (get_transfers.def).

CREATE OR REPLACE FUNCTION public.get_transfers(p_store_id uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_results JSONB;
BEGIN
  -- REM-R2-READ: authorization barrier (RLS is bypassed by SECURITY DEFINER).
  -- service_role keeps its trusted internal capability; human callers must
  -- hold active access (membership or global admin) on the requested store.
  -- NULL p_store_id is rejected: the legacy NULL=ALL-STORES path is not a
  -- legitimate capability (REM-R2-READ-PREP FASE 4, decision A).
  IF auth.role() <> 'service_role' THEN
    IF p_store_id IS NULL THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: NULL' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_store_access(p_store_id) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: %', p_store_id USING ERRCODE = '42501';
    END IF;
  END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_results
  FROM (
    SELECT
      t.id,
      t.origin_store_id,
      t.destination_store_id,
      t.created_by,
      t.status,
      t.notes,
      t.created_at,
      t.updated_at,
      os.name AS origin_store_name,
      ds.name AS destination_store_name,
      p.full_name AS creator_name,
      COALESCE(jsonb_agg(
        jsonb_build_object(
          'product_id', ti.product_id,
          'product_name', pr.name,
          'sku', pr.sku,
          'quantity', ti.quantity,
          'unit_cost', ti.unit_cost
        ) ORDER BY ti.created_at
      ) FILTER (WHERE ti.id IS NOT NULL), '[]'::jsonb) AS items
    FROM transfers t
    LEFT JOIN stores os ON os.id = t.origin_store_id
    LEFT JOIN stores ds ON ds.id = t.destination_store_id
    LEFT JOIN profiles p ON p.id = t.created_by
    LEFT JOIN transfer_items ti ON ti.transfer_id = t.id
    LEFT JOIN products pr ON pr.id = ti.product_id
    WHERE
      (p_store_id IS NULL OR t.origin_store_id = p_store_id OR t.destination_store_id = p_store_id)
      AND (p_date_from IS NULL OR t.created_at >= p_date_from)
      AND (p_date_to IS NULL OR t.created_at <= p_date_to)
      AND (p_status IS NULL OR t.status::text = p_status)
    GROUP BY t.id, os.name, ds.name, p.full_name
    ORDER BY t.created_at DESC
    LIMIT p_limit
  ) t;
  RETURN v_results;
END;
$function$;
