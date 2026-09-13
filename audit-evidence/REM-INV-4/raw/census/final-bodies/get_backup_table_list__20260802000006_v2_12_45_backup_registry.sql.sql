-- DECLARED FINAL STATE (Git) de get_backup_table_list
-- fuente: 20260802000006_v2_12_45_backup_registry.sql stmt#13

CREATE OR REPLACE FUNCTION public.get_backup_table_list(
  p_include_excluded BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  table_name          TEXT,
  tier                INTEGER,
  filter_strategy     TEXT,
  parent_table        TEXT,
  parent_foreign_key  TEXT,
  date_column         TEXT,
  excluded_from_restore BOOLEAN,
  exclude_reason      TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    table_name,
    tier,
    filter_strategy,
    parent_table,
    parent_foreign_key,
    date_column,
    excluded_from_restore,
    exclude_reason
  FROM public.backup_table_registry
  WHERE (p_include_excluded OR excluded_from_restore = FALSE)
  ORDER BY tier ASC, table_name ASC;
$$
