SELECT table_name, column_name, column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('receipts','devolutions','production_orders','inventory_adjustments','transfers') AND column_name IN ('status','reason','payment_method')
ORDER BY table_name;
SELECT string_agg(e.enumlabel,',' ORDER BY e.enumsortorder) AS vals FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='adjustment_reason';
