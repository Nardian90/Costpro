-- DECLARED FINAL STATE (Git) de get_global_max_operation_date
-- fuente: 20260623000001_refactor_per_store_policy.sql stmt#2

CREATE OR REPLACE FUNCTION public.get_global_max_operation_date(
  p_store_id UUID DEFAULT NULL
)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT MAX(operation_date)
  FROM v_global_operation_dates
  WHERE p_store_id IS NULL OR store_id = p_store_id;
$$
