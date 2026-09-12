-- R16: grants fn_process_receipt/register_reception + cost_at_sale en ventas
SELECT 'grant:'||p.proname AS metric, COALESCE(p.proacl::text,'DEFAULT') AS value
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('fn_process_receipt','register_reception','receive_purchase')
UNION ALL
SELECT 'txitems_cost0_of_'||COUNT(*)::text, SUM(CASE WHEN COALESCE(ti.cost_at_sale,0)=0 THEN 1 ELSE 0 END)::text
FROM transaction_items ti
UNION ALL
SELECT 'txitems_total', COUNT(*)::text FROM transaction_items ti
UNION ALL
SELECT 'receipts_by_status:'||r.status, COUNT(*)::text FROM receipts r GROUP BY r.status
ORDER BY 1;
