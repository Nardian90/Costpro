-- b1: plain $$ body with INSERT (mandate case B1)
CREATE FUNCTION f1_dollar_simple()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.test_table VALUES (1);
END;
$$;
