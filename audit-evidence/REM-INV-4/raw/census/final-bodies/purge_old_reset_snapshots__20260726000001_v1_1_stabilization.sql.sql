-- DECLARED FINAL STATE (Git) de purge_old_reset_snapshots
-- fuente: 20260726000001_v1_1_stabilization.sql stmt#23

CREATE OR REPLACE FUNCTION public.purge_old_reset_snapshots(p_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.store_reset_snapshots WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$
