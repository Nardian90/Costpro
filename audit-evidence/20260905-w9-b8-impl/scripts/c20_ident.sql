SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema='auth' AND table_name='identities' ORDER BY ordinal_position;
