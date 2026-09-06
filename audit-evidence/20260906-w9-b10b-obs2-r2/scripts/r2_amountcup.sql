SELECT jsonb_build_object(
  'amount_cup_expr', (SELECT pg_get_expr(d.adbin, d.adrelid) FROM pg_attrdef d WHERE d.adrelid = 'public.payment_transactions'::regclass AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = d.adrelid AND a.attnum = d.adnum AND a.attname = 'amount_cup')),
  'pt_full_cols', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'attnum'), '[]'::jsonb)
    FROM (SELECT jsonb_build_object('attnum', a.attnum, 'col', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'generated', a.attgenerated) AS x
    FROM pg_attribute a WHERE a.attrelid = 'public.payment_transactions'::regclass AND a.attnum > 0 AND NOT a.attisdropped) s)
) AS m;
