-- ============================================================================
-- Migration: 20261127140000_cpbra_r03_ot_payment_batch.sql
-- Misión:    CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 — FASE 1 (R-03)
-- Fecha:     2026-11-27
-- ============================================================================
-- DECISIÓN DEL PROPIETARIO (misión §0.1): los pagos múltiples de órdenes de
--   trabajo son una OPERACIÓN PARCIAL. Regla fundamental: INDEPENDENCIA entre
--   órdenes, ATOMICIDAD dentro de cada orden. No se autoriza una transacción
--   global que convierta el lote completo en una operación indivisible.
--
-- ESTADO PREVIO (auditoría §3.1 de la misión):
--   1) Los caminos de pago OT (production_order|work) son todos
--      single-documento: /api/payments (con payments[] multi-componente) y
--      /api/production-orders/[id]/payments (fila única por request). NO
--      existe operación multi-OT.
--   2) El lote atómico certificado register_supplier_payment_batch SOLO
--      acepta receipt|service (ERR_ITEM_INVALID para OT).
--   3) DEFECTO FIN-013 residual: en /api/payments el loop multi-componente de
--      UNA OT inserta componente a componente en transacciones separadas →
--      si el componente i falla, los componentes 0..i-1 permanecen
--      confirmados (pago PARCIAL dentro de una OT) — viola la atomicidad
--      por orden que exige la decisión.
--   4) Las vías multi-documento de CxP (/api/payments/multi atómica,
--      /api/accounts-payable/bulk-pay parcial) excluyen OT.
--
-- SOLUCIÓN (dos capas, sin tocar el motor single ni el batch CxP certificado):
--   A) register_ot_payment_batch — lote ATÓMICO POR ORDEN para OT: una sola
--      transacción confirma TODOS los componentes de UNA OT o ninguno.
--      Espejo estructural del batch receipt|service certificado (patrón
--      ADN-009/R-26): lock FOR UPDATE de la OT primero, gate de estado
--      (ERR_ORDER_NOT_PAYABLE), aritmética CP-FIN-004 de componentes,
--      pre-check de saldo con el MISMO CASE de neteo de contra-filas del
--      motor single (invariante CP-BRA-001: una sola fórmula de saldo
--      pendiente), fast-path de replay idempotente por bloque '<key>:<i>'
--      ANTES del pre-check (lección E2E ADN-008/P1), inserción por
--      componente vía el motor single register_supplier_payment (que
--      re-valida todo bajo el mismo lock).
--   B) La operación MULTI-OT parcial vive en la ruta API
--      /api/payments/ot-batch (convención bulk-pay: resultados por ítem,
--      transacciones independientes por OT — un fallo NO revierte las demás).
--      Esta migración solo crea el motor transaccional por orden.
--
-- INVARIANTES PRESERVADOS:
--   - No se modifica register_supplier_payment (motor single certificado
--     R-01/R-25), register_supplier_payment_batch (R-26) ni el trigger
--     update_payment_status. Reglas generales de pago de una OT intactas.
--   - ACL de la nueva función: service_role EXCLUSIVA (mismo estándar que
--     register_supplier_payment_batch — la autorización ocurre en la ruta
--     server-side tras canManageStore; el actor real viaja en p_paid_by).
--   - Histórico JAMÁS editado: la migración NO contiene UPDATE/DELETE sobre
--     payment_transactions ni fin_*; sin backfill.
-- ============================================================================

-- ─── UP ─────────────────────────────────────────────────────────────────────
BEGIN;

-- Guard fail-closed: el motor single certificado debe existir con la firma
-- vigente (20261126140000) — el lote OT reusa ese motor por componente.
DO $r03_guard$
DECLARE
  v_found boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'register_supplier_payment'
      AND pg_get_function_identity_arguments(p.oid) =
          'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid, p_currency text, p_exchange_rate numeric, p_reference text, p_notes text, p_idempotency_key text, p_payment_date timestamp with time zone'
  ) INTO v_found;
  IF NOT v_found THEN
    RAISE EXCEPTION 'R03-GUARD: register_supplier_payment (firma certificada 20261126140000) no existe — abortando (estado inesperado)';
  END IF;
END;
$r03_guard$;

CREATE OR REPLACE FUNCTION public.register_ot_payment_batch(
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
  v_ids jsonb := '[]'::jsonb;
  v_replay_complete boolean := true;
  v_block_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_eff_payment_date timestamptz := COALESCE(p_payment_date, now());
BEGIN
  -- Este motor es EXCLUSIVO de órdenes de trabajo (production_order|work).
  -- El lote atómico de receipt|service permanece en
  -- register_supplier_payment_batch (superficie certificada, sin cambios).
  IF p_ref_type NOT IN ('production_order', 'work') THEN
    RAISE EXCEPTION 'ERR_REF_TYPE_INVALID: register_ot_payment_batch solo admite production_order|work (recibido: %)', p_ref_type;
  END IF;

  -- ADN-009 (F2/§4) + R-01: BLOQUEO de la OT SIEMPRE primero (misma lectura
  -- del documento que el motor single: OT se trata como CUP/tasa 1 — contrato
  -- vigente del motor; alinearlo a budget_currency es decisión posterior).
  SELECT store_id, budget_total, 'CUP', 1, status
    INTO v_doc_store_id, v_doc_total, v_doc_currency, v_doc_rate, v_doc_status
  FROM public.production_orders WHERE id = p_ref_id FOR UPDATE;

  IF v_doc_store_id IS NULL THEN
    RAISE EXCEPTION 'Documento no encontrado (ref_type=%, ref_id=%)', p_ref_type, p_ref_id;
  END IF;

  IF v_doc_store_id != p_store_id THEN
    RAISE EXCEPTION 'El documento no pertenece a la tienda especificada';
  END IF;

  -- R-01 (20261126140000): gate de estado — una OT anulada no admite pagos
  -- nuevos (fail-closed). Draft sigue permitido (anticipos).
  IF COALESCE(v_doc_status, 'draft') = 'voided' THEN
    RAISE EXCEPTION
      'ERR_ORDER_NOT_PAYABLE: la orden de trabajo está voided y no admite pagos nuevos (estado actual: %)',
      v_doc_status;
  END IF;

  PERFORM public.validate_operation_date(v_eff_payment_date, p_store_id);

  v_comp_count := jsonb_array_length(COALESCE(p_payments, '[]'::jsonb));
  IF v_comp_count < 1 OR v_comp_count > 20 THEN
    RAISE EXCEPTION 'ERR_BATCH_SIZE: el lote debe tener entre 1 y 20 componentes (recibidos: %)', v_comp_count;
  END IF;

  -- ── Pre-validación de TODOS los componentes (aritmética canónica
  --    CP-FIN-004, idéntica al batch receipt|service certificado) ──
  FOR v_idx IN 0 .. v_comp_count - 1 LOOP
    v_comp := p_payments -> v_idx;
    v_method := btrim(COALESCE(v_comp->>'payment_method', ''));
    v_currency := btrim(COALESCE(v_comp->>'currency', 'CUP'));
    v_amount := NULLIF(v_comp->>'amount', '')::numeric;
    v_rate := COALESCE(NULLIF(v_comp->>'exchange_rate', '')::numeric, 0);

    -- CP-FIN-004 (M2): el heredado 'zelle' se NORMALIZA al canónico.
    IF lower(v_method) = 'zelle' THEN v_method := 'external_transfer'; END IF;
    IF v_method NOT IN ('cash', 'transfer', 'external_transfer') THEN
      RAISE EXCEPTION 'ERR_COMPONENT_INVALID: medio de pago no soportado (%) en componente %', v_method, v_idx + 1;
    END IF;
    IF v_currency NOT IN ('CUP', 'USD', 'EUR', 'MLC') THEN
      RAISE EXCEPTION 'ERR_COMPONENT_INVALID: moneda no soportada (%) en componente %', v_currency, v_idx + 1;
    END IF;
    IF v_method = 'external_transfer' AND v_currency NOT IN ('USD', 'EUR') THEN
      RAISE EXCEPTION 'ERR_COMPONENT_INVALID: Transf. Exterior (external_transfer) es un riel de divisa (USD/EUR); combinación con % no soportada en componente %', v_currency, v_idx + 1;
    END IF;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'ERR_COMPONENT_INVALID: importe debe ser > 0 en componente %', v_idx + 1;
    END IF;

    -- Tasa efectiva (misma lógica fail-closed del motor single).
    IF v_currency = 'CUP' THEN
      v_rate := 1;
    ELSE
      IF COALESCE(v_rate, 0) <= 1 THEN
        SELECT rate INTO v_rate
        FROM public.store_exchange_rates
        WHERE store_id = p_store_id AND currency = v_currency
        ORDER BY updated_at DESC LIMIT 1;
        IF COALESCE(v_rate, 0) <= 1 THEN
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
  -- NETEO de contra-filas: MISMA semántica contable del motor single
  -- (register_supplier_payment, 20261126140000 §2), del trigger
  -- update_payment_status y del batch receipt|service (R-26,
  -- 20261127120000). Invariante CP-BRA-001: NO hay dos fórmulas para el
  -- mismo concepto de saldo pendiente; el histórico jamás se edita.
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
  -- bajo lock y NETEADO).
  IF v_sum_in_doc > v_balance THEN
    RAISE EXCEPTION 'ERR_BATCH_OVERPAY: el lote (%) excede el saldo pendiente (%). Overpay no permitido.', v_sum_in_doc, v_balance;
  END IF;

  -- ── Inserción por componente (misma transacción ⇒ ATÓMICO POR ORDEN).
  --    El motor single re-valida estado/tasa/overpay por componente con la
  --    fila ya bloqueada (re-bloqueo no-op dentro de la misma transacción).
  --    CUALQUIER fallo de componente → RAISE → la transacción completa de
  --    esta OT revierte: sin pagos parciales dentro de una orden. ──
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

-- ACL invariante (mismo estándar que register_supplier_payment_batch:
-- service_role exclusiva — ADN-009 / CP-FIN-004).
REVOKE EXECUTE ON FUNCTION public.register_ot_payment_batch(uuid, text, uuid, jsonb, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_ot_payment_batch(uuid, text, uuid, jsonb, uuid, timestamptz, text) TO service_role;

COMMENT ON FUNCTION public.register_ot_payment_batch(uuid, text, uuid, jsonb, uuid, timestamptz, text) IS
  'R-03 (20261127140000, CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 §0.1): lote ATÓMICO POR ORDEN para pagos de OT (production_order|work) — todos los componentes de UNA orden se confirman en una sola transacción o ninguno. Espejo estructural del batch receipt|service: lock FOR UPDATE primero, gate ERR_ORDER_NOT_PAYABLE, aritmética CP-FIN-004, pre-check neteado (mismo CASE de contra-filas del motor single), fast-path de replay por bloque, inserción vía register_supplier_payment. La operación MULTI-OT PARCIAL (independencia entre órdenes) vive en la ruta /api/payments/ot-batch (una transacción independiente por orden). ACL service_role exclusiva; actor real en p_paid_by; histórico jamás editado.';

-- Verificación fail-closed (mismo patrón que R-05/R-26)
DO $r03_verify$
DECLARE
  v_def text;
  v_code text;
  v_acl text;
  v_idx_replay integer;
  v_idx_overpay integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'register_ot_payment_batch'
      AND pg_get_function_identity_arguments(p.oid) =
          'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_payments jsonb, p_paid_by uuid, p_payment_date timestamp with time zone, p_idempotency_key text';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'R03-VERIFY: register_ot_payment_batch no existe tras la emisión';
  END IF;

  -- Cuerpo SIN comentarios para las comprobaciones (patrón R-05/R-26)
  v_code := regexp_replace(v_def, '--[^\n]*', '', 'g');

  -- Exclusividad de OT en el CÓDIGO (el batch CxP permanece separado)
  IF v_code NOT LIKE '%ERR_REF_TYPE_INVALID%' THEN
    RAISE EXCEPTION 'R03-VERIFY: falta el gate de ref_type exclusivo de OT';
  END IF;

  -- Lock del documento y gate de estado
  IF v_code NOT LIKE '%FROM public.production_orders WHERE id = p_ref_id FOR UPDATE%' THEN
    RAISE EXCEPTION 'R03-VERIFY: falta el lock FOR UPDATE de la OT';
  END IF;
  IF v_code NOT LIKE '%ERR_ORDER_NOT_PAYABLE%' THEN
    RAISE EXCEPTION 'R03-VERIFY: falta el gate de estado de la OT';
  END IF;

  -- El pre-check NETEA contra-filas (misma fórmula del motor single)
  IF v_code NOT LIKE '%CASE WHEN COALESCE(pt.direction, ''in'') = ''reversal'' THEN%'
     OR v_code NOT LIKE '%INTO v_paid%'
     OR v_code NOT LIKE '%FROM public.payment_transactions pt%' THEN
    RAISE EXCEPTION 'R03-VERIFY: el pre-check no netea contra-filas (una sola fórmula de saldo exigida)';
  END IF;

  -- El fast path de replay DEBE preceder al pre-check de overpay
  v_idx_replay := position('v_replay_complete THEN' in v_code);
  v_idx_overpay := position('ERR_BATCH_OVERPAY' in v_code);
  IF v_idx_replay <= 0 OR v_idx_overpay <= v_idx_replay THEN
    RAISE EXCEPTION 'R03-VERIFY: el fast-path de replay no precede al pre-check de overpay';
  END IF;

  -- La inserción pasa por el motor single (sin rutas de escritura paralelas)
  IF v_code NOT LIKE '%public.register_supplier_payment(%' THEN
    RAISE EXCEPTION 'R03-VERIFY: los componentes no pasan por el motor single certificado';
  END IF;

  -- ACL certificada: service_role exclusiva (sin authenticated ni anon)
  SELECT coalesce(array_to_string(array_agg(r.grantee || '=' || r.privilege_type), ','), '')
    INTO v_acl
    FROM information_schema.role_routine_grants r
    WHERE r.specific_schema = 'public'
      AND r.routine_name = 'register_ot_payment_batch'
      AND r.privilege_type = 'EXECUTE';
  IF v_acl NOT LIKE '%service_role%'
     OR v_acl LIKE '%authenticated%'
     OR v_acl LIKE '%anon%' THEN
    RAISE EXCEPTION 'R03-VERIFY: ACL divergente tras la emisión (%)', v_acl;
  END IF;

  RAISE NOTICE 'R03-VERIFY: lote OT atómico emitido — gate OT exclusivo, lock, estado, neteo, replay-before-overpay, motor single, ACL service_role exclusiva (%)', v_acl;
END;
$r03_verify$;

COMMIT;

-- ─── DOWN ───────────────────────────────────────────────────────────────────
-- La reversión elimina la función R-03 (no existía antes de esta migración).
-- NO se automatiza en esta migración: la política de reversiones del repo
-- exige expediente explícito. El guard inicial garantiza el estado esperado.
-- ============================================================================
