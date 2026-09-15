-- lastindex-c: single long-tag function
CREATE FUNCTION li_c1() RETURNS void LANGUAGE plpgsql AS $LONG_TAG_NAME$ BEGIN PERFORM 7; END; $LONG_TAG_NAME$;
