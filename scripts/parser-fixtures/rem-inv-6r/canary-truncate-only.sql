-- canary: SECDEF whose ONLY write is TRUNCATE — MUST be detected
CREATE FUNCTION canary_truncate_only() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
BEGIN
  TRUNCATE TABLE public.canary_huge;
END;
$fn$;
