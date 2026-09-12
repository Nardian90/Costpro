-- E2: definiciones de triggers del modelo de verdad (inventory/kardex/WAC/stock_current)
SELECT t.tgname AS trigger_name, c.relname AS table_name,
       pg_get_triggerdef(t.oid) AS definition,
       p.proname AS fn_name, pg_get_functiondef(p.oid) AS fn_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_proc p ON p.oid=t.tgfoid
JOIN pg_namespace pn ON pn.oid=p.pronamespace
WHERE n.nspname='public' AND NOT t.tgisinternal
  AND (c.relname IN ('inventory','stock_movements','products','receipt_items','kardex_entries','warehouse_stock')
       OR p.proname ~* 'wac|kardex|inventory|stock')
ORDER BY c.relname, t.tgname;
