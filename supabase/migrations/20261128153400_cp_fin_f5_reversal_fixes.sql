-- ============================================================================
-- Migration: 20261128153400_cp_fin_f5_reversal_fixes.sql
-- Misión:    CP-FIN-REM-001 — PR-A F5 (reversión residual y generación)
-- Fecha:     2026-11-28
-- ============================================================================
-- F5.A fin_entry_reversal_residual: sumaba m.amount (MONEDA ORIGINAL) en las
--      comparaciones débito-original vs crédito-reversión (y viceversa) → el
--      residual quedaba mal calculado con multimoneda. Ahora suma m.amount_cup
--      (las 4 sumas), manteniendo ambos sentidos, la tolerancia de 0,01 CUP
--      (aplicada por los llamadores), la semántica total/parcial y la
--      idempotencia de la función pura.
-- F5.B fin_t12_block_receipt_annulment: no filtraba por generación → una
--      reversión parcial existente SOLO en una generación SUPERSEDED bloqueaba
--      la anulación de la recepción. Ahora filtra por la generación activa
--      canónica fin_active_generation(NEW.store_id) con el tratamiento
--      documentado de NULL.
-- Regeneradas desde las definiciones vivas (base exacta; fail-closed contra
-- deriva en los DO-guards).
-- Rollback: supabase/rollbacks/20261128153400_rollback_cp_fin_f5.sql
-- ============================================================================

BEGIN;

do $$
declare
  v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='fin_entry_reversal_residual';
  if v_src is null or position('sum(m.amount)' in v_src) = 0 then
    raise exception 'CP-FIN-F5 PRECOND: fin_entry_reversal_residual ausente o ya migrada (deriva)'
      using errcode = 'P0001';
  end if;
  select prosrc into v_src from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='fin_t12_block_receipt_annulment';
  if v_src is null or position('fin_active_generation' in v_src) > 0 then
    raise exception 'CP-FIN-F5 PRECOND: fin_t12_block_receipt_annulment ausente o ya migrada (deriva)'
      using errcode = 'P0001';
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.fin_entry_reversal_residual(p_entry_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT GREATEST(
    abs(coalesce((SELECT sum(m.amount_cup) FROM public.fin_movements m
                   WHERE m.entry_id = p_entry_id AND m.sense = 'debito'), 0)
      - coalesce((SELECT sum(rm.amount_cup) FROM public.fin_entries r
                   JOIN public.fin_movements rm ON rm.entry_id = r.id
                  WHERE r.reversal_of = p_entry_id AND rm.sense = 'credito'), 0)),
    abs(coalesce((SELECT sum(m.amount_cup) FROM public.fin_movements m
                   WHERE m.entry_id = p_entry_id AND m.sense = 'credito'), 0)
      - coalesce((SELECT sum(rm.amount_cup) FROM public.fin_entries r
                   JOIN public.fin_movements rm ON rm.entry_id = r.id
                  WHERE r.reversal_of = p_entry_id AND rm.sense = 'debito'), 0))
  );
$function$;

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
    -- F5.B (CP-FIN-REM-001): solo la generación ACTIVA de la tienda (tratamiento
    -- canónico de NULL: una recepción sin generación activa no tiene asientos
    -- vivos que bloquear). Una reversión parcial existente SOLO en una
    -- generación superseded ya no bloquea la anulación.
    AND e.generation_id IS NOT DISTINCT FROM public.fin_active_generation(NEW.store_id)
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

do $$
declare
  v_src text; v_n int;
begin
  select prosrc into v_src from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='fin_entry_reversal_residual';
  if position('amount_cup' in v_src) = 0 or position('sum(m.amount)' in v_src) > 0 then
    raise exception 'CP-FIN-F5 POSTCHECK: residual sin conversión CUP completa'
      using errcode = 'P0001';
  end if;
  select prosrc into v_src from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='fin_t12_block_receipt_annulment';
  if position('fin_active_generation(NEW.store_id)' in v_src) = 0 then
    raise exception 'CP-FIN-F5 POSTCHECK: T12 sin filtro de generación activa'
      using errcode = 'P0001';
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='fin_entry_reversal_residual';
  if v_n <> 1 then
    raise exception 'CP-FIN-F5 POSTCHECK: sobrecargas inesperadas de fin_entry_reversal_residual (%)', v_n
      using errcode = 'P0001';
  end if;
end $$;

COMMIT;
