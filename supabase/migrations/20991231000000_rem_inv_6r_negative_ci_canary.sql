-- REM-INV-6R Gate U: TEMPORARY negative-CI canary on a disposable branch — NEVER merge
-- Deliberate regression: SECURITY DEFINER function accepting p_user_id and using
-- has_store_access_as WITHOUT the anti-spoofing guard, with DML incl. DELETE FROM.
CREATE FUNCTION public.negative_ci_canary(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF NOT public.has_store_access_as(p_user_id, (select id from public.stores limit 1)) THEN
    RETURN;
  END IF;
  DELETE FROM public.stores;
  INSERT INTO public.audit_logs (action) VALUES ('negative_ci_canary');
  UPDATE public.products SET price = 0;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.negative_ci_canary(uuid) TO anon;
