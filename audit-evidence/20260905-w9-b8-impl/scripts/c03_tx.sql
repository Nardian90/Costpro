SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='transactions'
AND column_name IN ('seller_id','store_id','status','created_at','voided_at','void_reason','cancelled_at','user_id','created_by')
ORDER BY ordinal_position;
