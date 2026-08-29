-- W6.1 — inventario de ESCRITORES de products.cost_average (solo lectura)
WITH fd AS (
  SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
)
SELECT 'WRITER-FUNC: '||proname FROM fd
WHERE def ~* 'UPDATE[[:space:]]+(public\.)?products[[:space:]]+SET[^;]{1,255}cost_average'
UNION ALL
SELECT 'TRIGGER-WRITER: '||t.tgname||' ON '||c.relname||' -> '||fd.proname
FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN fd ON fd.oid=t.tgfoid
WHERE NOT t.tgisinternal AND n.nspname='public'
  AND fd.def ~* 'cost_average'
ORDER BY 1;
