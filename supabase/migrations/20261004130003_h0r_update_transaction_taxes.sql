-- ============================================================================
-- H0-R IMPLEMENTATION — FASE H3 · update_transaction_taxes ENDURECIDA (§9)
-- ============================================================================
-- Contrato: CREATE-SALE-V2-HARDENING-SPEC-RECOVERED.md §9 (Opción B — patrón
-- adjust_total_amount) + §17.4.
--
--   WHO    : auth.uid() IS NOT NULL (PT014) Y (is_admin() O
--            has_store_role_as(auth.uid(), tienda_de_la_transaccion,
--            [admin, manager, encargado])) — membresía EN ESA tienda, no roles
--            globales (cierra T-UTT-005).
--   WHEN   : status IN ('pending','completed') (= "venta confirmada",
--            intención original 20260228 + UI !isVoided). Cualquier otro
--            estado → ERR_TRANSACTION_STATE (cierra T-UTT-006).
--   STORE  : v_store_id se lee DE LA FILA bajo FOR UPDATE; la autorización se
--            evalúa contra esa tienda.
--   FIELDS : applied_taxes / tax_amount / total_amount — los TRES derivados
--            server-side. Firma nueva /3 (p_reason); los parámetros cliente
--            p_tax_amount/p_total_amount DESAPARECEN de la firma (nada del
--            cliente se persiste tal cual — cierra T-UTT-003).
--   HOW    : misma aritmética canónica que create_sale_v2:
--            base = GREATEST(0, subtotal − discount);
--            impuestos validados/reemplazados desde tax_configurations
--            (mismas reglas de catálogo visible para la tienda — §5.4);
--            new_tax = Σ(percentage: GREATEST(0, base − min_exempt)·value/100;
--            fixed: value);
--            new_total = subtotal − discount + new_tax.
--   INVAR  : new_total < SUM(payment_transactions.amount_cup) − 0.01 →
--            ERR_TOTAL_BELOW_PAYMENTS (PT002). La función corre como owner
--            costpro_transaction_adjuster (la clase de privilegio que PT008
--            permite mutar total_amount — familia auditada adjust_*).
--   MOTIVO : p_reason obligatorio (1..500, btrim) — ERR_REASON_REQUIRED
--            (PT013) / ERR_REASON_INVALID.
--   AUDIT  : UPDATE_TRANSACTION_TAXES con old/new {tax_amount, applied_taxes,
--            total_amount} + reason + paid_total_at_time (patrón
--            ADJUST_TOTAL_AMOUNT).
--   ACL    : REVOKE FROM PUBLIC; GRANT authenticated, service_role.
--
-- El ajuste de supervisor E-SEC-FINAL y el trigger PT008 permanecen INTACTOS:
-- total_amount sigue siendo mutable solo por la familia auditada (UTT
-- endurecida + adjust_total_amount). La evasión por impuesto negativo queda
-- estructuralmente imposible (los impuestos se reconstruyen desde catálogo con
-- value > 0 — nunca pueden reducir la base).
-- ============================================================================

-- 0) El cuerpo endurecido llama has_store_role_as desde el contexto
--    costpro_transaction_adjuster (SECURITY DEFINER): grant explícito mínimo.
GRANT EXECUTE ON FUNCTION public.has_store_role_as(uuid, uuid, text[]) TO costpro_transaction_adjuster;

-- 1) Retiro de la firma insegura /4 (sin recálculo, sin tienda, sin estado,
--    sin motivo; reescribía tax_amount/applied_taxes tal cual llegaban)
DROP FUNCTION IF EXISTS public.update_transaction_taxes(uuid, jsonb, numeric, numeric);

-- 2) Firma endurecida /3 (p_transaction_id, p_applied_taxes [ids], p_reason)
CREATE OR REPLACE FUNCTION public.update_transaction_taxes(
  p_transaction_id uuid,
  p_applied_taxes  jsonb,
  p_reason         text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_store_id uuid;
  v_status text;
  v_subtotal numeric;
  v_discount numeric;
  v_old_tax numeric;
  v_old_taxes jsonb;
  v_old_total numeric;
  v_paid_total numeric;
  v_base numeric;
  v_new_tax numeric := 0;
  v_new_total numeric;
  v_applied jsonb := '[]'::jsonb;
  v_tax_ids text[] := '{}';
  v_entry jsonb;
  v_tc record;
  v_reason text;
BEGIN
  -- WHO (1): autenticación (PT014)
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED' USING ERRCODE = 'PT014';
  END IF;

  -- WHICH STORE + WHEN: fila bajo lock; la tienda se lee DE LA TRANSACCIÓN
  SELECT store_id, status::text, subtotal, COALESCE(discount_value, 0),
         tax_amount, applied_taxes, total_amount
    INTO v_store_id, v_status, v_subtotal, v_discount,
         v_old_tax, v_old_taxes, v_old_total
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND: %', p_transaction_id;
  END IF;

  -- WHO (2): autorización por membresía EN LA TIENDA DE LA TRANSACCIÓN
  -- (o admin global). Roles globales sin membresía: DENEGADOS (T-UTT-005).
  IF NOT (
    public.is_admin()
    OR public.has_store_role_as(v_actor, v_store_id, ARRAY['admin', 'manager', 'encargado'])
  ) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- WHEN (estados): solo ventas confirmadas ('pending' | 'completed')
  IF v_status NOT IN ('pending', 'completed') THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_STATE: status=% no admite corrección tributaria', v_status;
  END IF;

  -- MOTIVO (PT013): obligatorio 1..500 tras btrim — misma regla D2/E-SEC-FINAL
  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED' USING ERRCODE = 'PT013';
  END IF;
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'ERR_REASON_INVALID: max 500 caracteres';
  END IF;

  -- WHAT + HOW: reconstrucción server-side desde tax_configurations (§5.4 —
  -- mismas reglas de catálogo visible para la tienda de la transacción)
  IF p_applied_taxes IS NULL OR jsonb_typeof(p_applied_taxes) <> 'array' THEN
    RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: p_applied_taxes debe ser un array de {id}';
  END IF;
  v_base := GREATEST(0, v_subtotal - v_discount);
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_applied_taxes) LOOP
    IF v_entry->>'id' IS NULL OR btrim(v_entry->>'id') = ''
       OR v_entry->>'id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: entrada sin id de configuración';
    END IF;
    SELECT id, name, type, value, min_exempt INTO v_tc
      FROM public.tax_configurations
      WHERE id = (v_entry->>'id')::uuid
        AND is_active = true
        AND (store_id IS NULL OR store_id = v_store_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID';
    END IF;
    IF v_tc.id::text = ANY(v_tax_ids) THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: impuesto duplicado';
    END IF;
    v_tax_ids := array_append(v_tax_ids, v_tc.id::text);
    v_applied := v_applied || jsonb_build_object(
      'id', v_tc.id, 'name', v_tc.name, 'type', v_tc.type,
      'value', v_tc.value, 'min_exempt', v_tc.min_exempt);
    IF v_tc.type = 'percentage' THEN
      v_new_tax := v_new_tax + GREATEST(0, v_base - COALESCE(v_tc.min_exempt, 0)) * v_tc.value / 100;
    ELSE
      v_new_tax := v_new_tax + v_tc.value;
    END IF;
  END LOOP;

  -- Invariante canónica: total = subtotal − descuento + impuesto
  v_new_total := v_subtotal - v_discount + v_new_tax;

  -- INVARIANTE PT002: el pago registrado nunca queda por encima del total
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid_total
    FROM public.payment_transactions
    WHERE transaction_id = p_transaction_id;
  IF v_paid_total > v_new_total + 0.01 THEN
    RAISE EXCEPTION 'ERR_TOTAL_BELOW_PAYMENTS: new_total=% < paid=%', v_new_total, v_paid_total
      USING ERRCODE = 'PT002';
  END IF;

  -- NO-OP auditado (patrón adjust_total_amount): nada que mutar
  IF v_new_tax = v_old_tax AND v_applied = v_old_taxes AND v_new_total = v_old_total THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, old_data, new_data, metadata)
    VALUES ('UPDATE_TRANSACTION_TAXES_NO_OP', 'transactions', p_transaction_id, v_store_id, v_actor,
      jsonb_build_object('tax_amount', v_old_tax, 'applied_taxes', v_old_taxes, 'total_amount', v_old_total),
      jsonb_build_object('tax_amount', v_new_tax, 'applied_taxes', v_applied, 'total_amount', v_new_total),
      jsonb_build_object('reason', v_reason, 'result', 'NO_OP', 'paid_total_at_time', v_paid_total,
                         'executed_as', current_user, 'auth_uid', v_actor));
    RETURN true;
  END IF;

  -- Mutación (owner costpro_transaction_adjuster: la única clase de privilegio
  -- que PT008 permite escribir total_amount)
  UPDATE public.transactions
    SET applied_taxes = v_applied,
        tax_amount = v_new_tax,
        total_amount = v_new_total,
        updated_at = now()
    WHERE id = p_transaction_id;

  -- AUDIT completa
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, old_data, new_data, metadata)
  VALUES ('UPDATE_TRANSACTION_TAXES', 'transactions', p_transaction_id, v_store_id, v_actor,
    jsonb_build_object('tax_amount', v_old_tax, 'applied_taxes', v_old_taxes, 'total_amount', v_old_total),
    jsonb_build_object('tax_amount', v_new_tax, 'applied_taxes', v_applied, 'total_amount', v_new_total),
    jsonb_build_object('reason', v_reason, 'paid_total_at_time', v_paid_total,
                       'executed_as', current_user, 'auth_uid', v_actor));

  RETURN true;
END;
$function$;

-- 3) Owner de la clase de privilegio PT008 (familia auditada adjust_*).
--    ALTER ... OWNER TO exige que el nuevo owner tenga CREATE en el esquema de
--    la función: se otorga de forma TRANSITORIA y se revoca inmediatamente
--    después (el estado final no conserva el privilegio — mínimo privilegio).
GRANT CREATE ON SCHEMA public TO costpro_transaction_adjuster;
ALTER FUNCTION public.update_transaction_taxes(uuid, jsonb, text)
  OWNER TO costpro_transaction_adjuster;
REVOKE CREATE ON SCHEMA public FROM costpro_transaction_adjuster;

-- 4) ACL explícito: EXECUTE solo authenticated y service_role (nunca PUBLIC/anon)
REVOKE EXECUTE ON FUNCTION public.update_transaction_taxes(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_transaction_taxes(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_transaction_taxes(uuid, jsonb, text) TO service_role;
