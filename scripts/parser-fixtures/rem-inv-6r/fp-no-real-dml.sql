-- false-positive probe: DML-shaped words ONLY in comments / identifiers / prose — must NOT be a write fn
-- INSERT INTO this_comment_is_not_code
CREATE FUNCTION fp_no_real_dml(p_deleted_from text) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_insert_into_hint text := 'items deleted from cart, nothing to do';
BEGIN
  -- UPDATE public.nothing_in_comment
  PERFORM p_deleted_from;
END;
$fn$;
