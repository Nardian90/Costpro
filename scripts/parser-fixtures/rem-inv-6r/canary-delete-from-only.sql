-- canary: SECDEF whose ONLY write is DELETE FROM public.* — MUST be detected as SECDEF-write
CREATE FUNCTION canary_delete_from_only() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  DELETE FROM public.canary_victims;
END;
$fn$;
