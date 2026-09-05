SELECT a.record_id::text AS tx, a.action, a.user_id::text AS actor_uid, a.metadata->>'operation' AS op
FROM public.audit_logs a WHERE a.record_id::text ~ '(b024|b025|b026)$' ORDER BY a.created_at;
