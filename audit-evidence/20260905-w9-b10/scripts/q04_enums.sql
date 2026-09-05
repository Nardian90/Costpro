SELECT t.typname AS enum, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS values
FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace
WHERE n.nspname='public' AND t.typname IN ('devolution_status','adjustment_status','receipt_status','transfer_status','production_order_status')
GROUP BY t.typname;
SELECT table_name, column_name, udt_name FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('devolutions','inventory_adjustments','receipts','transfers','production_orders') AND column_name='status'
ORDER BY table_name;
