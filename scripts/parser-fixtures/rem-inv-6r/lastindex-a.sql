-- lastindex-a: three functions (multi-match file)
CREATE FUNCTION li_a1() RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM 1; END; $$;
CREATE FUNCTION li_a2() RETURNS void LANGUAGE plpgsql AS $function$ BEGIN PERFORM 2; END; $function$;
CREATE FUNCTION li_a3() RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM 3; END; $$;
