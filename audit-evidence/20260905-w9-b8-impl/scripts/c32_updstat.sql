SELECT a.record_id::text AS tx, a.action, a.user_id::text AS actor, a.metadata
FROM public.audit_logs a
WHERE a.record_id::text ~ '(a004|a002|b003)$' AND a.action NOT IN ('VOID_SALE','REVERSE_TRANSACTION_V2')
ORDER BY a.created_at;
