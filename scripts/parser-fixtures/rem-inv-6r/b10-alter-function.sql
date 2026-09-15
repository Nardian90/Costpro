-- b10: CREATE + ALTER FUNCTION attribute changes must be modeled
CREATE FUNCTION b10_alters() RETURNS int
LANGUAGE sql
AS $fn$ SELECT 1 $fn$;

ALTER FUNCTION b10_alters() SET search_path = public;
ALTER FUNCTION b10_alters() SECURITY DEFINER;
ALTER FUNCTION b10_alters() STABLE;
ALTER FUNCTION b10_alters() PARALLEL SAFE;
