-- COSTPRO-E2E-REACTIVATION-001 · 2026-11-04
-- Fix de pay_commission (hallazgo del E2E «Reporte Entrega — comisiones
-- por FECHA DEL PAGO», error en logs del servidor: 500 «malformed array
-- literal: \"admin\"»): has_store_role_as SOLO tiene la sobrecarga
-- certificada (uuid, uuid, text[]); el RPC le pasaba el ESCALAR 'admin' /
-- 'manager', Postgres casteaba el literal a text[] y fallaba SIEMPRE —
-- ningún pago de comisiones vía API podía completarse desde la migración
-- 20261026000000. Fix: pasar ARRAY['rol']::text[]. Sin cambios de firma,
-- permisos ni semántica.
CREATE OR REPLACE FUNCTION public.pay_commission(p_payment_id uuid, p_payment_method text, p_reference text DEFAULT NULL::text, p_currency text DEFAULT NULL::text, p_exchange_rate numeric DEFAULT NULL::numeric, p_paid_at timestamptz DEFAULT NULL::timestamptz, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_comm record;
  v_currency text;
  v_phys_out numeric := 0;
  v_phys_available numeric := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  SELECT id, store_id, status, currency, exchange_rate, amount_cup, final_amount
    INTO v_comm
    FROM public.commission_payments
    WHERE id = p_payment_id;
  IF v_comm.id IS NULL THEN
    RAISE EXCEPTION 'ERR_COMMISSION_NOT_FOUND: %', p_payment_id;
  END IF;

  IF NOT public.has_store_role_as(v_uid, v_comm.store_id, ARRAY['admin']::text[])
     AND NOT public.has_store_role_as(v_uid, v_comm.store_id, ARRAY['manager']::text[]) THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: pagar comisiones requiere admin o manager';
  END IF;

  -- Idempotencia natural (misma semántica que la ruta: ya pagada → replay)
  IF v_comm.status = 'paid' THEN
    RETURN jsonb_build_object('payment', to_jsonb(v_comm), 'idempotent_replay', true,
      'message', 'La comisión ya estaba pagada');
  END IF;
  IF v_comm.status NOT IN ('approved', 'draft') THEN
    RAISE EXCEPTION 'ERR_INVALID_COMMISSION_STATUS: no se puede pagar una comisión con estado "%"', v_comm.status;
  END IF;
  IF lower(trim(p_payment_method)) NOT IN ('cash', 'transfer', 'zelle', 'mixed') THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYMENT_METHOD: %', p_payment_method;
  END IF;
  IF p_currency IS NOT NULL AND upper(trim(p_currency)) NOT IN ('CUP', 'USD') THEN
    RAISE EXCEPTION 'ERR_INVALID_CURRENCY: %', p_currency;
  END IF;

  -- Fecha del pago: nunca futura (regla 1 del negocio, validada en servidor)
  IF p_paid_at IS NOT NULL AND p_paid_at > now() THEN
    RAISE EXCEPTION 'ERR_PAYMENT_DATE_FUTURE: la fecha del pago (%) no puede ser posterior a ahora (%)', p_paid_at, now();
  END IF;

  v_currency := COALESCE(upper(btrim(p_currency)), v_comm.currency);

  -- Protocolo del cajón: advisory ANTES de la lectura que autoriza la salida
  PERFORM pg_advisory_xact_lock(hashtext(v_comm.store_id::text));

  -- Fase A: una comisión pagada en EFECTIVO entrega BILLETES de su moneda.
  -- Efecto físico por moneda = final_amount en la moneda efectiva del pago
  -- (término v_comm del libro — misma fuente autoritativa). Fail-closed;
  -- lectura post-lock con upper bound 'infinity' (coherente con el lock).
  -- NOTA 'mixed': el libro (v_comm) solo cuenta payment_method='cash' — los
  -- pagos mixtos de comisión no participan del físico en la fórmula vigente
  -- (gap contable PREEXISTENTE, documentado como residual): se valida
  -- estrictamente 'cash' para no alterar la aceptación de 'mixed'.
  IF lower(trim(p_payment_method)) = 'cash' THEN
    v_phys_out := v_comm.final_amount;
    v_phys_available := COALESCE((public.get_cash_currency_summary(
      v_comm.store_id, NULL, 'infinity'::timestamptz) -> 'net' ->> v_currency)::numeric, 0);
    IF COALESCE(v_phys_out, 0) > v_phys_available + 0.005 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, comisión=%',
        v_currency, round(v_phys_available, 2), round(COALESCE(v_phys_out, 0), 2);
    END IF;
  END IF;

  UPDATE public.commission_payments SET
    status = 'paid',
    paid_at = COALESCE(p_paid_at, now()),
    paid_by = v_uid,
    payment_method = lower(trim(p_payment_method)),
    payment_reference = p_reference,
    currency = COALESCE(upper(btrim(p_currency)), currency),
    exchange_rate = CASE WHEN p_exchange_rate IS NOT NULL THEN p_exchange_rate
                         WHEN upper(btrim(COALESCE(p_currency, currency))) <> 'CUP' THEN COALESCE(exchange_rate, 1.0)
                         ELSE 1.0 END,
    updated_at = now()
  WHERE id = p_payment_id
    AND status IN ('approved', 'draft')
    AND store_id = v_comm.store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_COMMISSION_STATE_CHANGED: la comisión cambió de estado concurrentemente — reintentar';
  END IF;

  SELECT id, store_id, status, currency, amount_cup, final_amount, paid_at, paid_by, payment_method
    INTO v_comm
    FROM public.commission_payments
    WHERE id = p_payment_id;

  RETURN jsonb_build_object('payment', to_jsonb(v_comm), 'idempotent_replay', false);
END;
$function$;
