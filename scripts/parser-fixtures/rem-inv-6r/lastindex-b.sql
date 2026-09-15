-- lastindex-b: single plain-$$ function (parsed AFTER a multi-match file must give identical result)
CREATE FUNCTION li_b1() RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM 42; END; $$;
