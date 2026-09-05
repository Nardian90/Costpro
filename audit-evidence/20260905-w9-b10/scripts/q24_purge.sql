SELECT action, count(*)::int AS n FROM public.audit_logs
WHERE created_at >= '2026-09-05 05:20:00+00' AND (store_id IS NULL OR store_id::text NOT LIKE 'b10a0000%')
GROUP BY action;
