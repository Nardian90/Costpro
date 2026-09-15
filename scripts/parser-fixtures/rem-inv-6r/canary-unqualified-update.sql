-- canary: SECDEF with UNQUALIFIED UPDATE (search_path-qualified) — MUST be detected
CREATE FUNCTION canary_unqualified_update() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
BEGIN
  UPDATE canary_scores SET score = 0;
END;
$fn$;
