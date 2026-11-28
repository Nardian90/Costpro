-- ============================================================================
-- Migration: 20261128153300_cp_fin_f4_ledger_append_only.sql
-- Misión:    CP-FIN-REM-001 — PR-A F4 (solo-adición del libro contable)
-- Fecha:     2026-11-28
-- ============================================================================
-- F4 — INMUTABILIDAD DEL LIBRO. Estado previo (revalidado en vivo 2026-11-28):
--   fin_entries/fin_movements SIN triggers de solo-adición (solo
--   fin_trg_entries_generation en INSERT). Cualquier UPDATE/DELETE directo era
--   posible para quien pasara RLS.
--
-- Reglas NUEVAS (fail-closed, ENABLE ALWAYS):
--   fin_entries:
--     · DELETE: bloqueado SIEMPRE (ni mantenimiento).
--     · UPDATE permitido SOLO en: (A) posted→reversed con contraasiento
--       enlazado (reversal_of=OLD.id ya insertado en la misma transacción;
--       única columna cambiada: status); (B) relleno de generation_id NULL →
--       generación ACTIVA de la MISMA tienda (única columna cambiada);
--       (C) mantenimiento controlado: SOLO columns movements_snapshot y
--       description del asiento rectificado por fin_rectification_apply.
--     · Todo lo demás → ERR_FIN_INMUTABLE.
--   fin_movements:
--     · UPDATE: bloqueado SIEMPRE (las correcciones económicas van por
--       asientos compensatorios).
--     · DELETE: SOLO bajo mantenimiento controlado del asiento rectificado.
--   MANTENIMIENTO CONTROLADO (único bypass, freno NO candado — cualquier sesión
--   con privilegios puede fijar el parámetro, por eso se exige (iii)+(iv)):
--     (i)   costpro.fin_maintenance='on' fijado con set_config(...,true)
--           (transaccional, nunca por defecto);
--     (ii)  lo fija EXCLUSIVAMENTE fin_rectification_apply;
--     (iii) el trigger exige costpro.fin_rectification_entry=<uuid> y solo
--           admite ESE asiento/filas (no existe registro de autorización
--           previa en la función — inspeccionado; se acota a la fila concreta
--           conforme a la misión 5.3-iii);
--     (iv)  CADA uso deja fila en audit_logs (FIN_MAINTENANCE_*, sin importes
--           ni SQLERRM — regla 0.12);
--     (v)   no existe RPC pública que active el bypass; app.restore_mode no se usa.
--   Compatibilidad revisada (prosrc en vivo): fin_post_document_annulment
--   (UPDATE solo status='reversed' tras insertar contraasiento → excepción A);
--   fin_generation_build / fin_apply_opening_balance (solo INSERT);
--   reset_store_data (no toca estas tablas); delete_received_service_draft
--   (no modifica asientos); soft_delete_store (borrado lógico, sin filas).
--   Cascada de borrado duro de tienda (stores→fin_entries): el trigger la
--   BLOQUEA (fail-closed) — comportamiento documentado.
--
-- Rollback: supabase/rollbacks/20261128153300_rollback_cp_fin_f4.sql
-- ============================================================================

BEGIN;

do $$
declare
  v_tablas text[]; v_faltan text[]; v_rect text;
begin
  v_tablas := array['fin_entries','fin_movements'];
  select array_agg(t) into v_faltan from unnest(v_tablas) t
   where to_regclass('public.' || t) is null;
  if coalesce(array_length(v_faltan, 1), 0) > 0 then
    raise exception 'CP-FIN-F4 PRECOND: tablas ausentes: %', array_to_string(v_faltan, ', ')
      using errcode = 'P0001';
  end if;
  select prosrc into v_rect from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='fin_rectification_apply';
  if v_rect is null or position('DELETE FROM public.fin_movements WHERE entry_id = v_entry_id' in v_rect) = 0 then
    raise exception 'CP-FIN-F4 PRECOND: fin_rectification_apply ausente o sin el bloque de reparación esperado (deriva)'
      using errcode = 'P0001';
  end if;
end $$;

-- ── Trigger guard de fin_entries ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_entries_immutable_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public', 'pg_temp' AS $$
DECLARE
  v_maint boolean;
  v_rect_entry uuid;
BEGIN
  v_maint := coalesce(current_setting('costpro.fin_maintenance', true), 'off') = 'on';
  v_rect_entry := nullif(coalesce(current_setting('costpro.fin_rectification_entry', true), ''), '')::uuid;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ERR_FIN_INMUTABLE: DELETE sobre fin_entries bloqueado siempre (libro de solo-adición; entrada %); las correcciones van por asientos compensatorios y la reparación controlada por fin_rectification_apply', OLD.id
      USING ERRCODE = 'P0001';
  END IF;

  -- (A) posted→reversed: única columna cambiada = status, con contraasiento enlazado
  IF OLD.status = 'posted' AND NEW.status = 'reversed'
     AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status')
     AND EXISTS (SELECT 1 FROM public.fin_entries r WHERE r.reversal_of = OLD.id) THEN
    RETURN NEW;
  END IF;

  -- (B) relleno generation_id NULL → generación ACTIVA de la misma tienda
  IF OLD.generation_id IS NULL AND NEW.generation_id IS NOT NULL
     AND (to_jsonb(NEW) - 'generation_id') = (to_jsonb(OLD) - 'generation_id')
     AND NEW.generation_id = (SELECT g.id FROM public.fin_posting_generations g
                              WHERE g.store_id = NEW.store_id AND g.status = 'active' LIMIT 1) THEN
    RETURN NEW;
  END IF;

  -- (C) mantenimiento controlado: SOLO movements_snapshot y description del asiento rectificado
  IF v_maint AND v_rect_entry IS NOT NULL AND NEW.id = v_rect_entry
     AND (to_jsonb(NEW) - 'movements_snapshot' - 'description')
       = (to_jsonb(OLD) - 'movements_snapshot' - 'description') THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
    VALUES (NULL, 'FIN_MAINTENANCE_ENTRY_RECTIFIED', 'fin_entries', NEW.id,
            jsonb_build_object('motivo', 'fin_rectification_apply'),
            jsonb_build_object('motivo', 'fin_rectification_apply',
                               'columnas', to_jsonb(ARRAY['movements_snapshot','description']::text[])),
            NEW.store_id);
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'ERR_FIN_INMUTABLE: UPDATE de fin_entries solo admite (A) posted→reversed con contraasiento enlazado, (B) relleno de generation_id NULL→generación activa de la misma tienda o (C) reparación controlada de movements_snapshot/description (entrada %)', OLD.id
    USING ERRCODE = 'P0001';
END $$;

DROP TRIGGER IF EXISTS fin_trg_entries_immutable ON public.fin_entries;
CREATE TRIGGER fin_trg_entries_immutable
  BEFORE UPDATE OR DELETE ON public.fin_entries
  FOR EACH ROW EXECUTE FUNCTION public.fin_entries_immutable_guard();
ALTER TABLE public.fin_entries ENABLE ALWAYS TRIGGER fin_trg_entries_immutable;

-- ── Trigger guard de fin_movements ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_movements_immutable_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public', 'pg_temp' AS $$
DECLARE
  v_maint boolean;
  v_rect_entry uuid;
BEGIN
  v_maint := coalesce(current_setting('costpro.fin_maintenance', true), 'off') = 'on';
  v_rect_entry := nullif(coalesce(current_setting('costpro.fin_rectification_entry', true), ''), '')::uuid;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'ERR_FIN_INMUTABLE: UPDATE sobre fin_movements bloqueado siempre (entrada %); las correcciones económicas se hacen con asientos compensatorios', OLD.entry_id
      USING ERRCODE = 'P0001';
  END IF;

  -- DELETE: SOLO mantenimiento controlado del asiento rectificado (auditable)
  IF v_maint AND v_rect_entry IS NOT NULL AND OLD.entry_id = v_rect_entry THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
    VALUES (NULL, 'FIN_MAINTENANCE_MOVEMENTS_REPLACED', 'fin_movements', OLD.entry_id,
            jsonb_build_object('motivo', 'fin_rectification_apply'),
            jsonb_build_object('motivo', 'fin_rectification_apply', 'movimiento', OLD.id::text),
            OLD.store_id);
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'ERR_FIN_INMUTABLE: DELETE de fin_movements solo bajo reparación controlada de fin_rectification_apply (entrada %)', OLD.entry_id
    USING ERRCODE = 'P0001';
END $$;

DROP TRIGGER IF EXISTS fin_trg_movements_immutable ON public.fin_movements;
CREATE TRIGGER fin_trg_movements_immutable
  BEFORE UPDATE OR DELETE ON public.fin_movements
  FOR EACH ROW EXECUTE FUNCTION public.fin_movements_immutable_guard();
ALTER TABLE public.fin_movements ENABLE ALWAYS TRIGGER fin_trg_movements_immutable;

COMMENT ON FUNCTION public.fin_entries_immutable_guard() IS
  'CP-FIN-REM-001 F4: solo-adición del libro. DELETE nunca; UPDATE solo (A) posted→reversed con contraasiento, (B) relleno de generación activa o (C) rectificación controlada (auditable). El parámetro costpro.fin_maintenance es un FRENO, no un candado: cualquier sesión privilegiada puede fijarlo; por eso el bypass exige el asiento concreto (fin_rectification_entry) y deja fila en audit_logs.';
COMMENT ON FUNCTION public.fin_movements_immutable_guard() IS
  'CP-FIN-REM-001 F4: fin_movements inmutables. UPDATE nunca; DELETE solo reparación controlada (auditable) de fin_rectification_apply.';

-- ── fin_rectification_apply: apertura/cierre de la ventana (cambio mínimo) ─
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
    -- F4 (CP-FIN-REM-001): ventana de mantenimiento CONTROLADA — se abre SOLO
    -- para este asiento (set_config transaccional; el trigger la exige acotada
    -- por fin_rectification_entry y audita CADA uso en audit_logs).
    PERFORM set_config('costpro.fin_maintenance', 'on', true);
    PERFORM set_config('costpro.fin_rectification_entry', v_entry_id::text, true);
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
    -- F4: cierre de la ventana de mantenimiento (higiene; la transacción es la barrera real)
    PERFORM set_config('costpro.fin_maintenance', 'off', true);
    PERFORM set_config('costpro.fin_rectification_entry', '', true);
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

-- ── Postcheck fail-closed ──────────────────────────────────────────────────
do $$
declare
  v_n int; v_rect text;
begin
  select count(*) into v_n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
   where p.proname in ('fin_entries_immutable_guard','fin_movements_immutable_guard')
     and t.tgenabled = 'A';
  if v_n <> 2 then
    raise exception 'CP-FIN-F4 POSTCHECK: esperados 2 triggers ENABLE ALWAYS, encontrados %', v_n
      using errcode = 'P0001';
  end if;
  select prosrc into v_rect from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='fin_rectification_apply';
  if position('costpro.fin_rectification_entry' in v_rect) = 0 then
    raise exception 'CP-FIN-F4 POSTCHECK: fin_rectification_apply sin ventana de mantenimiento'
      using errcode = 'P0001';
  end if;
end $$;

COMMIT;
