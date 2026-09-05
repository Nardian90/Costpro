SELECT table_name, column_name, udt_name, column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('receipts','devolutions','production_orders','inventory_adjustments') AND column_name IN ('status','reason')
ORDER BY table_name, column_name;
