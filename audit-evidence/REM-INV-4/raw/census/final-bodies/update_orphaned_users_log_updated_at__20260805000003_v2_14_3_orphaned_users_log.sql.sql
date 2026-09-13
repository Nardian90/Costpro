-- DECLARED FINAL STATE (Git) de update_orphaned_users_log_updated_at
-- fuente: 20260805000003_v2_14_3_orphaned_users_log.sql stmt#1

CREATE OR REPLACE FUNCTION public.update_orphaned_users_log_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$
