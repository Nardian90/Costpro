-- ============================================================================
-- 20261121190000 — ADN-SERVICES-RECEIVED-POSTMERGE-HARDENING-009
-- Endurecimiento post-merge: contrato canónico external_transfer, serialización
-- de liquidaciones concurrentes, control de acceso en RPC de borradores/pagos,
-- identidad de proveedor desde fuente autorizada e idempotencia real.
-- ============================================================================
-- MISIÓN: ADN-SERVICES-RECEIVED-POSTMERGE-HARDENING-009 (correctiva sobre la
--   implementación fusionada de ADN-008, PR #1670). NO rediseña interfaz ni
--   altera movimientos financieros históricos. NO toca la migración
--   20261121120000 (ya aplicada): es una migración NUEVA, versionada y
--   compatible (CREATE OR REPLACE / DROP IF EXISTS / IF NOT EXISTS).
--
-- Defectos que cierra (diagnóstico m009, verificado sobre el estado LIVE):
--   F1 (§3)  register_supplier_payment_batch valida la lista heredada
--            ('cash','transfer','zelle') y RECHAZA el canónico
--            'external_transfer' del contrato CP-FIN-004 → toda liquidación
--            con Transf. Exterior falla. Fix: contrato canónico en el batch
--            (misma semántica del motor individual M2: 'zelle' heredado se
--            NORMALIZA a 'external_transfer' y JAMÁS se persiste como valor
--            nuevo), + pre-check medio×moneda (Transf. Exterior = riel divisa
--            USD/EUR, espejo POS y fin_account_mapping activo).
--   F2 (§4)  Ni el batch ni el motor individual serializan: el saldo se lee
--            sin bloqueo y dos liquidaciones concurrentes pueden sobrepagar.
--            Fix: SELECT ... FOR UPDATE de la fila del documento en AMBOS
--            caminos, adquirido ANTES de leer el saldo/comprobar idempotencia;
--            estado y saldo comprobados DESPUÉS del lock; orden de adquisición
--            documentado (una sola fila de documento por transacción; el
--            camino de pagos NO toma advisory locks → sin ciclos).
--   F3 (§5)  ACL: el batch concedía EXECUTE a authenticated sin verificación
--            de identidad en el cuerpo (escalada sobre el canal service_role
--            del motor); los RPC de borradores gateaban con has_store_access_as
--            (cualquier miembro activo: clerk/warehouse/usuario/costo) en lugar
--            del nivel de GESTIÓN. Fix: draft RPCs conservan authenticated con
--            gate de gestión DENTRO del cuerpo (helper nuevo
--            can_manage_store_as, espejo DB de canManageStore — patrón
--            can_manage_payroll_as; identidad: authenticated → auth.uid(),
--            parámetro de actor IGNORADO); batch → service_role EXCLUSIVO
--            (alineado a CP-FIN-004; /api/payments autoriza con canManageStore
--            y llama por el cliente privilegiado).
--   F4 (§6)  La identidad del proveedor (local/maestro) se enriquecía desde
--            metadatos del cliente sin validar ownership. Fix: snapshot desde
--            la FUENTE AUTORIZADA (suppliers/master_parties) dentro de los RPC;
--            coherencia local↔maestro validada; compatibilidad con proveedores
--            históricos sin identidad intacta.
--   F5 (§7)  create_received_service_draft consultaba creation_key ANTES de
--            adquirir el advisory lock (carrera) y no había restricción única.
--            Fix: lock PRIMERO, re-consulta DESPUÉS, índice único parcial en
--            audit_logs como defensa, y EXCEPTION unique_violation que revierte
--            la creación completa y devuelve el borrador del ganador.
--   F7 (§9)  update_received_service_draft con COALESCE no distinguía campo
--            omitido / limpieza explícita / restablecimiento. Fix: nueva firma
--            patch-based (p_patch jsonb) con tri-state por clave presente
--            (DROP de la firma anterior → sin overloads ambiguos de PostgREST);
--            fecha NULL = restablecer al día operativo actual; limpieza de
--            identidad deja nombre/IDs/snapshot coherentes.
--   F11/F12  Pre-check temprano de combinación incompatible (en vez del error
--            tardío del resolver) y pago sobre servicio no-ACTIVO rechazado
--            (solo ref_type='service'; receipts/OT fuera del alcance).
--
-- Invariantes financieros: NINGÚN movimiento histórico se toca; el motor sigue
--   generando UN asiento 'pago' por componente vía fin_trg_payment_transactions
--   con cuenta canónica fin_resolve_financial_account(medio,moneda); las
--   restricciones de moneda de Transferencia Exterior se conservan (USD/EUR);
--   el replay de lotes converge (idempotencia de bloque + índice único
--   uniq_payment_txn_idempotency).
-- Idempotente: re-aplicable sin daño (IF NOT EXISTS / DROP IF EXISTS /
--   CREATE OR REPLACE verbatim).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) RECONCILIACIÓN de una deriva PRE-existente descubierta por esta misión:
--    `suppliers.master_party_id` existe en producción (aplicada fuera de banda
--    por la misión del Clasificador Maestro, sin migración en el stream —
--    verificada live 2026-11-21: uuid NULL-able + FK
--    suppliers_master_party_id_fkey → master_parties(id)) pero AUSENTE del
--    stream de migraciones: el replay no podía reproducir el live. Se
--    incorpora VERBATIM (IF NOT EXISTS + IF NOT EXISTS FK → idempotente;
--    en producción ambas sentencias son no-ops). El ownership/coherencia de
--    identidad (F4/§6) la consume; sin ella el replay rompe.
-- ---------------------------------------------------------------------------
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS master_party_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.suppliers'::regclass
                   AND conname = 'suppliers_master_party_id_fkey') THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_master_party_id_fkey
      FOREIGN KEY (master_party_id) REFERENCES public.master_parties(id);
  END IF;
END $$;

COMMENT ON COLUMN public.suppliers.master_party_id IS
  'Clasificador Maestro: tercero del tenant al que está ligado el proveedor local (reconciliación ADN-009 — columna live de producción incorporada al stream; FK a master_parties).';

-- ---------------------------------------------------------------------------
-- 1) Helper canónico de GESTIÓN por tienda — espejo DB exacto de
--    canManageStore (src/lib/roles.ts): admin/superadmin de plataforma
--    transversal (is_admin_check — misma fuente que is_admin()/RLS) O
--    membresía ACTIVA con rol admin/manager/encargado EN ESA TIENDA.
--    Patrón: can_manage_payroll_as (20261114180000). Solo service_role para
--    invocación directa; los RPC SECURITY DEFINER la llaman internamente.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_store_as(p_user_id uuid, p_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;
  -- Nivel administrativo de plataforma (admin|superadmin) delegado al check
  -- central is_admin_check — la misma fuente confiable de is_admin()/RLS
  -- (20261027120000 has_store_access_as_superadmin_policy).
  IF public.is_admin_check(p_user_id) THEN RETURN true; END IF;
  -- Membresía operativa de GESTIÓN en la tienda específica (canManageStore):
  -- clerk/warehouse/usuario/costo NO gestionan.
  RETURN EXISTS (
    SELECT 1 FROM public.user_store_memberships m
    WHERE m.user_id = p_user_id
      AND m.store_id = p_store_id
      AND m.status = 'active'
      AND m.role IN ('admin', 'manager', 'encargado')
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.can_manage_store_as(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_store_as(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.can_manage_store_as(uuid, uuid) IS
  'ADN-009: true si el actor puede GESTIONAR la tienda (espejo DB de canManageStore: admin/superadmin de plataforma transversal vía is_admin_check, o membresía activa admin/manager/encargado en la tienda). Gate de gestión dentro de los RPC de borradores (§5 Alternativa B).';

-- ---------------------------------------------------------------------------
-- 2) register_supplier_payment — motor canónico con serialización compartida.
--    Misma firma /12 (cero riesgo de overloads). Cambios ADN-009:
--      a) FOR UPDATE de la fila del documento ANTES de idempotencia/saldo.
--      b) Estado del servicio comprobado tras el lock (solo 'active' admite
--         pagos; receipts/production_orders SIN cambio de semántica).
--      c) Pre-check medio×moneda: Transf. Exterior es riel divisa (USD/EUR) —
--         espejo create_sale_v2 (CP-FIN-004 M2) y fin_account_mapping activo.
--    El contrato CP-FIN-004 vigente se conserva íntegro: normalización del
--    heredado 'zelle' → 'external_transfer' (jamás se persiste zelle),
--    whitelist cash|transfer|external_transfer, tasa fail-closed, overpay en
--    la moneda del documento, asiento 'pago' vía fin_trg_payment_transactions.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_supplier_payment(p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_payment_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id uuid;
  v_existing_id uuid;
  v_total numeric;
  v_paid numeric;
  v_amount_cup numeric;
  v_balance numeric;
  v_doc_store_id uuid;
  v_doc_currency text;
  v_doc_rate numeric;
  v_doc_status text;
  v_amount_in_doc_currency numeric;
  v_eff_payment_date timestamptz := COALESCE(p_payment_date, now());
  v_rate numeric := p_exchange_rate;
  v_store_rate numeric;
BEGIN
  -- ── ADN-009 (F2/§4): BLOQUEO COMPARTIDO — la fila del documento se bloquea
  --    SIEMPRE antes de consultar saldo o idempotencia. Mismo mecanismo que
  --    register_supplier_payment_batch (que además invoca esta función dentro
  --    de su propia transacción: el re-bloqueo es un no-op). Orden de
  --    adquisición documentado: UNA sola fila de documento por transacción
  --    (receipts | received_services | production_orders); el camino de pagos
  --    NO toma advisory locks → sin ciclos advisory↔row ni deadlocks entre
  --    caminos. Las liquidaciones concurrentes del mismo documento quedan
  --    SERIALIZADAS: la segunda lee el saldo ya actualizado.
  IF p_ref_type = 'receipt' THEN
    SELECT store_id, total_cost, 'CUP', 1
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate
    FROM public.receipts WHERE id = p_ref_id FOR UPDATE;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id, total_amount, currency, COALESCE(exchange_rate, 1), status
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate, v_doc_status
    FROM public.received_services WHERE id = p_ref_id FOR UPDATE;
  ELSIF p_ref_type IN ('production_order', 'work') THEN
    SELECT store_id, budget_total, 'CUP', 1
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate
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

  -- Idempotencia (DESPUÉS del lock: dos envíos con la misma clave quedan
  -- serializados y el segundo encuentra el pago del primero).
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.payment_transactions
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- CP-FIN-003: monedas y medios del catálogo canónico solamente.
  IF p_currency NOT IN ('CUP', 'USD', 'EUR', 'MLC') THEN
    RAISE EXCEPTION 'Moneda de pago no soportada: %', p_currency;
  END IF;
  -- CP-FIN-004: normalización del heredado 'zelle' al canónico
  IF lower(btrim(COALESCE(p_payment_method, ''))) = 'zelle' THEN p_payment_method := 'external_transfer'; END IF;
  IF p_payment_method NOT IN ('cash', 'transfer', 'external_transfer') THEN
    RAISE EXCEPTION 'Medio de pago no soportado: %', p_payment_method;
  END IF;

  -- ADN-009 (F11/§3): restricción de moneda de Transferencia Exterior, en
  -- espejo del POS (create_sale_v2: riel de divisa) y de fin_account_mapping
  -- (filas activas USD/EUR → ACT_TRANSF_EXTERIOR; CUP/MLC inactivas). Rechazo
  -- TEMPRANO y accionable; fin_resolve_financial_account queda como backstop.
  IF p_payment_method = 'external_transfer' AND p_currency NOT IN ('USD', 'EUR') THEN
    RAISE EXCEPTION
      'ERR_COMBINACION_NO_SOPORTADA: Transf. Exterior (external_transfer) es un riel de divisa (USD/EUR); combinación con % no soportada',
      p_currency;
  END IF;

  -- ADN-009 (F12/§4): estado comprobado DESPUÉS de adquirir el bloqueo. Solo
  -- un servicio ACTIVO admite pagos (un borrador no genera obligación; un
  -- anulado no admite liquidación). receipts/production_orders: fuera del
  -- alcance de la misión — sin cambio de semántica.
  IF p_ref_type = 'service' AND COALESCE(v_doc_status, 'active') <> 'active' THEN
    RAISE EXCEPTION
      'ERR_SERVICE_NOT_ACTIVE: solo un servicio ACTIVO admite pagos (estado actual: %)',
      v_doc_status;
  END IF;

  PERFORM public.validate_operation_date(v_eff_payment_date, p_store_id);

  -- CP-FIN-003 (anexo §2): tasa de conversión REAL para moneda ≠ CUP.
  -- El equivalente contable (amount_cup) es columna GENERATED: la tasa debe
  -- llegar correcta a la INSERT. Sin tasa del llamante → tasa manual de la
  -- tienda; sin ninguna → fail-closed (jamás tasa 1 para divisa).
  IF p_currency <> 'CUP' THEN
    IF coalesce(v_rate, 0) <= 1 THEN
      SELECT rate INTO v_store_rate
      FROM public.store_exchange_rates
      WHERE store_id = p_store_id AND currency = p_currency
      ORDER BY updated_at DESC LIMIT 1;
      IF coalesce(v_store_rate, 0) > 1 THEN
        v_rate := v_store_rate;
      ELSE
        RAISE EXCEPTION
          'ERR_TASA_NO_DISPONIBLE: el pago en % requiere tasa de conversión (> 1). Configúrela en Tasas o envíela con el pago.',
          p_currency;
      END IF;
    END IF;
  ELSE
    v_rate := 1;
  END IF;

  -- Monto en CUP (para payment_transactions.amount_cup — invariante)
  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN p_amount
    ELSE round(p_amount * v_rate, 2)
  END;

  -- R3: Validar overpay — todo en la MONEDA DEL DOCUMENTO (20261113120800).
  -- Lectura DESPUÉS del lock (ADN-009): el saldo incluye los pagos de
  -- cualquier liquidación concurrente que ya confirmó.
  SELECT COALESCE(SUM(
         CASE WHEN pt.currency = v_doc_currency THEN pt.amount
              ELSE pt.amount_cup / v_doc_rate
         END), 0) INTO v_paid
  FROM public.payment_transactions pt
  WHERE pt.ref_type = p_ref_type AND pt.ref_id = p_ref_id;

  v_amount_in_doc_currency := CASE
    WHEN p_currency = v_doc_currency THEN p_amount
    ELSE v_amount_cup / v_doc_rate
  END;

  v_balance := v_total - v_paid;
  IF v_amount_in_doc_currency > v_balance THEN
    RAISE EXCEPTION
      'El pago (%) excede el saldo pendiente (%). Overpay no permitido.',
      v_amount_in_doc_currency, v_balance;
  END IF;

  -- Insertar pago con payment_date personalizada (o now() por defecto)
  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, reference, notes, paid_by, idempotency_key,
    payment_date
  ) VALUES (
    p_store_id, p_ref_type, p_ref_id, p_amount, p_payment_method,
    p_currency, v_rate, p_reference, p_notes, p_paid_by, p_idempotency_key,
    v_eff_payment_date
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3) register_supplier_payment_batch — contrato canónico + lock compartido.
--    Misma firma /7. Cambios ADN-009:
--      a) Contrato de medios canónico CP-FIN-004: normaliza el heredado
--         'zelle' → 'external_transfer' (compat de ingesta; JAMÁS se persiste
--         'zelle' como valor nuevo) y acepta cash|transfer|external_transfer.
--      b) Pre-check de combinación medio×moneda (Transf. Exterior → USD/EUR).
--      c) FOR UPDATE del documento PRIMERO (serialización compartida con el
--         camino individual, F2/§4); saldo y estado leídos DESPUÉS del lock.
--      d) Orden de comprobaciones: lock → documento → estado → componentes →
--         saldo → replay fast-path → overpay → inserción (misma transacción).
-- ---------------------------------------------------------------------------
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
    SELECT store_id, total_cost, 'CUP', 1
      INTO v_doc_store_id, v_doc_total, v_doc_currency, v_doc_rate
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
  SELECT COALESCE(SUM(
         CASE WHEN pt.currency = v_doc_currency THEN pt.amount
              ELSE pt.amount_cup / v_doc_rate
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

-- ---------------------------------------------------------------------------
-- 4) create_received_service_draft — idempotencia real + gate de gestión +
--    snapshot de identidad desde fuente autorizada. MISMA FIRMA /19.
--    Cambios ADN-009:
--      a) (F5/§7) El advisory lock de tienda se adquiere PRIMERO; la consulta
--         de creation_key se REPITE después del lock → dos solicitudes
--         simultáneas con la misma clave devuelven EL MISMO borrador.
--      b) (F3/§5, Alternativa B) Gate de GESTIÓN dentro del RPC
--         (can_manage_store_as): admin/gestor autorizado pasa; lectura sola,
--         cajero sin gestión y otra tienda son rechazados. Identidad:
--         authenticated → auth.uid() (el parámetro p_created_by se IGNORA —
--         imposible suplantar); service_role → COALESCE(p_created_by, auth.uid()).
--      c) (F4/§6) La identidad del proveedor, si llega, se resuelve desde la
--         FUENTE AUTORIZADA (suppliers / master_parties): ownership, tenant,
--         status activo, coherencia local↔maestro y snapshot (code/tax_id/
--         phone/address) tomados de la fila de la BD — nunca de metadatos del
--         cliente. Proveedores históricos sin identidad: intactos.
--      d) Defensa adicional (§7): índice único parcial en audit_logs +
--         EXCEPTION unique_violation que revierte la creación completa y
--         devuelve el borrador del ganador.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_received_service_draft(
  p_store_id uuid,
  p_supplier text DEFAULT NULL::text,
  p_total_amount numeric DEFAULT NULL::numeric,
  p_service_type_id uuid DEFAULT NULL::uuid,
  p_service_type_name text DEFAULT 'Otro'::text,
  p_service_date date DEFAULT NULL::date,
  p_currency text DEFAULT 'CUP'::text,
  p_exchange_rate numeric DEFAULT 1.0,
  p_payment_terms_days integer DEFAULT 30,
  p_distribution_method text DEFAULT 'amount'::text,
  p_reference_doc text DEFAULT NULL::text,
  p_observations text DEFAULT NULL::text,
  p_receipt_ids jsonb DEFAULT '[]'::jsonb,
  p_production_order_ids jsonb DEFAULT '[]'::jsonb,
  p_created_by uuid DEFAULT NULL::uuid,
  p_supplier_id uuid DEFAULT NULL::uuid,
  p_supplier_master_party_id uuid DEFAULT NULL::uuid,
  p_supplier_meta jsonb DEFAULT NULL::jsonb,
  p_creation_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_service_id uuid;
  v_service_number text;
  v_receipt_id uuid;
  v_order_id uuid;
  v_count integer;
  v_allocated_per_receipt numeric;
  v_link_count integer;
  v_ot_count integer := 0;
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_created_by, auth.uid())
    ELSE auth.uid()
  END;
  v_supplier text := NULLIF(btrim(COALESCE(p_supplier, '')), '');
  v_supplier_id uuid := p_supplier_id;
  v_master_party_id uuid := p_supplier_master_party_id;
  v_mp_live uuid;           -- master_party_id VIVO del proveedor local (BD)
  v_mp_name text;           -- nombre autorizado del tercero maestro
  v_meta jsonb := COALESCE(p_supplier_meta, '{}'::jsonb);
  v_key text := NULLIF(btrim(COALESCE(p_creation_key, '')), '');
BEGIN
  -- ── (F5/§7) BLOQUEO DE IDEMPOTENCIA PRIMERO (misma granularidad por tienda
  --    que el resto del flujo) y RE-CONSULTA de la clave después del lock.
  --    Antes: la clave se consultaba ANTES de adquirir el lock y dos
  --    solicitudes simultáneas con la misma clave creaban DOS borradores.
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  IF v_key IS NOT NULL THEN
    SELECT al.record_id INTO v_service_id
    FROM audit_logs al
    WHERE al.action = 'SERVICE_DRAFT_CREATED'
      AND al.store_id = p_store_id
      AND al.table_name = 'received_services'
      AND al.metadata->>'creation_key' = v_key
    ORDER BY al.created_at DESC
    LIMIT 1;
    IF v_service_id IS NOT NULL THEN
      SELECT service_number INTO v_service_number
      FROM received_services WHERE id = v_service_id;
      RETURN jsonb_build_object(
        'status', 'success', 'service_id', v_service_id,
        'service_number', v_service_number, 'draft', true, 'duplicate', true
      );
    END IF;
  END IF;

  -- ── (F3/§5) Actor-explícito + gate de GESTIÓN (Alternativa B). El actor es
  --    auth.uid() para sesiones autenticadas (p_created_by NO es fuente de
  --    identidad — anti-spoofing); la gestión se exige en la tienda objetivo.
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.can_manage_store_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ── (F4/§6) Identidad del proveedor: ownership fail-closed + SNAPSHOT DESDE
  --    LA FUENTE AUTORIZADA. El borrador sigue permitiendo proveedor vacío
  --    (se completa antes de confirmar); pero si llega una identidad, se
  --    valida y se congela desde la BD — nunca desde metadatos manipulables.
  IF v_supplier_id IS NOT NULL THEN
    SELECT s.name, s.master_party_id,
           jsonb_build_object('tax_id', s.tax_id,
                              'phone', s.phone, 'address', s.address)
      INTO v_supplier, v_mp_live, v_meta
    FROM suppliers s
    WHERE s.id = v_supplier_id AND s.store_id = p_store_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_SUPPLIER_INVALID: % no pertenece a la tienda', v_supplier_id;
    END IF;
    -- Nombre: el del registro autorizado, salvo que el cliente envíe uno
    -- explícito (texto libre del formulario sobre el catálogo).
    v_supplier := COALESCE(NULLIF(btrim(COALESCE(p_supplier, '')), ''), v_supplier);
    -- Coherencia local↔maestro (§6): si el proveedor local está ligado a un
    -- tercero maestro, el maestro enviado (si llega) debe coincidir.
    IF v_mp_live IS NOT NULL AND v_master_party_id IS NOT NULL
       AND v_mp_live <> v_master_party_id THEN
      RAISE EXCEPTION 'ERR_SUPPLIER_IDENTITY_MISMATCH: el proveedor local % está ligado al tercero %, no a %',
        v_supplier_id, v_mp_live, v_master_party_id;
    END IF;
    -- Si el proveedor local está ligado a un maestro y no se envió maestro,
    -- la identidad maestra autorizada es la del propio registro.
    IF v_mp_live IS NOT NULL AND v_master_party_id IS NULL THEN
      v_master_party_id := v_mp_live;
    END IF;
  END IF;

  IF v_master_party_id IS NOT NULL THEN
    IF NOT public.adn008_master_party_valid_for_store(v_master_party_id, p_store_id) THEN
      RAISE EXCEPTION 'ERR_SUPPLIER_MASTER_INVALID: % no pertenece al tenant de la tienda o no está activo', v_master_party_id;
    END IF;
  END IF;

  -- (F4/§6) Snapshot del maestro cuando la identidad es SOLO-MAESTRO (alta al
  -- vuelo desde el Clasificador, sin proveedor local): nombre y snapshot
  -- (code/tax_id/phone/address) desde la fila autorizada; el texto explícito
  -- del cliente prevalece si llegó.
  IF v_supplier_id IS NULL AND v_master_party_id IS NOT NULL THEN
    SELECT mp.name,
           jsonb_build_object('code', mp.code, 'tax_id', mp.tax_id,
                              'phone', mp.phone, 'address', mp.address)
      INTO v_mp_name, v_meta
    FROM master_parties mp WHERE mp.id = v_master_party_id;
    v_supplier := COALESCE(v_supplier, v_mp_name);
  END IF;

  -- Requisito estructural mínimo del documento (identificable y almacenable).
  IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_AMOUNT: total_amount must be > 0';
  END IF;
  IF p_exchange_rate < 0.01 OR p_exchange_rate > 10000 THEN
    RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: % out of range [0.01, 10000]', p_exchange_rate;
  END IF;
  IF p_payment_terms_days < 1 OR p_payment_terms_days > 365 THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYMENT_TERMS: % out of range [1, 365]', p_payment_terms_days;
  END IF;
  IF p_distribution_method NOT IN ('amount', 'quantity', 'manual') THEN
    RAISE EXCEPTION 'ERR_INVALID_DISTRIBUTION_METHOD';
  END IF;
  IF p_service_type_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count FROM service_types
    WHERE id = p_service_type_id
      AND (store_id = p_store_id OR store_id IS NULL)
      AND is_active = true;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'ERR_SERVICE_TYPE_NOT_FOUND';
    END IF;
  END IF;

  PERFORM public.validate_operation_date(COALESCE(p_service_date, CURRENT_DATE)::timestamp with time zone, p_store_id);

  SELECT 'SRV-' || to_char(COALESCE(p_service_date, CURRENT_DATE), 'YYYYMMDD') || '-' ||
         LPAD(nextval('service_number_seq')::text, 5, '0')
  INTO v_service_number;

  -- ── (F5/§7) Defensa en profundidad: si el índice único de creation_key
  --    detecta una carrera que esquivó el advisory lock, SE REVIERTE LA
  --    CREACIÓN COMPLETA (subtransacción) y se devuelve el borrador ganador —
  --    nunca dos borradores ni una respuesta duplicada con fila huérfana.
  BEGIN
    INSERT INTO received_services (
      store_id, service_number, service_date, service_type_id, service_type_name,
      supplier, reference_doc, currency, exchange_rate, total_amount,
      observations, status, distribution_method, created_by,
      payment_terms_days, due_date,
      supplier_id, supplier_master_party_id,
      supplier_code, supplier_tax_id, supplier_phone, supplier_address
    ) VALUES (
      p_store_id, v_service_number, COALESCE(p_service_date, CURRENT_DATE),
      p_service_type_id, p_service_type_name, v_supplier, p_reference_doc,
      p_currency, p_exchange_rate, p_total_amount, p_observations,
      'draft', p_distribution_method, v_caller_uid,
      p_payment_terms_days, (COALESCE(p_service_date, CURRENT_DATE) + p_payment_terms_days)::date,
      v_supplier_id, v_master_party_id,
      NULLIF(btrim(COALESCE(v_meta->>'code', '')), ''),
      NULLIF(btrim(COALESCE(v_meta->>'tax_id', '')), ''),
      NULLIF(btrim(COALESCE(v_meta->>'phone', '')), ''),
      NULLIF(btrim(COALESCE(v_meta->>'address', '')), '')
    ) RETURNING id INTO v_service_id;

    -- Vínculos documentales (misma validación que create_received_service_v2:
    -- misma tienda, recepción activa, OT no anulada/cerrada). NO distribuyen
    -- costos, NO tocan inventario, NO contabilizan.
    v_link_count := jsonb_array_length(COALESCE(p_receipt_ids, '[]'::jsonb));
    IF v_link_count > 0 THEN
      v_allocated_per_receipt := p_total_amount / v_link_count;
      FOR v_receipt_id IN SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_receipt_ids, '[]'::jsonb)) LOOP
        IF NOT EXISTS (SELECT 1 FROM receipts WHERE id = v_receipt_id AND store_id = p_store_id AND status = 'active') THEN
          RAISE EXCEPTION 'ERR_RECEIPT_INVALID: % no pertenece a la store o no esta activo', v_receipt_id;
        END IF;
        INSERT INTO service_reception_links (service_id, receipt_id, allocation_percentage, allocated_amount)
        VALUES (v_service_id, v_receipt_id, 100.0 / v_link_count, v_allocated_per_receipt);
      END LOOP;
    END IF;

    IF jsonb_array_length(COALESCE(p_production_order_ids, '[]'::jsonb)) > 0 THEN
      FOR v_order_id IN SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_production_order_ids, '[]'::jsonb)) LOOP
        IF NOT EXISTS (
          SELECT 1 FROM production_orders
          WHERE id = v_order_id AND store_id = p_store_id
            AND status NOT IN ('voided', 'closed')
        ) THEN
          RAISE EXCEPTION 'ERR_PRODUCTION_ORDER_INVALID: % no pertenece a la tienda o su estado no admite vinculación', v_order_id;
        END IF;
        INSERT INTO service_production_order_links (service_id, production_order_id)
        VALUES (v_service_id, v_order_id)
        ON CONFLICT (service_id, production_order_id) DO NOTHING;
        v_ot_count := v_ot_count + 1;
      END LOOP;
    END IF;

    INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
    VALUES (v_caller_uid, p_store_id, 'SERVICE_DRAFT_CREATED', 'received_services', v_service_id,
      jsonb_build_object(
        'service_number', v_service_number, 'supplier', v_supplier,
        'supplier_id', v_supplier_id, 'supplier_master_party_id', v_master_party_id,
        'total_amount', p_total_amount, 'currency', p_currency,
        'receipt_ids_linked', v_link_count, 'production_order_ids_linked', v_ot_count,
        'creation_key', v_key
      ));
  EXCEPTION
    WHEN unique_violation THEN
      IF v_key IS NOT NULL THEN
        SELECT al.record_id INTO v_service_id
        FROM audit_logs al
        WHERE al.action = 'SERVICE_DRAFT_CREATED'
          AND al.store_id = p_store_id
          AND al.table_name = 'received_services'
          AND al.metadata->>'creation_key' = v_key
        ORDER BY al.created_at DESC
        LIMIT 1;
        IF v_service_id IS NOT NULL THEN
          SELECT service_number INTO v_service_number
          FROM received_services WHERE id = v_service_id;
          RETURN jsonb_build_object(
            'status', 'success', 'service_id', v_service_id,
            'service_number', v_service_number, 'draft', true, 'duplicate', true
          );
        END IF;
      END IF;
      RAISE;  -- unique_violation ajeno a la creation_key: no se normaliza.
  END;

  RETURN jsonb_build_object(
    'status', 'success', 'service_id', v_service_id,
    'service_number', v_service_number, 'link_count', v_link_count,
    'production_order_link_count', v_ot_count, 'draft', true
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5) update_received_service_draft — NUEVA FIRMA patch-based (F7/§9).
--    Contrato inequívoco tri-state: cada clave del patch DECIDE su campo.
--      · Clave AUSENTE            → conservar el valor anterior.
--      · Clave con JSON null / '' → LIMPIAR (NULL).
--      · Clave con valor          → aplicar (validado).
--    Casos definidos expresamente (§9):
--      · supplier            → nombre (texto libre; '' / null limpian).
--      · identidad (supplier_id | supplier_master_party_id | supplier_meta
--        presente)          → REEMPLAZO ATÓMICO del bloque: IDs del patch
--        (null limpia), snapshot DESDE LA FUENTE AUTORIZADA; si se fijan IDs
--        y no llega 'supplier', el nombre se refresca desde la fila
--        autorizada (nunca un nombre nuevo asociado a un ID antiguo).
--      · service_type_id / service_type_name → bloque atómico del tipo.
--      · reference_doc / observations → string | null (limpiar).
--      · service_date → date válida (validate_operation_date + vencimiento) |
--        null → RESTABLECER al día operativo actual (semántica del formulario).
--      · total_amount → número > 0 (recalcula el reparto de vínculos nuevos).
--      · receipt_ids / production_order_ids → array (REEMPLAZA el conjunto) |
--        null (borra todos) | ausente (conserva).
--      · distribution_method → valor válido; null conserva (no listado en §9).
--    ACL (F3/§5, Alternativa B): authenticated conservado; gate de gestión
--    DENTRO del RPC; identidad = auth.uid() (p_actor_id IGNORADO para
--    sesiones autenticadas — anti-spoofing); fail-closed con pagos o
--    distribuciones (invariante ADN-008 intacto).
--    La firma anterior /15 se RETIRA (DROP) → sin overloads ambiguos de
--    PostgREST (exigencia §9); la única llamadora (PATCH update-draft) se
--    actualiza en el mismo PR.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_received_service_draft(uuid, uuid, text, uuid, uuid, jsonb, uuid, text, numeric, date, text, text, text, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.update_received_service_draft(
  p_service_id uuid,
  p_actor_id uuid DEFAULT NULL::uuid,
  p_patch jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id uuid;
  v_status text;
  v_service_number text;
  v_supplier text;
  v_service_type_id uuid;
  v_service_type_name text;
  v_total numeric;
  v_service_date date;
  v_due_date date;
  v_terms integer;
  v_reference_doc text;
  v_observations text;
  v_distribution_method text;
  v_receipt_id uuid;
  v_order_id uuid;
  v_link_count integer := 0;
  v_ot_count integer := 0;
  v_alloc numeric;
  v_count integer;
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_actor_id, auth.uid())
    ELSE auth.uid()
  END;
  v_patch jsonb := COALESCE(p_patch, '{}'::jsonb);
  v_id_present boolean :=
    (v_patch ? 'supplier_id') OR (v_patch ? 'supplier_master_party_id') OR (v_patch ? 'supplier_meta');
  v_type_present boolean :=
    (v_patch ? 'service_type_id') OR (v_patch ? 'service_type_name');
  v_sid uuid;
  v_mid uuid;
  v_s_name text;
  v_mp_live uuid;
  v_meta jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT store_id, status, service_number, supplier, total_amount, service_date,
         payment_terms_days, service_type_id, service_type_name
  INTO v_store_id, v_status, v_service_number, v_supplier, v_total, v_service_date,
       v_terms, v_service_type_id, v_service_type_name
  FROM received_services WHERE id = p_service_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND'; END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'ERR_NOT_DRAFT: solo los borradores pueden editarse aquí (estado actual: %)', v_status;
  END IF;

  -- (F3/§5) Gate de gestión (Alternativa B) — identidad anti-spoofing.
  IF v_caller_uid IS NULL OR NOT public.can_manage_store_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Fail-closed: un borrador con pagos o distribuciones ya no es editable
  -- por este canal (integridad — nada debería existir, pero se verifica).
  IF EXISTS (SELECT 1 FROM payment_transactions pt WHERE pt.ref_type = 'service' AND pt.ref_id = p_service_id) THEN
    RAISE EXCEPTION 'ERR_HAS_PAYMENTS: el borrador tiene pagos registrados';
  END IF;
  IF EXISTS (SELECT 1 FROM service_cost_distributions scd WHERE scd.service_id = p_service_id) THEN
    RAISE EXCEPTION 'ERR_HAS_DISTRIBUTIONS: el borrador tiene distribuciones de costo';
  END IF;

  -- ── (F4/§6 + F7/§9) Identidad del proveedor: BLOQUE ATÓMICO con snapshot
  --    desde la fuente autorizada. Cualquier clave de identidad presente =
  --    reemplazo completo del bloque (IDs + snapshot); limpiar IDs limpia el
  --    snapshot; el nombre se refresca desde la fila autorizada cuando se
  --    fijan IDs y no llega 'supplier' — jamás un nombre nuevo con ID antiguo.
  IF v_id_present THEN
    v_sid := CASE WHEN v_patch ? 'supplier_id' AND jsonb_typeof(v_patch->'supplier_id') <> 'null'
                  THEN NULLIF(btrim(v_patch->>'supplier_id'), '')::uuid END;
    v_mid := CASE WHEN v_patch ? 'supplier_master_party_id' AND jsonb_typeof(v_patch->'supplier_master_party_id') <> 'null'
                  THEN NULLIF(btrim(v_patch->>'supplier_master_party_id'), '')::uuid END;

    IF v_sid IS NOT NULL THEN
      SELECT s.name, s.master_party_id,
             jsonb_build_object('tax_id', s.tax_id,
                                'phone', s.phone, 'address', s.address)
        INTO v_s_name, v_mp_live, v_meta
      FROM suppliers s
      WHERE s.id = v_sid AND s.store_id = v_store_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_SUPPLIER_INVALID: % no pertenece a la tienda', v_sid;
      END IF;
      -- coherencia local↔maestro cuando llegan ambas identidades
      IF v_mid IS NOT NULL AND v_mp_live IS NOT NULL AND v_mp_live <> v_mid THEN
        RAISE EXCEPTION 'ERR_SUPPLIER_IDENTITY_MISMATCH: el proveedor local % está ligado al tercero %, no a %',
          v_sid, v_mp_live, v_mid;
      END IF;
    END IF;

    IF v_mid IS NOT NULL THEN
      IF NOT public.adn008_master_party_valid_for_store(v_mid, v_store_id) THEN
        RAISE EXCEPTION 'ERR_SUPPLIER_MASTER_INVALID: % no pertenece al tenant de la tienda o no está activo', v_mid;
      END IF;
    END IF;

    -- Nombre coherente con la identidad final:
    IF v_patch ? 'supplier' AND jsonb_typeof(v_patch->'supplier') <> 'null' THEN
      v_supplier := NULLIF(btrim(v_patch->>'supplier'), '');
    ELSIF v_sid IS NOT NULL THEN
      v_supplier := v_s_name;
    ELSIF v_mid IS NOT NULL THEN
      SELECT mp.name INTO v_supplier FROM master_parties mp WHERE mp.id = v_mid;
    ELSE
      -- Identidad limpiada sin nombre enviado: el nombre pasa a texto libre
      -- vacío (nunca queda un nombre nuevo asociado a un ID antiguo). El
      -- formulario envía siempre el nombre junto con la identidad; este es el
      -- caso de API directa con limpieza explícita.
      v_supplier := NULL;
    END IF;

    -- Snapshot final: de la fila autorizada si hay identidad; NULL si no.
    IF v_sid IS NULL AND v_mid IS NOT NULL THEN
      SELECT jsonb_build_object('code', mp.code, 'tax_id', mp.tax_id,
                                'phone', mp.phone, 'address', mp.address)
        INTO v_meta FROM master_parties mp WHERE mp.id = v_mid;
    ELSIF v_sid IS NULL AND v_mid IS NULL THEN
      v_meta := NULL;
    END IF;
  ELSE
    IF v_patch ? 'supplier' THEN
      v_supplier := NULLIF(btrim(COALESCE(v_patch->>'supplier', '')), '');
    END IF;
  END IF;

  -- ── Escalares tri-state ──
  IF v_patch ? 'total_amount' THEN
    v_total := NULLIF(v_patch->>'total_amount', '')::numeric;
    IF v_total IS NULL OR v_total <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_AMOUNT: total_amount must be > 0';
    END IF;
  END IF;

  IF v_patch ? 'service_date' THEN
    IF jsonb_typeof(v_patch->'service_date') = 'null' THEN
      -- (§9) Fecha enviada como NULL → RESTABLECER al día operativo actual.
      -- Día de NEGOCIO America/Havana (canon CP-FIN-004 / todayBusinessDay):
      -- CURRENT_DATE correría en UTC y tras las 20:00 Habana fechaba mañana
      -- → ERR_FUTURE_DATED_DOCUMENT.
      v_service_date := (now() AT TIME ZONE 'America/Havana')::date;
    ELSE
      v_service_date := NULLIF(btrim(v_patch->>'service_date'), '')::date;
      IF v_service_date IS NULL THEN
        RAISE EXCEPTION 'ERR_INVALID_SERVICE_DATE: fecha no interpretable';
      END IF;
    END IF;
    PERFORM public.validate_operation_date(v_service_date::timestamp with time zone, v_store_id);
    v_due_date := (v_service_date + v_terms)::date;
  END IF;

  IF v_patch ? 'reference_doc' THEN
    v_reference_doc := NULLIF(btrim(COALESCE(v_patch->>'reference_doc', '')), '');
  END IF;
  IF v_patch ? 'observations' THEN
    v_observations := NULLIF(btrim(COALESCE(v_patch->>'observations', '')), '');
  END IF;

  IF v_type_present THEN
    v_service_type_id := CASE
      WHEN v_patch ? 'service_type_id' AND jsonb_typeof(v_patch->'service_type_id') <> 'null'
        THEN NULLIF(btrim(v_patch->>'service_type_id'), '')::uuid
      WHEN v_patch ? 'service_type_id' THEN NULL
      ELSE v_service_type_id
    END;
    v_service_type_name := CASE
      WHEN v_patch ? 'service_type_name' AND jsonb_typeof(v_patch->'service_type_name') <> 'null'
        THEN NULLIF(btrim(v_patch->>'service_type_name'), '')
      WHEN v_patch ? 'service_type_name' THEN NULL
      ELSE v_service_type_name
    END;
    IF v_service_type_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_count FROM service_types
      WHERE id = v_service_type_id
        AND (store_id = v_store_id OR store_id IS NULL)
        AND is_active = true;
      IF v_count = 0 THEN
        RAISE EXCEPTION 'ERR_SERVICE_TYPE_NOT_FOUND';
      END IF;
    END IF;
  END IF;

  IF v_patch ? 'distribution_method' AND jsonb_typeof(v_patch->'distribution_method') <> 'null' THEN
    v_distribution_method := btrim(v_patch->>'distribution_method');
    IF v_distribution_method NOT IN ('amount', 'quantity', 'manual') THEN
      RAISE EXCEPTION 'ERR_INVALID_DISTRIBUTION_METHOD';
    END IF;
  END IF;

  -- ── Persistencia: cada campo usa el valor resuelto de su clave; los campos
  --    sin clave conservan el valor leído de la fila (variables cargadas). ──
  UPDATE received_services SET
    supplier                = v_supplier,
    supplier_id             = CASE WHEN v_id_present THEN v_sid ELSE supplier_id END,
    supplier_master_party_id = CASE WHEN v_id_present THEN v_mid ELSE supplier_master_party_id END,
    supplier_code           = CASE WHEN v_id_present THEN NULLIF(btrim(COALESCE(v_meta->>'code', '')), '') ELSE supplier_code END,
    supplier_tax_id         = CASE WHEN v_id_present THEN NULLIF(btrim(COALESCE(v_meta->>'tax_id', '')), '') ELSE supplier_tax_id END,
    supplier_phone          = CASE WHEN v_id_present THEN NULLIF(btrim(COALESCE(v_meta->>'phone', '')), '') ELSE supplier_phone END,
    supplier_address        = CASE WHEN v_id_present THEN NULLIF(btrim(COALESCE(v_meta->>'address', '')), '') ELSE supplier_address END,
    service_type_id         = v_service_type_id,
    service_type_name       = v_service_type_name,
    total_amount            = v_total,
    service_date            = v_service_date,
    due_date                = COALESCE(v_due_date, due_date),
    reference_doc           = CASE WHEN v_patch ? 'reference_doc' THEN v_reference_doc ELSE reference_doc END,
    observations            = CASE WHEN v_patch ? 'observations' THEN v_observations ELSE observations END,
    distribution_method     = COALESCE(v_distribution_method, distribution_method),
    updated_at              = NOW()
  WHERE id = p_service_id;

  -- ── Vínculos (§9): clave presente + array = REEMPLAZAR el conjunto;
  --    clave presente + null = BORRAR todos; clave ausente = conservar. ──
  IF v_patch ? 'receipt_ids' THEN
    DELETE FROM service_reception_links WHERE service_id = p_service_id;
    IF jsonb_typeof(v_patch->'receipt_ids') = 'array'
       AND jsonb_array_length(v_patch->'receipt_ids') > 0 THEN
      v_link_count := jsonb_array_length(v_patch->'receipt_ids');
      v_alloc := v_total / v_link_count;
      FOR v_receipt_id IN SELECT value::uuid FROM jsonb_array_elements_text(v_patch->'receipt_ids') LOOP
        IF NOT EXISTS (SELECT 1 FROM receipts WHERE id = v_receipt_id AND store_id = v_store_id AND status = 'active') THEN
          RAISE EXCEPTION 'ERR_RECEIPT_INVALID: % no pertenece a la store o no esta activo', v_receipt_id;
        END IF;
        INSERT INTO service_reception_links (service_id, receipt_id, allocation_percentage, allocated_amount)
        VALUES (p_service_id, v_receipt_id, 100.0 / v_link_count, v_alloc);
      END LOOP;
    END IF;
  END IF;

  IF v_patch ? 'production_order_ids' THEN
    DELETE FROM service_production_order_links WHERE service_id = p_service_id;
    IF jsonb_typeof(v_patch->'production_order_ids') = 'array'
       AND jsonb_array_length(v_patch->'production_order_ids') > 0 THEN
      FOR v_order_id IN SELECT value::uuid FROM jsonb_array_elements_text(v_patch->'production_order_ids') LOOP
        IF NOT EXISTS (
          SELECT 1 FROM production_orders
          WHERE id = v_order_id AND store_id = v_store_id
            AND status NOT IN ('voided', 'closed')
        ) THEN
          RAISE EXCEPTION 'ERR_PRODUCTION_ORDER_INVALID: % no pertenece a la tienda o su estado no admite vinculación', v_order_id;
        END IF;
        INSERT INTO service_production_order_links (service_id, production_order_id)
        VALUES (p_service_id, v_order_id)
        ON CONFLICT (service_id, production_order_id) DO NOTHING;
        v_ot_count := v_ot_count + 1;
      END LOOP;
    END IF;
  END IF;

  INSERT INTO service_audit_log (service_id, user_id, action, details)
  VALUES (p_service_id, v_caller_uid, 'draft_updated', jsonb_build_object(
    'by_rpc', 'update_received_service_draft/3 (patch ADN-009)',
    'patch_keys', (SELECT COALESCE(jsonb_agg(x.key), '[]'::jsonb) FROM jsonb_object_keys(v_patch) AS x(key)),
    'supplier', v_supplier,
    'identity_replaced', v_id_present,
    'receipt_ids_replaced', (v_patch ? 'receipt_ids'),
    'production_order_ids_replaced', (v_patch ? 'production_order_ids')
  ));

  RETURN jsonb_build_object(
    'status', 'success', 'service_id', p_service_id,
    'service_number', v_service_number, 'draft', true
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6) Índice único parcial — defensa de idempotencia de borradores (F5/§7).
--    La clave queda limitada por tienda y por operación; dos creaciones con
--    la misma clave no pueden persistir dos filas de auditoría (y por tanto,
--    con la EXCEPTION del RPC, ni dos borradores).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_service_draft_creation_key
  ON public.audit_logs (store_id, (metadata->>'creation_key'))
  WHERE action = 'SERVICE_DRAFT_CREATED' AND metadata->>'creation_key' IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7) ACL — declaración explícita (patrón repo: cada migración re-declara).
--    · Draft RPCs: authenticated CONSERVADO (Alternativa B — el gate de
--      gestión vive DENTRO del cuerpo con can_manage_store_as; auth.uid() es
--      la identidad; los parámetros de actor NO son fuente de identidad).
--    · Batch de pagos: service_role EXCLUSIVO (Alternativa A — alineado al
--      canal exclusivo service_role de register_supplier_payment y a la
--      decisión CP-FIN-004 de 2026-11-20; /api/payments autoriza con
--      canManageStore y ejecuta la llamada privilegiada por el cliente
--      service_role).
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_received_service_draft(uuid, text, numeric, uuid, text, date, text, numeric, integer, text, text, text, jsonb, jsonb, uuid, uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_received_service_draft(uuid, text, numeric, uuid, text, date, text, numeric, integer, text, text, text, jsonb, jsonb, uuid, uuid, uuid, jsonb, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_received_service_draft(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_received_service_draft(uuid, uuid, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.register_supplier_payment_batch(uuid, text, uuid, jsonb, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_supplier_payment_batch(uuid, text, uuid, jsonb, uuid, timestamptz, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 8) Comentarios de trazabilidad.
-- ---------------------------------------------------------------------------
COMMENT ON FUNCTION public.register_supplier_payment(uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text, timestamptz) IS
  'Motor canónico de pagos a proveedor (CP-FIN-003/004). ADN-009: serialización compartida batch/individual vía SELECT ... FOR UPDATE del documento antes del saldo; estado del servicio comprobado tras el lock (solo active paga); pre-check de combinación medio×moneda (Transf. Exterior = riel divisa USD/EUR).';
COMMENT ON FUNCTION public.register_supplier_payment_batch(uuid, text, uuid, jsonb, uuid, timestamptz, text) IS
  'ADN-009: lote atómico 1..20 con CONTRATO CANÓNICO CP-FIN-004 (external_transfer; zelle heredado normalizado, jamás persistido), bloqueo compartido del documento antes del saldo y ACL service_role exclusiva (el endpoint /api/payments autoriza con canManageStore).';
COMMENT ON FUNCTION public.create_received_service_draft(uuid, text, numeric, uuid, text, date, text, numeric, integer, text, text, text, jsonb, jsonb, uuid, uuid, uuid, jsonb, text) IS
  'ADN-009: idempotencia real (advisory lock ANTES de consultar creation_key + re-consulta + índice único parcial + EXCEPTION unique_violation que revierte y devuelve el ganador), gate de gestión dentro del RPC (can_manage_store_as; p_created_by NO es identidad para authenticated) y snapshot de identidad del proveedor desde fuente autorizada.';
COMMENT ON FUNCTION public.update_received_service_draft(uuid, uuid, jsonb) IS
  'ADN-009: contrato patch tri-state (clave ausente = conservar; null/"" = limpiar; valor = aplicar). service_date null restablece al día operativo. Identidad del proveedor = bloque atómico con snapshot desde fuente autorizada y coherencia nombre/IDs/snapshot. Gate de gestión dentro del RPC. Firma anterior /15 retirada (sin overloads ambiguos).';
