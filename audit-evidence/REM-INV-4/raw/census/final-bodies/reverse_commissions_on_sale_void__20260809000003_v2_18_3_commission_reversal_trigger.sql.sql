-- DECLARED FINAL STATE (Git) de reverse_commissions_on_sale_void
-- fuente: 20260809000003_v2_18_3_commission_reversal_trigger.sql stmt#2

CREATE OR REPLACE FUNCTION public.reverse_commissions_on_sale_void()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_payment RECORD;
  v_flagged_count int := 0;
BEGIN
  -- Solo disparar cuando status cambia a voided o reversed
  IF NEW.status NOT IN ('voided', 'reversed') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Buscar commission_payments cuyo período incluye la transacción
  FOR v_payment IN
    SELECT cp.*
    FROM public.commission_payments cp
    WHERE cp.store_id = NEW.store_id
      AND cp.status IN ('approved', 'paid')
      AND cp.period_start <= NEW.created_at
      AND cp.period_end >= NEW.created_at
  LOOP
    -- Opción A: marcar como flagged_for_review (NO cancelar)
    UPDATE public.commission_payments SET
      status = 'flagged_for_review',
      manual_adjustment_reason = COALESCE(manual_adjustment_reason, '') ||
        E'\n[FLAGGED] Contains sale ' || NEW.id || ' (' || NEW.status || '). Manual review required.',
      updated_at = NOW()
    WHERE id = v_payment.id;

    v_flagged_count := v_flagged_count + 1;

    -- Audit log
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('COMMISSION_FLAGGED_FOR_REVIEW', 'commission_payments', v_payment.id::text,
      v_payment.store_id, NEW.seller_id,
      jsonb_build_object(
        'original_payment_id', v_payment.id,
        'voided_sale_id', NEW.id,
        'sale_status', NEW.status,
        'original_amount', v_payment.final_amount,
        'original_status', v_payment.status,
        'reason', 'Sale voided/reversed — manual review required'
      ));
  END LOOP;

  -- Si no se flaggeó ninguna comisión, no es error (puede que no haya comisión para ese período)
  RETURN NEW;
END;
$function$
