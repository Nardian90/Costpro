-- b2: tagged $function$ with UPDATE (mandate case B2)
CREATE FUNCTION f2_tagged_function()
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE public.test_table SET x = 2;
END;
$function$;
