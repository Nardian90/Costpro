DELETE FROM public.audit_logs
WHERE action IN ('CREATE_USER','DELETE_USER') AND store_id IS NULL
  AND created_at >= '2026-09-05 03:45:00+00';
SELECT count(*)::int AS purged_left FROM public.audit_logs WHERE action IN ('CREATE_USER','DELETE_USER') AND created_at >= '2026-09-05 03:45:00+00';
