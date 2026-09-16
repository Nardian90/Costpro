-- =====================================================================
-- REM-R2-READ-EXEC — R2-C — LOW: global aggregates (NULL=ALL stores eliminated)
--
-- Findings: audit-evidence/R2-SECDEF-READ-SURFACE/01_FINDINGS.md
-- Design:   audit-evidence/R2-SECDEF-READ-SURFACE/02_REMEDIATION-PREP.md
--           (FASE 3: Modelo A uniforme · FASE 7: guard spec · FASE 4: NULL -> 42501)
--
-- Each function is SECURITY DEFINER (RLS bypass) with EXECUTE granted to
-- authenticated and NO in-body authorization: any authenticated user could
-- pass an arbitrary store UUID (or NULL = ALL stores) and read cross-tenant
-- data. Guard = precedent 20260916000004 (get_batch_store_daily_kpis):
-- auth.role() <> 'service_role' -> NULL reject + public.has_store_access(p_store_id)
-- -> SQLSTATE 42501 ERR_UNAUTHORIZED_STORE. Bodies are byte-identical to
-- LIVE (frozen in 03_prep-live-capture.json) except the inserted guard.
-- No ACL, signature, owner, volatility or search_path changes. No GRANT/REVOKE.
-- Exception (documented): get_low_stock_count LANGUAGE sql -> plpgsql to host
-- the guard; its SELECT is preserved byte-identical inside RETURN (...).
-- =====================================================================

-- ---- get_daily_expenses_aggregated (get_daily_expenses_aggregated(uuid,date,date,integer)) · transform: plpgsql ----
CREATE OR REPLACE FUNCTION public.get_daily_expenses_aggregated(p_store_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_limit integer DEFAULT 1000)
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
      r.created_at::date AS date,
      COALESCE(SUM(r.total_cost), 0)::numeric(18,2) AS total_expenses
    FROM receipts r
    WHERE
      (p_store_id IS NULL OR r.store_id = p_store_id)
      AND (p_date_from IS NULL OR r.created_at::date >= p_date_from)
      AND (p_date_to IS NULL OR r.created_at::date <= p_date_to)
    GROUP BY r.created_at::date
    ORDER BY date DESC
    LIMIT p_limit
  ) t;
  RETURN v_results;
END;
$function$;

-- ---- get_low_stock_count (get_low_stock_count(uuid)) · transform: sql->plpgsql ----
CREATE OR REPLACE FUNCTION public.get_low_stock_count(p_store_id uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  RETURN (
  SELECT COUNT(*)::bigint
  FROM public.products
  WHERE
    (p_store_id IS NULL OR store_id = p_store_id)
    AND is_active = true
    AND stock_current > 0
    AND min_stock IS NOT NULL
    AND min_stock > 0
    AND stock_current <= min_stock
  );
END
$function$;
