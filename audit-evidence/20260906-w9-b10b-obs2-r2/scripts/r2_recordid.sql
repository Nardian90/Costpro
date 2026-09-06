SELECT jsonb_build_object(
  'record_id_type', (SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a WHERE a.attrelid='public.audit_logs'::regclass AND a.attname='record_id'),
  'wac_text_sample', (SELECT cost_average::text FROM products WHERE id='e47421ea-f9aa-452b-b20b-4601ec12410f')
) AS m;
