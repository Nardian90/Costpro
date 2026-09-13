-- DECLARED FINAL STATE (Git) de prevent_hard_delete_profile
-- fuente: 20260805000002_v2_14_2_profiles_soft_delete.sql stmt#5

CREATE OR REPLACE FUNCTION public.prevent_hard_delete_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'ERR_HARD_DELETE_BLOCKED: Use managed_soft_delete_user RPC instead. Physical DELETE on profiles is forbidden by Iteración 12 (Q6) soft delete policy.';
END;
$function$
