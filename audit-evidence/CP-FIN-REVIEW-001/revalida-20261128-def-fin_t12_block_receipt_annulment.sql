CREATE OR REPLACE FUNCTION public.fin_t12_block_receipt_annulment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_entry uuid;
  v_residual numeric;
BEGIN
  -- Solo transiciones de anulación (estado previo vivo → voided/reversed).
  IF NEW.status NOT IN ('voided', 'reversed') OR OLD.status IN ('voided', 'reversed') THEN
    RETURN NEW;
  END IF;
  -- ¿Algún asiento posted (reconocimiento/pago) con reversión parcial enlazada?
  -- (las recepciones pending no tienen asientos → flujo ordinario intacto)
  SELECT e.id, public.fin_entry_reversal_residual(e.id)
    INTO v_entry, v_residual
  FROM public.fin_entries e
  WHERE e.document_type = 'RECEPCION' AND e.document_id = NEW.id
    AND e.status = 'posted' AND e.event IN ('reconocimiento', 'pago')
    AND EXISTS (SELECT 1 FROM public.fin_entries r WHERE r.reversal_of = e.id)
    AND public.fin_entry_reversal_residual(e.id) > 0.01
  LIMIT 1;
  IF v_entry IS NOT NULL THEN
    RAISE WARNING 'ERR_PARTIAL_REVERSAL_PENDING (intento bloqueado): recepción % con asiento % en reversión parcial y residual % CUP pendiente. Regularice el residual contable antes de anular (runbook RECT004 §regularización).',
      NEW.id, v_entry, v_residual;
    RAISE EXCEPTION 'ERR_PARTIAL_REVERSAL_PENDING: la recepción % tiene el asiento % con reversión parcial enlazada (residual % CUP sin compensar). Regularice primero el residual contable con un asiento explícito documentado (runbook RECT004 §regularización); después la anulación funcionará por el cauce ordinario.',
      NEW.id, v_entry, v_residual;
  END IF;
  RETURN NEW;
END;
$function$;
