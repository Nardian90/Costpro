CREATE OR REPLACE FUNCTION public.fin_apply_opening_balance(p_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_ob public.fin_opening_balances%ROWTYPE;
  v_entry uuid; v_sense text; v_cat public.fin_categories%ROWTYPE;
  v_amount_cup numeric;
BEGIN
  SELECT * INTO v_ob FROM public.fin_opening_balances WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_OPENING_NOT_FOUND'; END IF;
  IF v_caller IS NULL OR NOT public.has_store_role_as(v_caller, v_ob.store_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_ob.status <> 'draft' THEN RAISE EXCEPTION 'ERR_OPENING_NOT_DRAFT (estado: %)', v_ob.status; END IF;
  SELECT * INTO v_cat FROM public.fin_categories WHERE code = v_ob.category_code;
  v_amount_cup := round(CASE WHEN v_ob.currency = 'CUP' THEN v_ob.amount
                             ELSE v_ob.amount * v_ob.exchange_rate END, 2);

  IF v_ob.amount = 0 THEN
    -- M-015 · Declaración de apertura en cero: documenta la VERIFICACIÓN de
    -- que la cuenta no tenía saldo al corte (sin inventar importes). El
    -- asiento no lleva movimientos: no altera saldos ni ecuación contable.
    IF NULLIF(btrim(coalesce(v_ob.notes, '')), '') IS NULL THEN
      RAISE EXCEPTION 'ERR_OPENING_ZERO_NEEDS_NOTES: la declaración en cero exige justificación/documento de verificación';
    END IF;
    INSERT INTO public.fin_entries (
      store_id, document_type, document_id, document_number, event, economic_date,
      rule_version_id, description, created_by)
    VALUES (v_ob.store_id, 'APERTURA_FIN', NULL, 'APERTURA-' || v_ob.as_of_date, 'apertura',
            v_ob.as_of_date, NULL,
            'Declaración de apertura en cero: ' || v_cat.name, v_caller)
    RETURNING id INTO v_entry;
    UPDATE public.fin_opening_balances
    SET status = 'applied', applied_at = now(), entry_id = v_entry, authorized_by = v_caller
    WHERE id = p_id;
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('FIN_OPENING_APPLIED_ZERO', 'fin_opening_balances', p_id, v_ob.store_id, v_caller,
            jsonb_build_object('category', v_ob.category_code, 'amount_cup', 0,
                               'as_of', v_ob.as_of_date, 'cero_documentado', true,
                               'notas', v_ob.notes));
    RETURN jsonb_build_object('status', 'success', 'entry_id', v_entry, 'cero', true);
  END IF;

  IF v_cat.clase IN ('activo', 'gasto') THEN v_sense := 'debito'; ELSE v_sense := 'credito'; END IF;
  INSERT INTO public.fin_entries (
    store_id, document_type, document_id, document_number, event, economic_date,
    rule_version_id, description, created_by)
  VALUES (v_ob.store_id, 'APERTURA_FIN', NULL, 'APERTURA-' || v_ob.as_of_date, 'apertura',
          v_ob.as_of_date, NULL, 'Saldo inicial: ' || v_cat.name, v_caller)
  RETURNING id INTO v_entry;
  INSERT INTO public.fin_movements (
    entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
    economic_date, document_number, description, currency_origin, traza)
  VALUES (v_entry, v_ob.store_id, v_ob.category_code, v_sense, v_ob.amount,
          CASE WHEN v_ob.currency = 'CUP' THEN 'CUP' ELSE v_ob.currency END,
          CASE WHEN v_ob.currency = 'CUP' THEN 1 ELSE v_ob.exchange_rate END,
          v_ob.as_of_date, 'APERTURA-' || v_ob.as_of_date,
          'Saldo inicial: ' || v_cat.name, v_ob.currency,
          jsonb_build_object('origen', 'saldo_inicial'));
  UPDATE public.fin_opening_balances
  SET status = 'applied', applied_at = now(), entry_id = v_entry, authorized_by = v_caller
  WHERE id = p_id;
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('FIN_OPENING_APPLIED', 'fin_opening_balances', p_id, v_ob.store_id, v_caller,
          jsonb_build_object('category', v_ob.category_code, 'amount_cup', v_amount_cup,
                             'as_of', v_ob.as_of_date));
  RETURN jsonb_build_object('status', 'success', 'entry_id', v_entry);
END $function$;
