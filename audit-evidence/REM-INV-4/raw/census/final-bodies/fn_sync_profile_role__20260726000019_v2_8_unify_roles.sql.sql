-- DECLARED FINAL STATE (Git) de fn_sync_profile_role
-- fuente: 20260726000019_v2_8_unify_roles.sql stmt#3

CREATE OR REPLACE FUNCTION public.fn_sync_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role_enum text;
BEGIN
  -- Si role_id cambió, derivar role desde role_id
  IF NEW.role_id IS NOT NULL AND NEW.role_id IS DISTINCT FROM OLD.role_id THEN
    SELECT public.role_name_to_enum(r.name) INTO v_role_enum
    FROM public.roles r WHERE r.id = NEW.role_id;
    NEW.role := v_role_enum::user_role;
  END IF;
  RETURN NEW;
END;
$$
