-- GATE 5/12 · Trigger WHEN clauses + access fn (READ ONLY)
SELECT jsonb_build_object(
  'triggerdefs', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'def',pg_get_triggerdef(t.oid)) ORDER BY tgrelid::regclass::text, tgname), '[]'::jsonb)
    FROM pg_trigger t WHERE NOT t.tgisinternal
      AND tgrelid::regclass::text IN ('stock_movements','inventory','products')
  ),
  'maintain_completeness', (
    SELECT COALESCE(max(pg_get_functiondef(p.oid)),'NOT_FOUND') FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_maintain_product_completeness'
  )
) AS evidence;
