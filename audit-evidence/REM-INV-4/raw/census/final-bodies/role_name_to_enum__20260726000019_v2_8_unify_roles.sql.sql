-- DECLARED FINAL STATE (Git) de role_name_to_enum
-- fuente: 20260726000019_v2_8_unify_roles.sql stmt#0

CREATE OR REPLACE FUNCTION public.role_name_to_enum(p_role_name text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN LOWER(p_role_name) = 'admin' THEN 'admin'
    WHEN LOWER(p_role_name) = 'encargado' THEN 'encargado'
    WHEN LOWER(p_role_name) = 'cajero' THEN 'clerk'
    WHEN LOWER(p_role_name) = 'almacenero' THEN 'warehouse'
    WHEN LOWER(p_role_name) = 'costo' THEN 'costo'
    WHEN LOWER(p_role_name) = 'manager' THEN 'manager'
    WHEN LOWER(p_role_name) = 'usuario' THEN 'usuario'
    ELSE 'usuario'  -- default seguro
  END;
END;
$$
