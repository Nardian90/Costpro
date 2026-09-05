DELETE FROM public.audit_logs WHERE action IN ('CREATE_USER','DELETE_USER') AND store_id IS NULL AND created_at >= '2026-09-05 05:20:00+00';
SELECT count(*)::int AS left_over FROM public.audit_logs WHERE action IN ('CREATE_USER','DELETE_USER') AND created_at >= '2026-09-05 05:20:00+00';
