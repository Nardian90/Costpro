-- b9a: SECURITY DEFINER in the TRAILER after the body (PostgreSQL-legal syntax)
CREATE FUNCTION b9_trailer_secdef() RETURNS void LANGUAGE plpgsql
AS $fn$
BEGIN
  DELETE FROM public.trailer_victims;
END;
$fn$
SECURITY DEFINER
SET search_path = public;

-- b9b: attributes before AS (classic layout)
CREATE FUNCTION b9_classic_secdef() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.trailer_log VALUES (1);
END;
$fn$;

-- b9c: immutable sql function
CREATE FUNCTION b9_immutable_sql() RETURNS int
LANGUAGE sql
IMMUTABLE
AS $fn$ SELECT 42 $fn$;
