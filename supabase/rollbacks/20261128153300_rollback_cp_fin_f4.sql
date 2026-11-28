-- ============================================================================
-- Rollback: 20261128153300_rollback_cp_fin_f4.sql
-- Retira fin_trg_*_immutable y restaura fin_rectification_apply sin ventana de mantenimiento
-- NO borra asientos ni movimientos; NO toca tablas comerciales. Solo restaura
-- políticas, funciones, privilegios y triggers al estado previo del 2026-11-28.
-- ============================================================================
BEGIN;


DROP TRIGGER IF EXISTS fin_trg_entries_immutable ON public.fin_entries;
DROP TRIGGER IF EXISTS fin_trg_movements_immutable ON public.fin_movements;
DROP FUNCTION IF EXISTS public.fin_entries_immutable_guard();
DROP FUNCTION IF EXISTS public.fin_movements_immutable_guard();

CREATE OR REPLACE FUNCTION public.fin_rectification_apply(p_store_id uuid, p_document_number text, p_document_type text, p_economic_date date, p_description text, p_movements jsonb, p_generation_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_repair boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_gen uuid := coalesce(p_generation_id, public.fin_active_generation(p_store_id));
  v_entry_id uuid;
  v_expected int := jsonb_array_length(p_movements);
  v_debit numeric := 0; v_credit numeric := 0;
  v_n_mov int := 0; v_saldo numeric := 0;
  v_m jsonb; t jsonb; r record;
  v_audit uuid;
  v_count int;
  v_coherente boolean;
  v_antes int := 0;
BEGIN
  -- ACL pura (patrón fin_generation_build / fin_rectify_*): el canal de
  -- ejecución se restringe por GRANT a service_role (§4); sin chequeo interno
  -- de auth.role() — mismo diseño que el resto del motor.
  IF p_store_id IS NULL OR p_document_number IS NULL OR p_document_type IS NULL
     OR p_economic_date IS NULL OR p_movements IS NULL
     OR jsonb_typeof(p_movements) <> 'array' OR v_expected = 0 THEN
    RAISE EXCEPTION 'ERR_RECT_PARAMS_INVALIDOS: store/document_number/type/date/movements[] no vacíos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store_id) THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: tienda %', p_store_id;
  END IF;
  IF v_gen IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.fin_posting_generations g
       WHERE g.id = v_gen AND g.store_id = p_store_id
         AND g.status IN ('active', 'building', 'candidate')) THEN
    RAISE EXCEPTION 'ERR_GENERACION_NO_ENCONTRADA: generación destino % inválida para la tienda', v_gen;
  END IF;

  -- Serialización por (tienda, documento): idempotencia bajo concurrencia.
  PERFORM pg_advisory_xact_lock(hashtext('fin_rect:' || p_store_id::text || ':' || p_document_number));

  -- Validación estructural de movements — fail-closed ANTES de escribir nada.
  FOR v_m IN SELECT * FROM jsonb_array_elements(p_movements) LOOP
    IF v_m ->> 'categoria' IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.fin_categories c
         WHERE c.code = v_m ->> 'categoria' AND c.is_active) THEN
      RAISE EXCEPTION 'ERR_CATEGORIA_INVALIDA: %', v_m ->> 'categoria';
    END IF;
    IF (v_m ->> 'sentido') NOT IN ('debito', 'credito') THEN
      RAISE EXCEPTION 'ERR_SENTIDO_INVALIDO: %', v_m ->> 'sentido';
    END IF;
    IF coalesce((v_m ->> 'amount')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'ERR_MONTO_INVALIDO: % (el motor prohíbe movimientos <= 0)', v_m ->> 'amount';
    END IF;
  END LOOP;

  -- Partida doble EXIGIDA para toda rectificación (validación previa).
  SELECT coalesce(sum(CASE WHEN m ->> 'sentido' = 'debito'  THEN round((m ->> 'amount')::numeric, 2) ELSE 0 END), 0),
         coalesce(sum(CASE WHEN m ->> 'sentido' = 'credito' THEN round((m ->> 'amount')::numeric, 2) ELSE 0 END), 0)
    INTO v_debit, v_credit
  FROM jsonb_array_elements(p_movements) m;
  IF abs(v_debit - v_credit) > 0.005 THEN
    RAISE EXCEPTION 'ERR_RECTIFICACION_DESQUILIBRADA: débitos=% créditos=%', v_debit, v_credit;
  END IF;

  -- Idempotencia completa: asiento previo en la generación destino.
  SELECT count(*) INTO v_count
  FROM public.fin_entries e
  WHERE e.store_id = p_store_id AND e.generation_id = v_gen
    AND e.document_number = p_document_number AND e.event = 'ajuste_manual';
  IF v_count > 1 THEN
    RAISE EXCEPTION 'ERR_RECTIFICACION_AMBIGUA: % asientos % en la generación %', v_count, p_document_number, v_gen;
  END IF;

  IF v_count = 1 THEN
    SELECT e.id INTO v_entry_id
    FROM public.fin_entries e
    WHERE e.store_id = p_store_id AND e.generation_id = v_gen
      AND e.document_number = p_document_number AND e.event = 'ajuste_manual';

    SELECT count(*),
           coalesce(round(sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END), 2), 0)
      INTO v_n_mov, v_saldo
    FROM public.fin_movements m WHERE m.entry_id = v_entry_id;
    v_antes := v_n_mov;

    -- Coherencia EXACTA: multiconjunto de movimientos (categoría|sentido|moneda|tasa|importe,
    -- serializado y ordenado) idéntico al esperado. NOTA: paréntesis explícitos —
    -- en PostgreSQL || enlaza más fuerte que ->>, y la cadena sin paréntesis
    -- se parsea como ((... || x) ->> 'sentido') → error text ->> unknown.
    -- P2-review 111: la moneda y la tasa ENTRAN en la firma — un reintento con
    -- mismos importes nominales pero distinta moneda/tasa NO es ya_completa
    -- (el saldo CUP real difiere; sin esto un par equilibrado conservaría el
    -- valor CUP equivocado sin reparación).
    SELECT
      (SELECT string_agg(m.category_code || '|' || m.sense || '|' || m.currency || '|' || round(m.exchange_rate, 6)::text || '|' || round(m.amount, 2)::text, ';'
               ORDER BY m.category_code, m.sense, m.currency, round(m.exchange_rate, 6), round(m.amount, 2))
         FROM public.fin_movements m WHERE m.entry_id = v_entry_id)
      =
      (SELECT string_agg((x ->> 'categoria') || '|' || (x ->> 'sentido') || '|' || coalesce(x ->> 'currency', 'CUP') || '|' || round(coalesce((x ->> 'exchange_rate')::numeric, 1), 6)::text || '|' || round((x ->> 'amount')::numeric, 2)::text, ';'
               ORDER BY x ->> 'categoria', x ->> 'sentido', coalesce(x ->> 'currency', 'CUP'), round(coalesce((x ->> 'exchange_rate')::numeric, 1), 6), round((x ->> 'amount')::numeric, 2))
         FROM jsonb_array_elements(p_movements) AS je(x))
    INTO v_coherente;

    IF v_n_mov >= 1 AND v_coherente AND abs(v_saldo) <= 0.005 THEN
      RETURN jsonb_build_object('status', 'ya_completa', 'entry_id', v_entry_id,
        'generation_id', v_gen, 'movimientos', v_n_mov, 'saldo', v_saldo);
    END IF;

    IF NOT coalesce(p_repair, false) THEN
      RAISE EXCEPTION 'ERR_RECTIFICACION_PARCIAL: asiento % con % movimientos (esperados %, saldo %) — complete o repare con p_repair = true', v_entry_id, v_n_mov, v_expected, v_saldo;
    END IF;

    -- Reparación CONTROLADA (misma transacción): movimientos reemplazados por
    -- los esperados; snapshot actualizado; traza de auditoría obligatoria.
    DELETE FROM public.fin_movements WHERE entry_id = v_entry_id;
    UPDATE public.fin_entries
       SET movements_snapshot = p_movements, description = coalesce(p_description, description)
     WHERE id = v_entry_id;
    FOR t IN SELECT * FROM jsonb_array_elements(p_movements) LOOP
      INSERT INTO public.fin_movements (
        entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
        economic_date, document_number, description, currency_origin, amount_origin, traza)
      VALUES (
        v_entry_id, p_store_id, t ->> 'categoria', t ->> 'sentido', (t ->> 'amount')::numeric,
        coalesce(t ->> 'currency', 'CUP'), coalesce((t ->> 'exchange_rate')::numeric, 1),
        p_economic_date, p_document_number, coalesce(t ->> 'description', p_description),
        t ->> 'currency_origin', (t ->> 'amount_origin')::numeric, coalesce(t -> 'traza', '{}'::jsonb));
    END LOOP;
    SELECT count(*),
           coalesce(round(sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END), 2), 0)
      INTO v_n_mov, v_saldo
    FROM public.fin_movements m WHERE m.entry_id = v_entry_id;
    IF v_n_mov <> v_expected OR abs(v_saldo) > 0.005 THEN
      RAISE EXCEPTION 'ERR_RECTIFICACION_VERIFICACION: tras reparar quedan %/% movimientos (saldo %)', v_n_mov, v_expected, v_saldo;
    END IF;
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
    VALUES (p_user_id, 'SYSTEM_RECTIFICATION_REPAIRED', 'fin_entries', v_entry_id,
            jsonb_build_object('entrada', v_entry_id, 'movimientos_antes', v_antes),
            jsonb_build_object('entry_id', v_entry_id, 'documento', p_document_number,
                               'movimientos', v_expected, 'saldo', v_saldo),
            p_store_id) RETURNING id INTO v_audit;
    RETURN jsonb_build_object('status', 'reparada', 'entry_id', v_entry_id,
      'generation_id', v_gen, 'movimientos', v_n_mov, 'saldo', v_saldo, 'audit_id', v_audit);
  END IF;

  -- Creación ATÓMICA: asiento + TODOS los movimientos en la misma transacción.
  INSERT INTO public.fin_entries (
    store_id, document_type, document_id, document_number, event, payment_ref,
    economic_date, rule_version_id, movements_snapshot, description, created_by, generation_id)
  VALUES (
    p_store_id, p_document_type, NULL, p_document_number, 'ajuste_manual', NULL,
    p_economic_date, NULL, p_movements, p_description, p_user_id, v_gen)
  RETURNING id INTO v_entry_id;

  FOR t IN SELECT * FROM jsonb_array_elements(p_movements) LOOP
    INSERT INTO public.fin_movements (
      entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
      economic_date, document_number, description, currency_origin, amount_origin, traza)
    VALUES (
      v_entry_id, p_store_id, t ->> 'categoria', t ->> 'sentido', (t ->> 'amount')::numeric,
      coalesce(t ->> 'currency', 'CUP'), coalesce((t ->> 'exchange_rate')::numeric, 1),
      p_economic_date, p_document_number, coalesce(t ->> 'description', p_description),
      t ->> 'currency_origin', (t ->> 'amount_origin')::numeric, coalesce(t -> 'traza', '{}'::jsonb));
  END LOOP;

  -- Verificación de partida doble POST-inserción (fallo → revierte TODO).
  SELECT count(*),
         coalesce(round(sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END), 2), 0)
    INTO v_n_mov, v_saldo
  FROM public.fin_movements m WHERE m.entry_id = v_entry_id;
  IF v_n_mov <> v_expected OR abs(v_saldo) > 0.005 THEN
    RAISE EXCEPTION 'ERR_RECTIFICACION_VERIFICACION: %/% movimientos (saldo %) — transacción revertida', v_n_mov, v_expected, v_saldo;
  END IF;

  -- Documento de auditoría + verificación (misma transacción).
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
  VALUES (p_user_id, 'SYSTEM_RECTIFICATION_APPLIED', 'fin_entries', v_entry_id,
          jsonb_build_object('entrada', NULL),
          jsonb_build_object('entry_id', v_entry_id, 'documento', p_document_number,
                             'tipo', p_document_type, 'fecha_economica', p_economic_date,
                             'movimientos', v_expected, 'debitos', v_debit, 'creditos', v_credit),
          p_store_id) RETURNING id INTO v_audit;
  IF v_audit IS NULL THEN
    RAISE EXCEPTION 'ERR_AUDITORIA_FALTANTE: documento de auditoría no insertado';
  END IF;

  RETURN jsonb_build_object('status', 'creada', 'entry_id', v_entry_id,
    'generation_id', v_gen, 'movimientos', v_n_mov, 'saldo', v_saldo, 'audit_id', v_audit);
END $function$;

COMMIT;
