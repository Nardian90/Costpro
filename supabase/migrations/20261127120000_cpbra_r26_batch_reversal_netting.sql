-- ============================================================================
-- Migration: 20261127120000_cpbra_r26_batch_reversal_netting.sql
-- Misión:    CP-BRA-R05-APPROVAL-AND-R25-R26-REMEDIATION-001 — FASE 3 (R-26 / F011-002)
-- Fecha:     2026-11-27
-- ============================================================================
-- DEFECTO CORREGIDO (evidencia FIN-011, pin N7):
--   register_supplier_payment_batch calculaba el saldo pendiente sumando TODAS
--   las filas financieras SIN distinguir las contra-filas de reversión
--   (direction='reversal' sumaba como POSITIVO). La operación individual y el
--   motor financiero (trigger update_payment_status) aplican neteo → tras una
--   reversión válida el pre-check del batch calculaba saldo negativo o
--   incorrecto y rechazaba pagos legítimos con ERR_BATCH_OVERPAY. La verdad en
--   BD permanecía correcta (bloqueo de operaciones, no corrupción).
--
-- SOLUCIÓN (misma semántica contable del motor autoritativo — sin fórmulas
--   paralelas): el único SUM del pre-check adopta el CASE de neteo del motor
--   single (20261126140000 §2): las contra-filas direction='reversal' RESTAN
--   en la moneda del documento. Reversas parciales, totales y múltiples se
--   netean por acumulación; la idempotencia (fast path de replay) es
--   INTACTA — el replay devuelve antes del pre-check de overpay.
--
-- INVARIANTES PRESERVADOS (cuerpo byte-idéntico salvo el SUM — verificado
--   programáticamente): firma (uuid, text, uuid, jsonb, uuid, timestamptz,
--   text); SECURITY DEFINER + search_path; lock FOR UPDATE por documento;
--   gates de estado (service/receipt); aritmética de componentes CP-FIN-004
--   (normalización zelle, riel divisa external_transfer, tasas fail-closed);
--   fast path de replay; inserción por componente vía el motor single (que
--   re-valida overpay con neteo); ACL service_role exclusiva.
--
-- CONTABILIDAD: NO se edita ningún pago histórico ni contra-fila (el neteo
--   es un cambio de LECTURA en el pre-check). Sin backfill.
-- ============================================================================

-- ─── UP ─────────────────────────────────────────────────────────────────────
BEGIN;

-- Guard fail-closed: el batch vigente existe con la firma certificada
DO $r26_guard$
DECLARE
  v_found boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'register_supplier_payment_batch'
      AND pg_get_function_identity_arguments(p.oid) =
          'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_payments jsonb, p_paid_by uuid, p_payment_date timestamp with time zone, p_idempotency_key text'
  ) INTO v_found;
  IF NOT v_found THEN
    RAISE EXCEPTION 'R26-GUARD: register_supplier_payment_batch(uuid,text,uuid,jsonb,uuid,timestamptz,text) no existe — abortando (estado inesperado)';
  END IF;
END;
$r26_guard$;

CREATE OR REPLACE FUNCTION public.register_supplier_payment_batch(
  p_store_id uuid,
  p_ref_type text,
  p_ref_id uuid,
  p_payments jsonb,
  p_paid_by uuid,
  p_payment_date timestamptz DEFAULT NULL::timestamptz,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_comp jsonb;
  v_comp_count integer;
  v_idx integer := 0;
  v_method text;
  v_currency text;
  v_amount numeric;
  v_rate numeric;
  v_amount_cup numeric;
  v_amount_in_doc numeric;
  v_sum_in_doc numeric := 0;
  v_doc_store_id uuid;
  v_doc_total numeric;
  v_doc_currency text;
  v_doc_rate numeric;
  v_doc_status text;
  v_paid numeric;
  v_balance numeric;
  v_payment_id uuid;
  v_block_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_ids jsonb := '[]'::jsonb;
  v_replay_complete boolean := true;
  v_eff_payment_date timestamptz := COALESCE(p_payment_date, now());
  v_store_rate numeric;
BEGIN
  -- ── ADN-009 (F2/§4): BLOQUEO COMPARTIDO del documento PRIMERO. Dos
  --    gestores que liquidan el mismo servicio simultáneamente quedan
  --    serializados: el segundo lee el saldo ya actualizado y su pre-check de
  --    overpay ve los pagos confirmados del primero. Mismo mecanismo que el
  --    camino individual (register_supplier_payment FOR UPDATE).
  IF p_ref_type = 'receipt' THEN
    -- CP-LOG-UNIFICATION-001 (§3): el estado de la recepción entra al lock.
    SELECT store_id, total_cost, 'CUP', 1, status
      INTO v_doc_store_id, v_doc_total, v_doc_currency, v_doc_rate, v_doc_status
    FROM public.receipts WHERE id = p_ref_id FOR UPDATE;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id, total_amount, currency, COALESCE(exchange_rate, 1), status
      INTO v_doc_store_id, v_doc_total, v_doc_currency, v_doc_rate, v_doc_status
    FROM public.received_services WHERE id = p_ref_id FOR UPDATE;
  ELSIF p_ref_type IN ('production_order', 'work') THEN
    SELECT store_id, budget_total, 'CUP', 1
      INTO v_doc_store_id, v_doc_total, v_doc_currency, v_doc_rate
    FROM public.production_orders WHERE id = p_ref_id;
  ELSE
    RAISE EXCEPTION 'ref_type no soportado: %', p_ref_type;
  END IF;

  IF v_doc_store_id IS NULL THEN
    RAISE EXCEPTION 'Documento no encontrado (ref_type=%, ref_id=%)', p_ref_type, p_ref_id;
  END IF;
  IF v_doc_store_id != p_store_id THEN
    RAISE EXCEPTION 'El documento no pertenece a la tienda especificada';
  END IF;

  -- ADN-009 (F12/§4): estado tras el lock (solo servicios ACTIVOS).
  IF p_ref_type = 'service' AND COALESCE(v_doc_status, 'active') <> 'active' THEN
    RAISE EXCEPTION
      'ERR_SERVICE_NOT_ACTIVE: solo un servicio ACTIVO admite pagos (estado actual: %)',
      v_doc_status;
  END IF;

  -- CP-LOG-UNIFICATION-001 (§3): gate análogo para recepciones — una
  -- recepción ANULADA o REVERTIDA no admite pagos nuevos (la reversión ya
  -- revirtió sus pagos; liquidar un documento muerto rompe la trazabilidad).
  -- Pending/confirmed/active/partial siguen admitidos (comportamiento
  -- histórico intacto).
  IF p_ref_type = 'receipt' AND COALESCE(v_doc_status, 'active') IN ('voided', 'reversed') THEN
    RAISE EXCEPTION
      'ERR_RECEIPT_NOT_PAYABLE: la recepción está % y no admite pagos nuevos',
      v_doc_status;
  END IF;

  PERFORM public.validate_operation_date(v_eff_payment_date, p_store_id);

  v_comp_count := jsonb_array_length(COALESCE(p_payments, '[]'::jsonb));
  IF v_comp_count < 1 OR v_comp_count > 20 THEN
    RAISE EXCEPTION 'ERR_BATCH_SIZE: el lote debe tener entre 1 y 20 componentes (recibidos: %)', v_comp_count;
  END IF;

  -- ── Pre-validación de TODOS los componentes (misma aritmética del motor;
  --    ADN-009 F1/§3: contrato canónico CP-FIN-004) ──
  FOR v_idx IN 0 .. v_comp_count - 1 LOOP
    v_comp := p_payments -> v_idx;
    v_method := btrim(COALESCE(v_comp->>'payment_method', ''));
    v_currency := btrim(COALESCE(v_comp->>'currency', 'CUP'));
    v_amount := NULLIF(v_comp->>'amount', '')::numeric;
    v_rate := COALESCE(NULLIF(v_comp->>'exchange_rate', '')::numeric, 0);

    -- CP-FIN-004 (M2): el heredado 'zelle' se NORMALIZA al canónico. JAMÁS se
    -- persiste 'zelle' como valor nuevo de medio de pago (compatibilidad de
    -- lectura de registros históricos intacta).
    IF lower(v_method) = 'zelle' THEN v_method := 'external_transfer'; END IF;
    IF v_method NOT IN ('cash', 'transfer', 'external_transfer') THEN
      RAISE EXCEPTION 'ERR_COMPONENT_INVALID: medio de pago no soportado (%) en componente %', v_method, v_idx + 1;
    END IF;
    IF v_currency NOT IN ('CUP', 'USD', 'EUR', 'MLC') THEN
      RAISE EXCEPTION 'ERR_COMPONENT_INVALID: moneda no soportada (%) en componente %', v_currency, v_idx + 1;
    END IF;
    -- ADN-009 (F11/§3): restricción de moneda de Transferencia Exterior —
    -- riel de divisa (USD/EUR), espejo POS + mapping activo. Rechazo temprano
    -- y accionable (el resolver fail-closed queda como backstop).
    IF v_method = 'external_transfer' AND v_currency NOT IN ('USD', 'EUR') THEN
      RAISE EXCEPTION 'ERR_COMPONENT_INVALID: Transf. Exterior (external_transfer) es un riel de divisa (USD/EUR); combinación con % no soportada en componente %', v_currency, v_idx + 1;
    END IF;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'ERR_COMPONENT_INVALID: importe debe ser > 0 en componente %', v_idx + 1;
    END IF;

    -- Tasa efectiva (misma lógica fail-closed de register_supplier_payment).
    IF v_currency = 'CUP' THEN
      v_rate := 1;
    ELSE
      IF COALESCE(v_rate, 0) <= 1 THEN
        SELECT rate INTO v_store_rate
        FROM public.store_exchange_rates
        WHERE store_id = p_store_id AND currency = v_currency
        ORDER BY updated_at DESC LIMIT 1;
        IF COALESCE(v_store_rate, 0) > 1 THEN
          v_rate := v_store_rate;
        ELSE
          RAISE EXCEPTION 'ERR_TASA_NO_DISPONIBLE: el componente % en % requiere tasa de conversión (> 1).', v_idx + 1, v_currency;
        END IF;
      END IF;
    END IF;

    v_amount_cup := CASE WHEN v_currency = 'CUP' THEN v_amount ELSE round(v_amount * v_rate, 2) END;
    v_amount_in_doc := CASE
      WHEN v_currency = v_doc_currency THEN v_amount
      ELSE v_amount_cup / v_doc_rate
    END;
    v_sum_in_doc := v_sum_in_doc + v_amount_in_doc;
  END LOOP;

  -- ── Saldo pendiente en la moneda del documento (DESPUÉS del lock) ──
  -- [R-26 20261127 / F011-002] NETEO de contra-filas: direction='reversal'
  -- RESTA, con la MISMA semántica contable del motor single
  -- (register_supplier_payment, 20261126140000 §2) y del trigger
  -- update_payment_status. Sin neteo, toda obligación con un pago revertido
  -- quedaba con saldo pendiente NEGATIVO y el lote legítimo posterior era
  -- rechazado con ERR_BATCH_OVERPAY (bloqueo de pagos legítimos; la verdad
  -- contable en BD permanecía correcta — el defecto era del pre-check).
  -- Invariante CP-BRA-001: NO hay dos fórmulas para el mismo concepto de
  -- saldo pendiente; el histórico jamás se edita (el neteo opera en lectura).
  SELECT COALESCE(SUM(
         CASE WHEN COALESCE(pt.direction, 'in') = 'reversal' THEN
                -CASE WHEN pt.currency = v_doc_currency THEN pt.amount
                      ELSE pt.amount_cup / v_doc_rate END
              ELSE
                CASE WHEN pt.currency = v_doc_currency THEN pt.amount
                     ELSE pt.amount_cup / v_doc_rate END
         END), 0) INTO v_paid
  FROM public.payment_transactions pt
  WHERE pt.ref_type = p_ref_type AND pt.ref_id = p_ref_id;

  v_balance := v_doc_total - v_paid;

  -- Fast path de replay: si TODOS los componentes del bloque ya existen,
  -- devolver sus ids sin escribir nada (reintento idempotente). DEBE preceder
  -- al pre-check de overpay: un lote ya aplicado deja saldo 0 y el reenvío
  -- idéntico no es un overpay — es un replay (lección E2E ADN-008/P1).
  IF v_block_key IS NOT NULL THEN
    FOR v_idx IN 0 .. v_comp_count - 1 LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.payment_transactions
        WHERE idempotency_key = v_block_key || ':' || v_idx
      ) THEN
        v_replay_complete := false;
        EXIT;
      END IF;
    END LOOP;
    IF v_replay_complete THEN
      FOR v_idx IN 0 .. v_comp_count - 1 LOOP
        SELECT id INTO v_payment_id
        FROM public.payment_transactions
        WHERE idempotency_key = v_block_key || ':' || v_idx
        LIMIT 1;
        v_ids := v_ids || jsonb_build_object(
          'id', v_payment_id, 'index', v_idx,
          'payment_method', p_payments -> v_idx ->> 'payment_method',
          'currency', COALESCE(p_payments -> v_idx ->> 'currency', 'CUP'),
          'amount', (p_payments -> v_idx ->> 'amount')::numeric,
          'replayed', true
        );
      END LOOP;
      RETURN jsonb_build_object('payments', v_ids, 'count', v_comp_count, 'replayed', true);
    END IF;
  END IF;

  -- Pre-check de overpay (SOLO tras descartar replay completo; saldo leído
  -- bajo lock).
  IF v_sum_in_doc > v_balance THEN
    RAISE EXCEPTION 'ERR_BATCH_OVERPAY: el lote (%) excede el saldo pendiente (%). Overpay no permitido.', v_sum_in_doc, v_balance;
  END IF;

  -- ── Inserción por componente (misma transacción ⇒ ATÓMICO). El motor
  --    re-valida estado/tasa/overpay por componente con la fila ya bloqueada
  --    (re-bloqueo no-op dentro de la misma transacción). ──
  FOR v_idx IN 0 .. v_comp_count - 1 LOOP
    v_comp := p_payments -> v_idx;
    v_method := btrim(COALESCE(v_comp->>'payment_method', ''));
    IF lower(v_method) = 'zelle' THEN v_method := 'external_transfer'; END IF;
    v_payment_id := public.register_supplier_payment(
      p_store_id => p_store_id,
      p_ref_type => p_ref_type,
      p_ref_id => p_ref_id,
      p_amount => (v_comp->>'amount')::numeric,
      p_payment_method => v_method,
      p_paid_by => p_paid_by,
      p_currency => COALESCE(btrim(v_comp->>'currency'), 'CUP'),
      p_exchange_rate => COALESCE(NULLIF(v_comp->>'exchange_rate', '')::numeric, 1.0),
      p_reference => v_comp->>'reference',
      p_notes => v_comp->>'notes',
      p_idempotency_key => CASE WHEN v_block_key IS NOT NULL THEN v_block_key || ':' || v_idx ELSE NULL END,
      p_payment_date => p_payment_date
    );
    v_ids := v_ids || jsonb_build_object(
      'id', v_payment_id, 'index', v_idx,
      'payment_method', v_method,
      'currency', COALESCE(v_comp->>'currency', 'CUP'),
      'amount', (v_comp->>'amount')::numeric
    );
  END LOOP;

  RETURN jsonb_build_object('payments', v_ids, 'count', v_comp_count, 'replayed', false);
END;
$function$;

-- ACL invariante (superficie certificada: service_role exclusiva desde ADN-009)
REVOKE EXECUTE ON FUNCTION public.register_supplier_payment_batch(uuid, text, uuid, jsonb, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_supplier_payment_batch(uuid, text, uuid, jsonb, uuid, timestamptz, text) TO service_role;

COMMENT ON FUNCTION public.register_supplier_payment_batch(uuid, text, uuid, jsonb, uuid, timestamptz, text) IS
  'R-26/F011-002 (20261127120000): el pre-check de saldo del lote NETEA las contra-filas direction=''reversal'' (misma semántica del motor single 20261126140000 y del trigger update_payment_status) — tras una reversión el batch vuelve a admitir los pagos restablecidos y sigue rechazando sobrepagos verdaderos. Firma/ACL/idempotencia/lock invariables. Sin edición de histórico.';

-- Verificación fail-closed (mismo patrón que 20261126170000 R-05)
DO $r26_verify$
DECLARE
  v_def text;
  v_code text;
  v_acl text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'register_supplier_payment_batch'
      AND pg_get_function_identity_arguments(p.oid) =
          'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_payments jsonb, p_paid_by uuid, p_payment_date timestamp with time zone, p_idempotency_key text';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'R26-VERIFY: la función no existe tras la reemisión';
  END IF;

  -- Cuerpo SIN comentarios para las comprobaciones (lección R-05: los
  -- comentarios documentales no cuentan como código)
  v_code := regexp_replace(v_def, '--[^\n]*', '', 'g');

  -- El neteo de contra-filas DEBE estar en el CÓDIGO del pre-check
  -- (dos comprobaciones separadas: en el cuerpo real 'INTO v_paid' y 'FROM
  -- public.payment_transactions' están en líneas distintas)
  IF v_code NOT LIKE '%CASE WHEN COALESCE(pt.direction, ''in'') = ''reversal'' THEN%'
     OR v_code NOT LIKE '%INTO v_paid%'
     OR v_code NOT LIKE '%FROM public.payment_transactions pt%' THEN
    RAISE EXCEPTION 'R26-VERIFY: el pre-check no netea contra-filas (defecto F011-002 sin cerrar)';
  END IF;

  -- El pre-check neteado compara contra el saldo con ERR_BATCH_OVERPAY intacto
  IF v_code NOT LIKE '%ERR_BATCH_OVERPAY%' THEN
    RAISE EXCEPTION 'R26-VERIFY: el rechazo de overpay del lote desapareció';
  END IF;

  -- ACL certificada: service_role exclusiva (sin authenticated ni anon)
  SELECT coalesce(array_to_string(array_agg(r.grantee || '=' || r.privilege_type), ','), '')
    INTO v_acl
    FROM information_schema.role_routine_grants r
    WHERE r.specific_schema = 'public'
      AND r.routine_name = 'register_supplier_payment_batch'
      AND r.privilege_type = 'EXECUTE';
  IF v_acl NOT LIKE '%service_role%'
     OR v_acl LIKE '%authenticated%'
     OR v_acl LIKE '%anon%' THEN
    RAISE EXCEPTION 'R26-VERIFY: ACL divergente tras la reemisión (%)', v_acl;
  END IF;

  RAISE NOTICE 'R26-VERIFY: neteo de contra-filas presente, overpay intacto, ACL service_role exclusiva (%)', v_acl;
END;
$r26_verify$;

COMMIT;

-- ─── DOWN ───────────────────────────────────────────────────────────────────
-- La reversión restaura el cuerpo previo (20261121200000) reemitiéndolo desde
-- el historial versionado. NO se automatiza en esta migración: la política de
-- reversiones del repo exige expediente explícito. El guard inicial garantiza
-- que el DOWN manual opere sobre la firma correcta.
-- ============================================================================