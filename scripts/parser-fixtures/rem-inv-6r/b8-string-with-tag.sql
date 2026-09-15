-- b8: $fn$ body containing a DIFFERENT tag '$abc$' inside a string literal
CREATE FUNCTION b8_string_tags() RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM log_line('$abc$ is not my closer');
  UPDATE public.marker_log SET hit = true;
END;
$fn$;
