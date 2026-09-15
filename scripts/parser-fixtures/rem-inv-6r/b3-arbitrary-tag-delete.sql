-- b3: arbitrary tag $abc123$ with DELETE FROM (mandate case B3)
CREATE FUNCTION f3_arbitrary_tag()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $abc123$
BEGIN
  DELETE FROM public.test_table;
END;
$abc123$;
