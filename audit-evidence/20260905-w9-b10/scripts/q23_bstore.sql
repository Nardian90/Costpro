SELECT record_id::text AS tx, store_id::text, user_id::text, metadata->>'operation' AS op FROM public.audit_logs
WHERE table_name='transfers' AND store_id='b10a0000-0000-4000-8000-0000000000b2' ORDER BY created_at;
