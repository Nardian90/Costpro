-- b7: tagged body containing '$$' inside string literals (valid SQL only with a tag)
CREATE FUNCTION b7_string_dollars() RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM log_line('SELECT $$ || quote_ident(t) || $$ marker');
  INSERT INTO public.marker_log VALUES (1);
END;
$fn$;
