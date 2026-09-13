-- DECLARED FINAL STATE (Git) de get_table_writable_columns
-- fuente: 20260802000007_v2_12_46_restore_rpc_preview.sql stmt#16

CREATE OR REPLACE FUNCTION public.get_table_writable_columns(
  p_table_name TEXT
)
RETURNS TEXT[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT array_agg(column_name ORDER BY ordinal_position)
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = p_table_name
    AND is_generated = 'NEVER'
    AND is_updatable = 'YES';
$$
