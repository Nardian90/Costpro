SELECT record_id::text AS tx, action, user_id::text, metadata->>'operation' AS op, metadata->>'reason' AS reason, created_at::text
FROM public.audit_logs WHERE table_name='transfers' AND store_id='b10a0000-0000-4000-8000-0000000000a1' ORDER BY created_at;
SELECT id::text, status::text, reversed_by::text FROM public.transfers WHERE id::text LIKE 'b10d0000%' ORDER BY id;
