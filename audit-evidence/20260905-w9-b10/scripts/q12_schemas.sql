SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('receipts','receipt_items','transfers','transfer_items','inventory_adjustments','inventory_adjustment_items','devolutions','devolution_items','production_orders')
  AND is_nullable='NO' AND column_default IS NULL
  AND column_name NOT IN ('id','created_at')
ORDER BY table_name, ordinal_position;
