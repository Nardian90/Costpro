-- DECLARED FINAL STATE (Git) de validate_backup_registry_drift
-- fuente: 20260802000006_v2_12_45_backup_registry.sql stmt#15

CREATE OR REPLACE FUNCTION public.validate_backup_registry_drift()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_discovered JSONB;
  v_registered TEXT[];
  v_in_db TEXT[];
  v_missing_in_registry TEXT[];
  v_missing_in_db TEXT[];
BEGIN
  -- Lista real desde information_schema
  SELECT jsonb_agg(t->>'table_name') INTO v_discovered
  FROM jsonb_array_elements(public.discover_backup_tables()) AS t;

  SELECT array_agg(value::text) INTO v_in_db
  FROM jsonb_array_elements_text(v_discovered);

  -- Lista registrada
  SELECT array_agg(table_name) INTO v_registered
  FROM public.backup_table_registry;

  -- Tablas en DB pero no en registry
  SELECT COALESCE(array_agg(DISTINCT t), ARRAY[]::TEXT[]) INTO v_missing_in_registry
  FROM unnest(v_in_db) AS t
  WHERE NOT (t = ANY(v_registered));

  -- Tablas en registry pero no en DB
  SELECT COALESCE(array_agg(DISTINCT t), ARRAY[]::TEXT[]) INTO v_missing_in_db
  FROM unnest(v_registered) AS t
  WHERE NOT (t = ANY(v_in_db));

  RETURN jsonb_build_object(
    'tables_in_db', jsonb_build_array(v_in_db),
    'tables_in_registry', jsonb_build_array(v_registered),
    'missing_in_registry', to_jsonb(v_missing_in_registry),
    'missing_in_db', to_jsonb(v_missing_in_db),
    'drift_detected', jsonb_build_array(v_missing_in_registry) != '[]'::jsonb
                       OR jsonb_build_array(v_missing_in_db) != '[]'::jsonb
  );
END;
$$
