-- DECLARED FINAL STATE (Git) de discover_backup_tables
-- fuente: 20260802000006_v2_12_45_backup_registry.sql stmt#11

CREATE OR REPLACE FUNCTION public.discover_backup_tables()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_agg(jsonb_build_object(
    'table_name', t.table_name,
    'has_store_id', EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = t.table_name
        AND c.column_name = 'store_id'
    ),
    'has_origin_store_id', EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = t.table_name
        AND c.column_name = 'origin_store_id'
    ),
    'has_destination_store_id', EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = t.table_name
        AND c.column_name = 'destination_store_id'
    ),
    'parent_tables', COALESCE((
      SELECT jsonb_agg(DISTINCT cl2.relname)
      FROM pg_constraint con2
      JOIN pg_class cl2 ON con2.confrelid = cl2.oid
      WHERE con2.conrelid = t.table_id
        AND con2.contype = 'f'
    ), '[]'::jsonb),
    'child_tables', COALESCE((
      SELECT jsonb_agg(DISTINCT cl3.relname)
      FROM pg_constraint con3
      JOIN pg_class cl3 ON con3.conrelid = cl3.oid
      WHERE con3.confrelid = t.table_id
        AND con3.contype = 'f'
    ), '[]'::jsonb)
  ) ORDER BY t.table_name)
  FROM (
    SELECT
      c.relname AS table_name,
      c.oid AS table_id
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'  -- solo tablas reales (no vistas)
      AND c.relname NOT LIKE 'pg_%'
      AND c.relname NOT LIKE 'schema_%'
      AND c.relname NOT IN ('schema_migrations')
    ORDER BY c.relname
  ) t;
$$
