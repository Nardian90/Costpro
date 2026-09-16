-- =====================================================================
-- REM-R2-READ-EXEC — R2-A — HIGH: row-level financial reads (NULL=ALL stores eliminated)
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

-- ---- get_cash_closures (get_cash_closures(uuid,date,date,integer)) · transform: plpgsql ----
CREATE OR REPLACE FUNCTION public.get_cash_closures(p_store_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_limit integer DEFAULT 1000)
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
      cc.id,
      cc.user_id,
      cc.store_id,
      cc.session_reference,
      cc.declared_cash,
      cc.declared_vouchers,
      cc.system_total,
      cc.notes,
      cc.status,
      cc.closed_at,
      cc.created_at,
      cc.declared_total,
      cc.system_expected_total,
      cc.difference,
      p.full_name AS operator_name
    FROM cash_closures cc
    LEFT JOIN profiles p ON p.id = cc.user_id
    WHERE
      (p_store_id IS NULL OR cc.store_id = p_store_id)
      AND (p_date_from IS NULL OR cc.created_at::date >= p_date_from)
      AND (p_date_to IS NULL OR cc.created_at::date <= p_date_to)
      AND cc.status = 'cerrado'
    ORDER BY cc.created_at DESC
    LIMIT p_limit
  ) t;
  RETURN v_results;
END;
$function$;

-- ---- get_transfers (get_transfers(uuid,timestamp with time zone,timestamp with time zone,text,integer)) · transform: plpgsql ----
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
      AND (p_status IS NULL OR t.status = p_status)
    GROUP BY t.id, os.name, ds.name, p.full_name
    ORDER BY t.created_at DESC
    LIMIT p_limit
  ) t;
  RETURN v_results;
END;
$function$;
