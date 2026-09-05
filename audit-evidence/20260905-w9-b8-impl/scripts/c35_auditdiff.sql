SELECT action, store_id::text, user_id::text, count(*)::int AS n,
       min(created_at)::text AS first_at
FROM public.audit_logs
WHERE created_at > '2026-09-05 03:45:00+00'
  AND (store_id IS NULL OR store_id::text !~ 'b8ca0000')
GROUP BY action, store_id, user_id ORDER BY n DESC LIMIT 15;
