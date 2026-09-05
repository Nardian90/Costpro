SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid IN ('receipt_items'::regclass,'transfer_items'::regclass,'inventory_adjustment_items'::regclass,'devolution_items'::regclass,'inventory_adjustments'::regclass,'receipts'::regclass,'devolutions'::regclass,'production_orders'::regclass,'transfers'::regclass)
AND contype='c' ORDER BY tbl;
