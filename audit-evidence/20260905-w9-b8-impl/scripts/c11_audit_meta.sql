SELECT a.record_id::text AS tx, a.action, a.user_id::text AS actor, a.metadata
FROM public.audit_logs a
WHERE a.store_id::text LIKE 'b8ca0000%' AND a.action IN ('VOID_SALE','REVERSE_TRANSACTION_V2')
ORDER BY a.created_at;
