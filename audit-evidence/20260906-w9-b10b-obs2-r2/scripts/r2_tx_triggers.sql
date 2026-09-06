SELECT jsonb_build_object(
  'tx_triggers', (SELECT coalesce(jsonb_agg(jsonb_build_object('tgname', t.tgname, 'def', pg_get_triggerdef(t.oid))), '[]'::jsonb)
    FROM pg_trigger t WHERE t.tgrelid = 'public.transactions'::regclass AND NOT t.tgisinternal),
  'balance_after_col', (SELECT jsonb_build_object('column_name', c.column_name, 'data_type', c.data_type, 'is_generated', c.is_generated, 'numeric_precision', c.numeric_precision, 'numeric_scale', c.numeric_scale)
    FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='stock_movements' AND c.column_name='balance_after'),
  'kardex_enum', (SELECT coalesce(jsonb_agg(e.enumlabel ORDER BY e.enumsortorder), '[]'::jsonb) FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'kardex_movement_type'),
  'movement_type_enum', (SELECT coalesce(jsonb_agg(e.enumlabel ORDER BY e.enumsortorder), '[]'::jsonb) FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'movement_type'),
  'pt_cols', (SELECT coalesce(jsonb_agg(jsonb_build_object('col', c.column_name, 'type', c.data_type, 'gen', c.is_generated)), '[]'::jsonb)
    FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='payment_transactions' AND c.column_name IN ('amount','amount_cup','currency','exchange_rate','payment_method','transaction_id','status','idempotency_key','voided_at')),
  'tx_cols', (SELECT coalesce(jsonb_agg(jsonb_build_object('col', c.column_name, 'type', c.data_type)), '[]'::jsonb)
    FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='transactions' AND c.column_name IN ('status','seller_id','void_reason','cancelled_at','total_amount','sale_exchange_rate','idempotency_key','created_at'))
) AS meta;
