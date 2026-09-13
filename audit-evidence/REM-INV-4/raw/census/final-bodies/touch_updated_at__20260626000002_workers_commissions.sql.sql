-- DECLARED FINAL STATE (Git) de touch_updated_at
-- fuente: 20260626000002_workers_commissions.sql stmt#44

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
