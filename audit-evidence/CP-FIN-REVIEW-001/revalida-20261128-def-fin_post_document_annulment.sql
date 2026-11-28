CREATE OR REPLACE FUNCTION public.fin_post_document_annulment(p_doctype text, p_document_id uuid, p_generation_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  e record; m record; v_new uuid; v_count integer := 0;
  v_residual numeric;
  v_store uuid; v_gen uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fin:' || p_doctype || ':' || p_document_id::text));

  v_store := (SELECT store_id FROM public.fin_entries
              WHERE document_type = p_doctype AND document_id = p_document_id
              ORDER BY posted_at LIMIT 1);
  IF v_store IS NULL THEN RETURN 0; END IF;
  v_gen := coalesce(p_generation_id, public.fin_active_generation(v_store));

  FOR e IN
    SELECT * FROM public.fin_entries
    WHERE document_type = p_doctype AND document_id = p_document_id
      AND status = 'posted' AND event IN ('reconocimiento', 'pago')
      AND generation_id IS NOT DISTINCT FROM v_gen
    ORDER BY posted_at
  LOOP
    -- ¿ya tiene anulación? (idempotencia dentro de la generación)
    IF EXISTS (SELECT 1 FROM public.fin_entries x
               WHERE x.reversal_of = e.id) THEN
      v_residual := public.fin_entry_reversal_residual(e.id);
      IF v_residual <= 0.01 THEN
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'ERR_PARTIAL_REVERSAL_PENDING: el asiento % (doc % %) tiene reversiones parciales enlazadas y un residual de % CUP sin compensar. Regularice primero el residual contable (asiento explícito documentado, p. ej. runbook RECT004 §regularización); después la anulación funcionará por el cauce ordinario. El canal _safe registra este intento en fin_posting_errors.',
        e.id, p_doctype, p_document_id, v_residual;
    END IF;
    INSERT INTO public.fin_entries (
      store_id, document_type, document_id, document_number, event, payment_ref,
      economic_date, rule_version_id, movements_snapshot, reversal_of, description, created_by,
      generation_id)
    VALUES (
      e.store_id, e.document_type, e.document_id, e.document_number, 'anulacion',
      e.payment_ref, e.economic_date, e.rule_version_id, e.movements_snapshot, e.id,
      'Anulación: ' || coalesce(e.description, ''), e.created_by, v_gen)
    RETURNING id INTO v_new;
    FOR m IN SELECT * FROM public.fin_movements WHERE entry_id = e.id LOOP
      INSERT INTO public.fin_movements (
        entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
        economic_date, document_number, description, currency_origin, amount_origin, traza)
      VALUES (
        v_new, m.store_id, m.category_code,
        CASE WHEN m.sense = 'debito' THEN 'credito' ELSE 'debito' END,
        m.amount, m.currency, m.exchange_rate, m.economic_date, m.document_number,
        'Anulación: ' || coalesce(m.description, ''), m.currency_origin,
        m.amount_origin,
        m.traza || jsonb_build_object('anulacion_de', m.id));
    END LOOP;
    UPDATE public.fin_entries SET status = 'reversed' WHERE id = e.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $function$;
