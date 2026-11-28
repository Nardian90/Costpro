CREATE OR REPLACE FUNCTION public.fin_entry_reversal_residual(p_entry_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT GREATEST(
    abs(coalesce((SELECT sum(m.amount) FROM public.fin_movements m
                   WHERE m.entry_id = p_entry_id AND m.sense = 'debito'), 0)
      - coalesce((SELECT sum(rm.amount) FROM public.fin_entries r
                   JOIN public.fin_movements rm ON rm.entry_id = r.id
                  WHERE r.reversal_of = p_entry_id AND rm.sense = 'credito'), 0)),
    abs(coalesce((SELECT sum(m.amount) FROM public.fin_movements m
                   WHERE m.entry_id = p_entry_id AND m.sense = 'credito'), 0)
      - coalesce((SELECT sum(rm.amount) FROM public.fin_entries r
                   JOIN public.fin_movements rm ON rm.entry_id = r.id
                  WHERE r.reversal_of = p_entry_id AND rm.sense = 'debito'), 0))
  );
$function$;
