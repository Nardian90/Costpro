-- b6: comments before/after/between must not disturb extraction
-- leading comment with INSERT INTO fake_comment_table words
CREATE FUNCTION b6_commented() RETURNS void LANGUAGE plpgsql AS $$
-- inner comment mentioning UPDATE public.fake_comment_table
BEGIN
  PERFORM 1;
END;
$$;
-- trailing comment DELETE FROM public.comment_nothing
