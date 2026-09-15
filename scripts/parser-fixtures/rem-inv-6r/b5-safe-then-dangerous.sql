-- b5: first safe, second dangerous — historical lastIndex bug skipped functions after the first
CREATE FUNCTION b5_safe_first() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1;
END;
$$;

CREATE FUNCTION b5_dangerous_second() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.victims;
END;
$$;
