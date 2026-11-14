-- ============================================================================
-- CP-FIN-FINAL-CLOSE-005 · T12 — SALVAGUARDA DE REVERSIÓN PARCIAL (2026-11-15)
-- ============================================================================
-- Contexto forense (RECT004_REVERSAL_SEMANTICS.md, prueba T12 de m050d):
--   Una reversión PARCIAL enlazada con `reversal_of` (p. ej. RECT-1 sobre
--   FAC-VITALLCONS-001, exceso 151.299.851 CUP de un asiento de 192.039.436)
--   hacía que fin_post_document_annulment tratara el asiento original como
--   «ya revertido» (EXISTS ingenuo) y SALTARA su compensación → residual
--   contable (40.739.585 CUP) sin compensar, en silencio y sin error.
--
-- Salvaguarda mínima de dos capas, 100 % server-side (SQL), sin cambios de
-- datos y sin tocar la interfaz:
--
--   CAPA 1 — MOTOR (todos los tipos de documento):
--     fin_post_document_annulment ya no salta un asiento por la mera
--     existencia de reversal_of: distingue cobertura TOTAL (reversión
--     completa ordinaria → idempotencia INTACTA) de cobertura PARCIAL
--     (residual pendiente → excepción ERR_PARTIAL_REVERSAL_PENDING; el canal
--     _safe la registra en fin_posting_errors = auditoría visible y
--     reprocesable; el canal directo aborta la transacción entera).
--
--   CAPA 2 — NEGOCIO (recepciones):
--     Trigger BEFORE UPDATE OF status en receipts que BLOQUEA la transición
--     a voided/reversed mientras el documento tenga un asiento posted con
--     reversión parcial y residual pendiente. Protege TODAS las vías
--     (reverse_receipt_v2, UPDATE directo, scripts de servicio, API) porque
--     todas convergen en el UPDATE de status. El intento queda además
--     señalado en el log del servidor (RAISE WARNING previo).
--
-- Regularización explícita (única salida documentada):
--   Completar la cobertura del asiento con una regularización contable
--   documentada (p. ej. segunda reversión parcial del residual — patrón del
--   runbook RECT004 §regularización del residual). Con cobertura total ambas
--   capas vuelven al comportamiento ordinario: el trigger deja pasar la
--   transición y el motor respeta la reversión completa como «ya revertido».
--
-- Integridad de las reversiones completas ordinarias: intacta por
-- construcción (la capa de motor solo bloquea cuando el residual calculado
-- supera la tolerancia contable de 0,01 CUP usada por el propio motor).
-- ============================================================================

-- ─── 1) HELPER: desviación de cobertura de las reversiones enlazadas ────────
-- Devuelve la máxima desviación absoluta (CUP) entre el asiento original y
-- el conjunto de asientos con reversal_of = original:
--   · 0 (≤ 0,01)  → cobertura TOTAL (reversión/reversiones completas).
--   · > 0,01      → cobertura PARCIAL o EXCESO: hay residual pendiente.
-- Compara ambos sentidos (débito del original vs crédito de las reversiones
-- y viceversa) para no asumir simetría del historial.
CREATE OR REPLACE FUNCTION public.fin_entry_reversal_residual(p_entry_id uuid)
RETURNS numeric
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
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

COMMENT ON FUNCTION public.fin_entry_reversal_residual IS
  'CP-FIN-FINAL-CLOSE-005 (T12): desviación (CUP) entre un asiento y sus reversiones enlazadas por reversal_of. 0 = cobertura total; >0.01 = reversión parcial/exceso con residual pendiente.';

-- ─── 2) MOTOR: anulación consciente de cobertura (T12) ─────────────────────
CREATE OR REPLACE FUNCTION public.fin_post_document_annulment(
  p_doctype text, p_document_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  e record; m record; v_new uuid; v_count integer := 0;
  v_residual numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fin:' || p_doctype || ':' || p_document_id::text));
  FOR e IN
    SELECT * FROM public.fin_entries
    WHERE document_type = p_doctype AND document_id = p_document_id
      AND status = 'posted' AND event IN ('reconocimiento', 'pago')
    ORDER BY posted_at
  LOOP
    -- ¿ya tiene anulación? (idempotencia)
    IF EXISTS (SELECT 1 FROM public.fin_entries x
               WHERE x.reversal_of = e.id) THEN
      -- T12 (CP-FIN-FINAL-CLOSE-005): distinguir cobertura TOTAL de PARCIAL.
      -- · Reversión completa ordinaria → idempotencia intacta (se respeta el
      --   «ya revertido» y NO se crea una segunda compensación).
      -- · Reversión parcial/en exceso → residual contable pendiente: la
      --   anulación automática NO puede saltar el asiento en silencio.
      v_residual := public.fin_entry_reversal_residual(e.id);
      IF v_residual <= 0.01 THEN
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'ERR_PARTIAL_REVERSAL_PENDING: el asiento % (doc % %) tiene reversiones parciales enlazadas y un residual de % CUP sin compensar. Regularice primero el residual contable (asiento explícito documentado, p. ej. runbook RECT004 §regularización); después la anulación funcionará por el cauce ordinario. El canal _safe registra este intento en fin_posting_errors.',
        e.id, p_doctype, p_document_id, v_residual;
    END IF;
    INSERT INTO public.fin_entries (
      store_id, document_type, document_id, document_number, event, payment_ref,
      economic_date, rule_version_id, movements_snapshot, reversal_of, description, created_by)
    VALUES (
      e.store_id, e.document_type, e.document_id, e.document_number, 'anulacion',
      e.payment_ref, e.economic_date, e.rule_version_id, e.movements_snapshot, e.id,
      'Anulación: ' || coalesce(e.description, ''), e.created_by)
    RETURNING id INTO v_new;
    FOR m IN SELECT * FROM public.fin_movements WHERE entry_id = e.id LOOP
      INSERT INTO public.fin_movements (
        entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
        economic_date, document_number, description, currency_origin, traza)
      VALUES (
        v_new, m.store_id, m.category_code,
        CASE WHEN m.sense = 'debito' THEN 'credito' ELSE 'debito' END,
        m.amount, m.currency, m.exchange_rate, m.economic_date, m.document_number,
        'Anulación: ' || coalesce(m.description, ''), m.currency_origin,
        m.traza || jsonb_build_object('anulacion_de', m.id));
    END LOOP;
    UPDATE public.fin_entries SET status = 'reversed' WHERE id = e.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.fin_post_document_annulment IS
  'Motor CP-FIN §6: asiento compensatorio enlazado (nunca UPDATE del histórico). T12 (CP-FIN-FINAL-CLOSE-005): un asiento con reversión PARCIAL enlazada (residual > 0.01 CUP) BLOQUEA la anulación con ERR_PARTIAL_REVERSAL_PENDING en lugar de saltarse en silencio; la reversión completa ordinaria conserva la idempotencia.';

-- ─── 3) NEGOCIO: bloqueo de anulación de recepción con residual pendiente ──
CREATE OR REPLACE FUNCTION public.fin_t12_block_receipt_annulment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
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

DROP TRIGGER IF EXISTS fin_t12_receipt_annulment_block ON public.receipts;
CREATE TRIGGER fin_t12_receipt_annulment_block
  BEFORE UPDATE OF status ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.fin_t12_block_receipt_annulment();

COMMENT ON FUNCTION public.fin_t12_block_receipt_annulment IS
  'CP-FIN-FINAL-CLOSE-005 (T12): bloquea server-side toda transición voided/reversed de una recepción cuyo asiento posted tenga reversión parcial con residual pendiente. Sin escape hatch: el residual se resuelve contablemente (regularización documentada), no se esquiva. El clean-up E2E gobernado (conmutando el rol de replicación de sesión durante la limpieza) desactiva triggers y no se ve afectado.';

-- ─── 4) ACL endurecida (patrón 20261113120700: REVOKE PUBLIC/anon) ────────
REVOKE ALL ON FUNCTION public.fin_entry_reversal_residual(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_entry_reversal_residual(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fin_t12_block_receipt_annulment() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_post_document_annulment(text, uuid) FROM PUBLIC, anon;
