-- ============================================================================
-- 20261021000001_cash_flow_documents.sql
--
-- MISIÓN INGRESOS/EGRESOS DE CAJA (2026-10-20): nuevo tipo documental
-- «Ingresos/Egresos» para registrar entradas y salidas físicas de efectivo de
-- la caja de una tienda — en primer lugar la constitución, reposición y
-- devolución (total/parcial) del fondo de cambio.
--
-- DECISIONES DE DISEÑO (auditoría previa — ver worklog Task 7):
--   D1 · Una sola escritura del dinero: el efecto financiero vive EXACTAMENTE
--       una vez en payment_transactions (ref_type='cash_flow', direction
--       in/out, amount_cup GENERATED — conversión única en escritura, doctrina
--       PR-4.4I/OBS-1). La tabla cash_movements es legacy write-only (nadie la
--       lee): NO se escribe en ella para no duplicar el impacto.
--   D2 · El fondo inicial de la apertura sigue contando vía
--       cash_closures.opening_balance (única fuente). Los documentos
--       cash_flow suman/restituyen DINERO nuevo que entra/físicamente sale
--       durante el turno: fondo vigente = opening_balance + constituciones +
--       reposiciones − devoluciones (docs confirmados en la ventana). El mismo
--       billete jamás se cuenta dos veces: o se declara en la apertura, o se
--       registra como documento — la UI advierte cuando la apertura ya declaró
--       fondo y se registra una constitución.
--   D3 · Las TRES fórmulas de caja se extienden con el término nuevo
--       (cash_flow_in / cash_flow_out) para evitar la divergencia que hoy
--       sufren los ajustes extraordinarios (ref_type='adjustment' solo entra
--       al Reporte de Entrega, no al arqueo):
--         a) close_cash_shift v2.21.0 (cierre — autoritativa)
--         b) get_cash_shift_expected v2.21.0 (espejo UI / arqueo en vivo)
--         c) get_cash_report (Reporte de Entrega) + enriquecimiento de
--            /api/cash-report + src/lib/cash-report/summary.ts
--       Efectivo esperado = fondo inicial + ventas cash + anticipos cash
--         + ingresos de caja (cash_flow in) − pagos proveedores cash
--         − comisiones cash − egresos de caja (cash_flow out).
--   D4 · Estados: 'confirmado' | 'anulado' (sin borrador). El efectivo es un
--       evento físico puntual: se registra YA confirmado tras la revisión en
--       dos pasos de la UI; no existe estado pendiente que pueda tocar el
--       saldo. La corrección de un confirmado es ANULACIÓN (motivo
--       obligatorio), nunca edición de importes (PT007 prohíbe DELETE; el
--       ledger se corrige con fila contraria, doctrina de reversas).
--   D5 · Caja cerrada: registrar exige turno PENDIENTE (ERR_NO_OPEN_SHIFT) y
--       fecha operativa DENTRO de la ventana del turno (doctrina 'FIJA' del
--       registro de fechas de trabajo: el turno mide lo que realmente pasa en
--       su ventana; docs fuera de ventana harían invisible el dinero en el
--       arqueo). No se modifica silenciosamente ninguna sesión cerrada.
--   D6 · Anulación: FOR UPDATE + solo 'confirmado' + motivo >= 3 + rol
--       admin/manager/encargado + fila CONTRARIA en payment_transactions con
--       payment_date = NOW() (la corrección física ocurre AHORA; los cierres
--       históricos quedan congelados e intactos — su ventana no se reabre) +
--       estado 'anulado' con annulled_at/by/reason + auditoría atómica.
--       Idempotencia natural: segunda anulación → ERR_ALREADY_ANNULLED; la
--       fila contra lleva idempotency_key 'cf-anul-<doc>' (UNIQUE parcial).
--   D7 · Numeración documental existente: document_sequences + 
--       next_document_number con tipo nuevo 'cash_flow' → prefijo 'IE'
--       (IE-000001-2026), atómico por SELECT FOR UPDATE dentro de la misma
--       transacción del creador + advisory lock por tienda.
--   D8 · Monedas admitidas: CUP (tasa 1) y USD (tasa resuelta SERVER-SIDE con
--       la jerarquía canónica de ventas: store_exchange_rates → BCC seg 3 →
--       elToque → fail-closed + staleness 45 días). La tasa del cliente NO
--       tiene autoridad financiera.
--   D9 · Roles: registrar = admin/manager/encargado/clerk con acceso a la
--       tienda; anular = admin/manager/encargado (doctrina de reversas).
--       Aislamiento por tienda vía has_store_access_as (actor-explícito).
--       Sin service_role en el cliente: los RPC de mutación son
--       service_role-only y solo las llama la ruta API con p_user_id de la
--       sesión verificada.
--
-- COMPATIBILIDAD: no se alteran registros históricos; las consultas existentes
-- filtran ref_type IN (...) explícito, por lo que el valor nuevo 'cash_flow'
-- queda invisible para todos los flujos previos hasta que las fórmulas (D3)
-- lo incorporan deliberadamente. Los cierres pasados no se recalculan.
--
-- RECONCILIACIÓN CON LA BD VIVA (auditoría pre-aplicación 2026-10-21 — rama
-- fix/caja-migracion-compat-live, PR de seguimiento del #1435):
--   R1 · El CHECK vivo de payment_transactions.ref_type incluye 'devolution'
--       (columna direction + direction_check + devolution_ref_check vienen del
--       release de auditoría W7 20260830, aplicado fuera de la cadena de
--       migraciones). Existen 2 filas reales ref_type='devolution' (refunds
--       2026-09-10 y 2026-09-18). La lista original de esta migración omitía
--       'devolution' ⇒ su ADD CONSTRAINT habría rebotado ATÓMICAMENTE contra
--       esas filas (la migración era NO-APLICABLE a la BD viva tal como se
--       fusionó). Se corrige a la UNIÓN: valores de la cadena + valores vivos
--       + los dos nuevos.
--   R2 · El direction_check vivo es ('in','refund') (W7): los egresos de caja
--       y las filas contra de anulación de ingresos usan direction='out' ⇒ sin
--       extenderlo, todo egreso y toda anulación de ingreso rebotaría en
--       runtime. UNIÓN: ('in','out','refund'). El ADD COLUMN IF NOT EXISTS
--       direction hace la cadena autocontenida en replay fresco (en la BD viva
--       es no-op: la columna existe desde W7 con igual definición).
--   R3 · 20261012000001 (ajustes del Reporte de Entrega) NO está aplicado a la
--       BD viva y su ADD CONSTRAINT rebotaría contra las filas 'devolution':
--       su semántica de constraint queda SUBSUMIDA aquí (unión + índice parcial
--       idempotente idx_payment_txn_adjustments).
--   R4 · Trampa de nulidad compuesta de PostgreSQL: `<record> IS NOT NULL`
--       exige que TODOS los campos del registro sean no-nulos. cash_closures
--       lleva session_reference (legacy) NULL en sus filas reales ⇒ el test
--       compuesto era SIEMPRE falso y get_cash_shift_expected v2.18.0 (vivo)
--       ignoraba el turno abierto (ventana del último cierre/epoch y fondo 0).
--       Los espejos v2.21.0 pasan a FOUND tras SELECT INTO (detección real de
--       fila). Auditoría 2026-10-21: evidencia con la fila pendiente de
--       TIENDA CENTRAL (e525004e): r IS NULL=false ∧ r IS NOT NULL=false.
--   R5 · close_cash_shift (v2.18.0 vivo y v2.21.0 fusionada) referenciaba
--       cash_closures.updated_at — columna INEXISTENTE (el UPDATE rebotaba
--       en runtime: cierre de turno roto en producción desde 2026-10-10,
--       hallazgo de la matriz contable S21 en BEGIN…ROLLBACK). Se elimina la
--       referencia; el único sello temporal del cierre es closed_at = NOW().
--
-- NOTA CONTRACT-SURFACE: close_cash_shift/5, get_cash_shift_expected/1,
-- get_cash_report/4 y next_document_number/3 están certificadas en vivo; esta
-- migración las modifica → se cubren con entradas temporales
-- source_of_truth_baseline en ci-gate-allowlist.json (expiran 2026-11-30,
-- patrón PR #1422). Tras aplicar a la BD viva, re-exportar el contract surface
-- y retirar las entradas.
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE 1 — Tabla documental cash_flow_documents
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cash_flow_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  -- Número único por tienda conforme a la convención documental (IE-000001-2026)
  document_number text NOT NULL,
  -- 'ingreso' = entra efectivo a la caja · 'egreso' = sale efectivo de la caja
  doc_type text NOT NULL CHECK (doc_type IN ('ingreso', 'egreso')),
  concept text NOT NULL CHECK (concept IN (
    'constitucion_fondo', 'reposicion_fondo',
    'devolucion_total_fondo', 'devolucion_parcial_fondo',
    'otro_ingreso', 'otro_egreso'
  )),
  -- Matriz tipo↔concepto: un egreso jamás lleva concepto de ingreso y viceversa
  CONSTRAINT cash_flow_documents_type_concept_check CHECK (
    (doc_type = 'ingreso' AND concept IN ('constitucion_fondo', 'reposicion_fondo', 'otro_ingreso'))
    OR
    (doc_type = 'egreso' AND concept IN ('devolucion_total_fondo', 'devolucion_parcial_fondo', 'otro_egreso'))
  ),
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency IN ('CUP', 'USD')),
  -- CUP ⇒ tasa 1 · USD ⇒ tasa > 1 (invariante espejo de payment_transactions)
  exchange_rate numeric NOT NULL DEFAULT 1 CHECK (
    (currency = 'CUP' AND exchange_rate = 1)
    OR (currency = 'USD' AND exchange_rate > 1)
  ),
  amount_cup numeric GENERATED ALWAYS AS (
    CASE WHEN currency = 'CUP' THEN amount ELSE amount * exchange_rate END
  ) STORED,
  -- Por definición del módulo, el movimiento es efectivo físico
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method = 'cash'),
  -- Fecha operativa (dentro de la ventana del turno abierto — D5)
  operation_date timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'confirmado' CHECK (status IN ('confirmado', 'anulado')),
  -- Turno (cash_closures pendiente) en el que se registró el documento
  closure_id uuid REFERENCES public.cash_closures(id),
  -- Quien registra la operación (responsable interno)
  responsible_user_id uuid NOT NULL REFERENCES public.profiles(id),
  -- Persona externa que entrega (ingreso) o recibe (egreso) el dinero
  counterparty text,
  justification text NOT NULL CHECK (btrim(justification) <> ''),
  notes text,
  -- Devolución vinculada a la constitución/reposición que la origina (opcional)
  related_document_id uuid REFERENCES public.cash_flow_documents(id),
  payment_transaction_id uuid REFERENCES public.payment_transactions(id),
  annulment_payment_transaction_id uuid REFERENCES public.payment_transactions(id),
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid NOT NULL REFERENCES public.profiles(id),
  annulled_at timestamptz,
  annulled_by uuid REFERENCES public.profiles(id),
  annulment_reason text
);

COMMENT ON TABLE public.cash_flow_documents IS
  'Documento Ingresos/Egresos de caja: entrada/salida física de efectivo (fondo de cambio constitución/reposición/devolución y otros autorizados). Cabecera documental trazable; el efecto financiero vive UNA vez en payment_transactions (ref_type=cash_flow) — jamás en cash_movements (legacy write-only). Estados confirmado/anulado; la anulación inserta fila contraria y congela la histórica. RLS por tienda.';

COMMENT ON COLUMN public.cash_flow_documents.document_number IS 'Número secuencial por tienda+año vía next_document_number(document_type=cash_flow), formato IE-000001-2026.';
COMMENT ON COLUMN public.cash_flow_documents.amount_cup IS 'Equivalente canónico CUP (generado, conversión única en escritura — doctrina PR-4.4I/OBS-1).';
COMMENT ON COLUMN public.cash_flow_documents.operation_date IS 'Fecha operativa del movimiento; validada dentro de la ventana del turno abierto (doctrina caja FIJA) y por validate_operation_date.';
COMMENT ON COLUMN public.cash_flow_documents.payment_transaction_id IS 'Fila del ledger con el efecto financiero original (direction in/out).';
COMMENT ON COLUMN public.cash_flow_documents.annulment_payment_transaction_id IS 'Fila contra (dirección opuesta, payment_date=NOW()) que revierte el efecto al anular.';
COMMENT ON COLUMN public.cash_flow_documents.related_document_id IS 'Documento original vinculado: devolución → constitución/reposición del fondo que la origina.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_flow_documents_store_number
  ON public.cash_flow_documents (store_id, document_number);

CREATE INDEX IF NOT EXISTS idx_cash_flow_documents_store_date
  ON public.cash_flow_documents (store_id, operation_date DESC);

CREATE INDEX IF NOT EXISTS idx_cash_flow_documents_store_status
  ON public.cash_flow_documents (store_id, status, operation_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_flow_documents_idempotency
  ON public.cash_flow_documents (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- RLS: lectura para miembros de la tienda; escritura SOLO vía RPC (SECURITY
-- DEFINER service_role-only). REVOKE completo primero: RLS no gobierna
-- TRUNCATE y Supabase otorga ALL a anon/authenticated por defecto.
ALTER TABLE public.cash_flow_documents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cash_flow_documents FROM anon, authenticated, PUBLIC;

DROP POLICY IF EXISTS "cash_flow_documents_select_own_store" ON public.cash_flow_documents;
CREATE POLICY "cash_flow_documents_select_own_store" ON public.cash_flow_documents
  FOR SELECT TO authenticated
  USING (public.has_store_access(store_id));

GRANT SELECT ON TABLE public.cash_flow_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.cash_flow_documents TO service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE 2 — payment_transactions: ref_type 'cash_flow' + reconciliación LIVE
-- ══════════════════════════════════════════════════════════════════════════

-- R2: columna direction (W7 en la BD viva; en replay fresco se crea aquí y la
-- cadena deja de depender del cambio fuera de banda).
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'in';

ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_direction_check;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_direction_check
  CHECK (direction IN ('in', 'out', 'refund'));

COMMENT ON COLUMN public.payment_transactions.direction IS
  'Origen del flujo (columna W7 2026-08 + ajustes 2026-10 + caja 2026-10): in = entrada de efectivo; out = salida (egreso de caja, ajuste negativo, contra-asiento de anulación de ingreso); refund = contra-asiento de trazabilidad (devoluciones comerciales — NO suma como pago hacia el total del documento).';

-- R1: UNIÓN reconciliada — la lista de la cadena (con 'adjustment') + 'devolution'
-- (release W7 vivo, con 2 filas reales) + 'cash_flow' (este módulo).
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_ref_type_check;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_ref_type_check
  CHECK (ref_type IN ('receipt', 'service', 'production_order', 'work', 'sale', 'commission', 'devolution', 'adjustment', 'cash_flow'));

COMMENT ON CONSTRAINT payment_transactions_ref_type_check ON public.payment_transactions IS
  'PR-4.4I + W7 devolution (vivo 2026-08) + ajustes (2026-10) + ingresos/egresos de caja (2026-10): receipt, service, production_order, work, sale, commission, devolution, adjustment, cash_flow — UNIÓN reconciliada con la BD viva (auditoría 2026-10-21). Para ref_type=cash_flow: direction in = ingreso de efectivo (fondo de cambio y otros), out = egreso; la fila referencia cash_flow_documents.id; anulación = fila contraria, nunca DELETE (PT007).';

CREATE INDEX IF NOT EXISTS idx_payment_txn_cash_flow
  ON public.payment_transactions (store_id, ref_type, payment_date)
  WHERE ref_type = 'cash_flow';

-- R3: índice parcial de los ajustes (de 20261012000001, no aplicado en vivo;
-- en replay fresco ya existe ⇒ IF NOT EXISTS lo hace idempotente).
CREATE INDEX IF NOT EXISTS idx_payment_txn_adjustments
  ON public.payment_transactions (store_id, ref_type, payment_date)
  WHERE ref_type = 'adjustment';

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE 3 — Numeración: tipo 'cash_flow' (prefijo IE) en el mecanismo común
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.document_sequences
  DROP CONSTRAINT IF EXISTS document_sequences_document_type_check;

ALTER TABLE public.document_sequences
  ADD CONSTRAINT document_sequences_document_type_check
  CHECK (document_type IN ('invoice', 'credit_note', 'quotation', 'z_report', 'vale_salida', 'cash_flow'));

COMMENT ON CONSTRAINT document_sequences_document_type_check ON public.document_sequences IS
  'Tipos documentales secuenciados: invoice, credit_note, quotation, z_report, vale_salida (2026-08) y cash_flow (2026-10: documentos Ingresos/Egresos de caja, prefijo IE).';

CREATE OR REPLACE FUNCTION public.next_document_number(
  p_store_id uuid,
  p_document_type text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_year integer := EXTRACT(YEAR FROM NOW())::int;
  v_last integer;
  v_next integer;
  v_prefix text;
  v_result text;
BEGIN
  IF p_document_type NOT IN ('invoice', 'credit_note', 'quotation', 'z_report', 'vale_salida', 'cash_flow') THEN
    RAISE EXCEPTION 'ERR_INVALID_DOCUMENT_TYPE: %', p_document_type;
  END IF;

  -- SELECT FOR UPDATE para atomicidad (dos usuarios concurrentes jamás
  -- obtienen el mismo número: la serialización ocurre dentro de la transacción
  -- del RPC creador, que además toma advisory lock por tienda).
  SELECT last_number INTO v_last
    FROM public.document_sequences
    WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year
    FOR UPDATE;

  IF v_last IS NULL THEN
    -- Primera vez: INSERT
    INSERT INTO public.document_sequences (store_id, document_type, year, last_number)
    VALUES (p_store_id, p_document_type, v_year, 1)
    ON CONFLICT (store_id, document_type, year) DO NOTHING
    RETURNING last_number INTO v_next;

    -- Si ON CONFLICT disparó (race condition), re-select
    IF v_next IS NULL THEN
      SELECT last_number INTO v_last
        FROM public.document_sequences
        WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year
        FOR UPDATE;
      v_next := v_last + 1;
      UPDATE public.document_sequences SET last_number = v_next, updated_at = now()
        WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year;
    END IF;
  ELSE
    -- Ya existe: incrementar
    v_next := v_last + 1;
    UPDATE public.document_sequences SET last_number = v_next, updated_at = now()
      WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year;
  END IF;

  v_prefix := CASE p_document_type
    WHEN 'invoice' THEN 'FAC'
    WHEN 'credit_note' THEN 'NC'
    WHEN 'quotation' THEN 'COT'
    WHEN 'z_report' THEN 'ZR'
    WHEN 'vale_salida' THEN 'VS'
    WHEN 'cash_flow' THEN 'IE'
  END;

  v_result := v_prefix || '-' || LPAD(v_next::text, 6, '0') || '-' || v_year::text;
  RETURN v_result;
END;
$function$;

-- ACL re-declarada IDÉNTICA a la vigente certificada (service_role-only tras
-- la reconciliación ACL de 20260916000002; los creadores la invocan internamente).
REVOKE EXECUTE ON FUNCTION public.next_document_number(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_document_number(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.next_document_number(uuid, text, uuid) IS
  'Iteración Fiscal (F-C1) + vale_salida (2026-08) + cash_flow (2026-10): numeración secuencial por tienda+tipo+año, atómica vía SELECT FOR UPDATE. Formato IE-000001-2026 para ingresos/egresos de caja.';

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE 4 — RPC create_cash_flow_document (service_role-only; la ruta API
--           pasa p_user_id de la sesión verificada — doctrina actor-explícito)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_cash_flow_document(
  p_store_id uuid,
  p_doc_type text,
  p_concept text,
  p_amount numeric,
  p_currency text DEFAULT 'CUP',
  p_exchange_rate numeric DEFAULT NULL,
  p_operation_date timestamptz DEFAULT NULL,
  p_counterparty text DEFAULT NULL,
  p_justification text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_related_document_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_doc_type text := lower(btrim(p_doc_type));
  v_concept text := lower(btrim(COALESCE(p_concept, '')));
  v_amount numeric;
  v_currency text := upper(btrim(COALESCE(p_currency, 'CUP')));
  v_rate numeric;
  v_rate_effective timestamptz;
  v_amount_cup numeric;
  v_op_date timestamptz := COALESCE(p_operation_date, now());
  v_justification text;
  v_shift RECORD;
  v_number text;
  v_doc_id uuid;
  v_payment_id uuid;
  v_opening numeric := 0;
  v_cash_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_cash_flow_in numeric := 0;
  v_cash_flow_out numeric := 0;
  v_expected_cash numeric := 0;
  v_fondo numeric := 0;
  v_param_hash text;
  v_idem jsonb;
  v_result jsonb;
  v_related public.cash_flow_documents%ROWTYPE;
BEGIN
  -- 1. AUTH actor-explícito (fail-closed) + rol con autoridad para registrar
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin', 'manager', 'encargado', 'clerk']::text[]) THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: requiere admin, manager, encargado o clerk en la tienda';
  END IF;

  -- 2. Validación del documento
  IF v_doc_type NOT IN ('ingreso', 'egreso') THEN
    RAISE EXCEPTION 'ERR_INVALID_DOC_TYPE: %', p_doc_type;
  END IF;
  IF v_concept = '' THEN
    RAISE EXCEPTION 'ERR_CONCEPT_REQUIRED';
  END IF;
  IF NOT (
       (v_doc_type = 'ingreso' AND v_concept IN ('constitucion_fondo', 'reposicion_fondo', 'otro_ingreso'))
    OR (v_doc_type = 'egreso'  AND v_concept IN ('devolucion_total_fondo', 'devolucion_parcial_fondo', 'otro_egreso'))
  ) THEN
    RAISE EXCEPTION 'ERR_CONCEPT_TYPE_MISMATCH: concepto % no válido para tipo %', v_concept, v_doc_type;
  END IF;
  v_justification := btrim(COALESCE(p_justification, ''));
  IF v_justification = '' THEN
    RAISE EXCEPTION 'ERR_JUSTIFICATION_REQUIRED';
  END IF;
  IF length(v_justification) > 500 THEN
    RAISE EXCEPTION 'ERR_JUSTIFICATION_TOO_LONG';
  END IF;

  v_amount := COALESCE(p_amount, 0);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_AMOUNT: %', p_amount;
  END IF;
  IF v_amount <> round(v_amount, 2) THEN
    RAISE EXCEPTION 'ERR_AMOUNT_PRECISION: máximo 2 decimales';
  END IF;
  IF v_currency NOT IN ('CUP', 'USD') THEN
    RAISE EXCEPTION 'ERR_INVALID_CURRENCY: %', v_currency;
  END IF;

  -- 3. Tasa de cambio (D8): resolución SERVER-SIDE exclusiva. La tasa del
  --    cliente NO tiene autoridad financiera (se ignora, como en ventas).
  IF v_currency = 'CUP' THEN
    v_rate := 1;
  ELSE
    v_rate := NULL;
    v_rate_effective := NULL;
    SELECT ser.rate, ser.updated_at INTO v_rate, v_rate_effective
      FROM public.store_exchange_rates ser
      WHERE ser.store_id = p_store_id AND ser.currency = 'USD';
    IF v_rate IS NULL THEN
      SELECT er.rate, er.rate_date::timestamptz INTO v_rate, v_rate_effective
        FROM public.exchange_rates er
        WHERE er.currency = 'USD' AND er.source = 'BCC' AND er.segment = '3'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_rate IS NULL THEN
      SELECT er.rate, er.rate_date::timestamptz INTO v_rate, v_rate_effective
        FROM public.exchange_rates er
        WHERE er.currency = 'USD' AND er.source = 'elToque'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_rate IS NULL OR v_rate <= 1 THEN
      RAISE EXCEPTION 'ERR_EXCHANGE_RATE_UNAVAILABLE: configure la tasa USD de la tienda antes de operar en esa moneda';
    END IF;
    IF v_rate_effective < now() - INTERVAL '45 days' THEN
      RAISE EXCEPTION 'ERR_RATE_STALE: effective=%', v_rate_effective;
    END IF;
  END IF;

  v_amount_cup := CASE WHEN v_currency = 'CUP' THEN v_amount ELSE v_amount * v_rate END;

  -- 4. Advisory lock por tienda: serializa creaciones/anulaciones concurrentes
  --    sobre la misma caja (evita doble gasto y carreras sobre el fondo).
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- 5. IDEMPOTENCIA (replay seguro ante reintentos de red)
  v_param_hash := md5(
    p_store_id::text || '|' || v_caller_uid::text || '|' || v_doc_type || '|' || v_concept || '|'
    || v_amount::text || '|' || v_currency || '|' || COALESCE(p_operation_date, 'now')::text || '|'
    || COALESCE(btrim(p_counterparty), '') || '|' || v_justification || '|'
    || COALESCE(btrim(p_notes), '') || '|' || COALESCE(p_related_document_id::text, '')
  );
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    SELECT ir.result INTO v_idem
      FROM public.idempotency_registry ir
      WHERE ir.idempotency_key = p_idempotency_key
        AND ir.operation = 'create_cash_flow_document'
      LIMIT 1;
    IF v_idem IS NOT NULL THEN
      SELECT ir.param_hash INTO v_param_hash
        FROM public.idempotency_registry ir
        WHERE ir.idempotency_key = p_idempotency_key
          AND ir.operation = 'create_cash_flow_document'
        LIMIT 1;
      IF v_param_hash IS NULL OR v_idem IS NULL THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
      END IF;
      -- hash idéntico ⇒ devolver el resultado original (reintento benigno)
      RETURN v_idem;
    END IF;
  END IF;

  -- 6. TURNO ABIERTO obligatorio (D5): sin sesión pendiente no se opera.
  SELECT * INTO v_shift FROM public.cash_closures
    WHERE store_id = p_store_id AND status = 'pendiente'
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_NO_OPEN_SHIFT: la caja no tiene un turno abierto — abra el turno en Caja antes de registrar ingresos o egresos';
  END IF;

  -- 7. FECHA OPERATIVA: política temporal global (piso 6 meses, no futuro,
  --    días hábiles Habana) + ventana del turno (doctrina caja FIJA).
  PERFORM public.validate_operation_date(v_op_date, p_store_id);
  IF v_op_date <= v_shift.created_at OR v_op_date > now() THEN
    RAISE EXCEPTION 'ERR_DATE_OUTSIDE_SHIFT: la fecha operativa debe caer dentro del turno abierto (apertura %)', v_shift.created_at;
  END IF;

  -- 8. SALDO Y FONDO VIGENTES — misma fórmula v2.21.0 que el cierre calculará
  --    (una sola fuente de verdad; se recalcula AHORA bajo advisory lock).
  SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales
    FROM public.transactions
    WHERE store_id = p_store_id AND status = 'completed'
      AND created_at > v_shift.created_at AND created_at <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_shift.created_at AND payment_date <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_shift.created_at AND payment_date <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = p_store_id AND status = 'paid' AND payment_method = 'cash'
      AND paid_at > v_shift.created_at AND paid_at <= now();

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in, v_cash_flow_out
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type = 'cash_flow'
      AND payment_date > v_shift.created_at AND payment_date <= now();

  v_opening := COALESCE(v_shift.opening_balance, 0);
  v_expected_cash := v_opening + v_cash_sales + v_cash_production + v_cash_flow_in
                     - v_cash_outflows - v_cash_commissions - v_cash_flow_out;

  -- Fondo de cambio vigente (D2): apertura + constituciones/reposiciones −
  -- devoluciones (documentos CONFIRMADOS de fondo en la ventana del turno).
  SELECT COALESCE(SUM(
           CASE WHEN doc_type = 'ingreso' THEN amount_cup ELSE -amount_cup END
         ), 0)
    INTO v_fondo
    FROM public.cash_flow_documents
    WHERE store_id = p_store_id
      AND status = 'confirmado'
      AND concept IN ('constitucion_fondo', 'reposicion_fondo',
                      'devolucion_total_fondo', 'devolucion_parcial_fondo')
      AND operation_date > v_shift.created_at
      AND operation_date <= now();
  v_fondo := v_opening + v_fondo;

  -- 9. REGLAS DE NEGOCIO por tipo
  IF v_doc_type = 'egreso' THEN
    -- Imposibilidad de egresar más efectivo del disponible (canonical CUP)
    IF v_amount_cup > v_expected_cash + 0.005 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_CASH: disponible=%, egreso=%', round(v_expected_cash, 2), round(v_amount_cup, 2);
    END IF;
    -- Devolución de fondo: nunca más del fondo vigente (5.000 − 2.000 ⇒ quedan 3.000)
    IF v_concept IN ('devolucion_total_fondo', 'devolucion_parcial_fondo') THEN
      IF v_amount_cup > v_fondo + 0.005 THEN
        RAISE EXCEPTION 'ERR_FUND_INSUFFICIENT: fondo vigente=%, devolución=%', round(v_fondo, 2), round(v_amount_cup, 2);
      END IF;
    END IF;
  END IF;

  -- 10. Vínculo opcional devolución → documento de fondo que la origina
  IF p_related_document_id IS NOT NULL THEN
    IF v_concept NOT IN ('devolucion_total_fondo', 'devolucion_parcial_fondo') THEN
      RAISE EXCEPTION 'ERR_RELATED_DOC_NOT_ALLOWED: solo las devoluciones de fondo pueden vincular un documento origen';
    END IF;
    SELECT * INTO v_related FROM public.cash_flow_documents
      WHERE id = p_related_document_id AND store_id = p_store_id
      FOR UPDATE;
    IF NOT FOUND
       OR v_related.status <> 'confirmado'
       OR v_related.doc_type <> 'ingreso'
       OR v_related.concept NOT IN ('constitucion_fondo', 'reposicion_fondo') THEN
      RAISE EXCEPTION 'ERR_RELATED_DOC_INVALID: el documento origen debe ser una constitución/reposición de fondo confirmada de la misma tienda';
    END IF;
  END IF;

  -- 11. NUMERACIÓN (atómica: FOR UPDATE dentro de esta misma transacción)
  v_number := public.next_document_number(p_store_id, 'cash_flow', v_caller_uid);

  -- 12. INSERT documento (confirmado — D4) + efecto financiero UNA vez (D1)
  INSERT INTO public.cash_flow_documents (
    store_id, document_number, doc_type, concept,
    amount, currency, exchange_rate, payment_method,
    operation_date, status, closure_id, responsible_user_id,
    counterparty, justification, notes, related_document_id,
    created_by, confirmed_by, idempotency_key
  ) VALUES (
    p_store_id, v_number, v_doc_type, v_concept,
    v_amount, v_currency, v_rate, 'cash',
    v_op_date, 'confirmado', v_shift.id, v_caller_uid,
    NULLIF(btrim(COALESCE(p_counterparty, '')), ''),
    v_justification,
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    p_related_document_id,
    v_caller_uid, v_caller_uid,
    NULLIF(btrim(COALESCE(p_idempotency_key, '')), '')
  )
  RETURNING id INTO v_doc_id;

  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, payment_date, notes, paid_by,
    idempotency_key, direction
  ) VALUES (
    p_store_id, 'cash_flow', v_doc_id, v_amount, 'cash',
    v_currency, v_rate, v_op_date,
    v_number || ' · ' || v_concept || ': ' || v_justification,
    v_caller_uid,
    'cf-' || v_doc_id::text,
    CASE v_doc_type WHEN 'ingreso' THEN 'in' ELSE 'out' END
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.cash_flow_documents
    SET payment_transaction_id = v_payment_id
    WHERE id = v_doc_id;

  -- 13. AUDITORÍA atómica (misma transacción)
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'CASH_FLOW_CREATED', 'cash_flow_documents', v_doc_id,
    jsonb_build_object(
      'document_number', v_number,
      'doc_type', v_doc_type,
      'concept', v_concept,
      'amount', v_amount,
      'currency', v_currency,
      'exchange_rate', v_rate,
      'amount_cup', round(v_amount_cup, 2),
      'operation_date', v_op_date,
      'closure_id', v_shift.id,
      'counterparty', NULLIF(btrim(COALESCE(p_counterparty, '')), ''),
      'justification', v_justification,
      'related_document_id', p_related_document_id,
      'cash_before', round(v_expected_cash, 2),
      'fondo_before', round(v_fondo, 2),
      'payment_transaction_id', v_payment_id,
      'formula', 'v2.21.0'
    )
  );

  v_result := jsonb_build_object(
    'status', 'success',
    'document_id', v_doc_id,
    'document_number', v_number,
    'doc_type', v_doc_type,
    'concept', v_concept,
    'amount', v_amount,
    'currency', v_currency,
    'exchange_rate', v_rate,
    'amount_cup', round(v_amount_cup, 2),
    'operation_date', v_op_date,
    'status_doc', 'confirmado',
    'payment_transaction_id', v_payment_id,
    'cash_before', round(v_expected_cash, 2),
    'cash_after', round(v_expected_cash + CASE WHEN v_doc_type = 'ingreso' THEN v_amount_cup ELSE -v_amount_cup END, 2),
    'fondo_before', round(v_fondo, 2),
    'fondo_after', round(
      v_fondo + CASE
        WHEN v_concept IN ('constitucion_fondo', 'reposicion_fondo') THEN v_amount_cup
        WHEN v_concept IN ('devolucion_total_fondo', 'devolucion_parcial_fondo') THEN -v_amount_cup
        ELSE 0
      END, 2)
  );

  -- 14. Registro de idempotencia (después del éxito — patrón v2.26)
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    INSERT INTO public.idempotency_registry (idempotency_key, operation, record_id, param_hash, result)
    VALUES (btrim(p_idempotency_key), 'create_cash_flow_document', v_doc_id, v_param_hash, v_result)
    ON CONFLICT (idempotency_key, operation) DO NOTHING;
  END IF;

  RETURN v_result;
END;
$function$;

-- ACL: service_role-only (único llamador: /api/cash-flow con cliente admin y
-- p_user_id de la sesión verificada)
REVOKE EXECUTE ON FUNCTION public.create_cash_flow_document(uuid, text, text, numeric, text, numeric, timestamptz, text, text, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_cash_flow_document(uuid, text, text, numeric, text, numeric, timestamptz, text, text, text, uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.create_cash_flow_document(uuid, text, text, numeric, text, numeric, timestamptz, text, text, text, uuid, text, uuid) IS
  'MISIÓN INGRESOS/EGRESOS 2026-10: registra un documento Ingreso/Egreso de caja confirmado (fondo de cambio y otros) + UNA fila en payment_transactions(ref_type=cash_flow). Actor-explícito, advisory lock por tienda, turno abierto obligatorio, fecha operativa en ventana (doctrina FIJA), tasa USD server-side, egreso ≤ efectivo disponible, devolución ≤ fondo vigente, numeración IE atómica, idempotencia v2.26 y auditoría atómica. service_role-only.';

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE 5 — RPC reverse_cash_flow_document (anulación con motivo obligatorio)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reverse_cash_flow_document(
  p_document_id uuid,
  p_reason text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_doc public.cash_flow_documents%ROWTYPE;
  v_reason text;
  v_contra_id uuid;
  v_opening numeric := 0;
  v_cash_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_cash_flow_in numeric := 0;
  v_cash_flow_out numeric := 0;
  v_expected_cash numeric := 0;
  v_shift RECORD;
BEGIN
  -- 1. Documento con lock de fila (evita doble anulación concurrente)
  SELECT * INTO v_doc FROM public.cash_flow_documents
    WHERE id = p_document_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_DOCUMENT_NOT_FOUND';
  END IF;

  -- 2. AUTH actor-explícito contra la tienda del documento + rol superior
  --    (anular exige admin/manager/encargado — doctrina de reversas)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_doc.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.has_store_role_as(v_caller_uid, v_doc.store_id, ARRAY['admin', 'manager', 'encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: anular requiere admin, manager o encargado';
  END IF;

  -- 3. Motivo obligatorio (>= 3 caracteres, como el resto de reversas)
  v_reason := btrim(COALESCE(p_reason, ''));
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'ERR_REASON_TOO_LONG';
  END IF;

  -- 4. Advisory lock por tienda (serializa contra creaciones concurrentes)
  PERFORM pg_advisory_xact_lock(hashtext(v_doc.store_id::text));

  -- 5. Estado: solo un confirmado puede anularse (idempotencia de anulación)
  IF v_doc.status <> 'confirmado' THEN
    RAISE EXCEPTION 'ERR_ALREADY_ANNULLED: status=%', v_doc.status;
  END IF;

  -- 6. Anular un INGRESO saca dinero de la caja (fila contra 'out'): exigir
  --    efectivo disponible suficiente para absorber la reversión. Anular un
  --    EGRESO devuelve dinero ('in'): siempre físicamente posible.
  IF v_doc.doc_type = 'ingreso' THEN
    SELECT * INTO v_shift FROM public.cash_closures
      WHERE store_id = v_doc.store_id AND status = 'pendiente'
      ORDER BY created_at DESC LIMIT 1;
    IF v_shift IS NULL THEN
      RAISE EXCEPTION 'ERR_NO_OPEN_SHIFT: no hay turno abierto para registrar la reversión del efectivo';
    END IF;
    SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales
      FROM public.transactions
      WHERE store_id = v_doc.store_id AND status = 'completed'
        AND created_at > v_shift.created_at AND created_at <= now();
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type IN ('receipt', 'service')
        AND payment_date > v_shift.created_at AND payment_date <= now();
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type IN ('production_order', 'work')
        AND payment_date > v_shift.created_at AND payment_date <= now();
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
      FROM public.commission_payments
      WHERE store_id = v_doc.store_id AND status = 'paid' AND payment_method = 'cash'
        AND paid_at > v_shift.created_at AND paid_at <= now();
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
      INTO v_cash_flow_in, v_cash_flow_out
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type = 'cash_flow'
        AND payment_date > v_shift.created_at AND payment_date <= now();
    v_opening := COALESCE(v_shift.opening_balance, 0);
    v_expected_cash := v_opening + v_cash_sales + v_cash_production + v_cash_flow_in
                       - v_cash_outflows - v_cash_commissions - v_cash_flow_out;
    IF v_doc.amount_cup > v_expected_cash + 0.005 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_CASH: anular este ingreso dejaría el efectivo esperado en negativo (disponible=%, reversión=%)', round(v_expected_cash, 2), round(v_doc.amount_cup, 2);
    END IF;
  END IF;

  -- 7. Fila CONTRARIA en el ledger (nunca DELETE ni UPDATE de importes; la
  --    corrección física ocurre AHORA — payment_date = now()). Si el documento
  --    original pertenecía a un turno ya cerrado, ese cierre histórico queda
  --    intacto (sus sumas están congeladas) y la reversión entra a la ventana
  --    del turno actual: procedimiento de corrección sin reabrir historia.
  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, payment_date, notes, paid_by,
    idempotency_key, direction
  ) VALUES (
    v_doc.store_id, 'cash_flow', v_doc.id, v_doc.amount, 'cash',
    v_doc.currency, v_doc.exchange_rate, now(),
    'Anulación ' || v_doc.document_number || ': ' || v_reason,
    v_caller_uid,
    'cf-anul-' || v_doc.id::text,
    CASE v_doc.doc_type WHEN 'ingreso' THEN 'out' ELSE 'in' END
  )
  RETURNING id INTO v_contra_id;

  -- 8. Estado terminal + trazabilidad completa de la anulación
  UPDATE public.cash_flow_documents SET
    status = 'anulado',
    annulled_at = now(),
    annulled_by = v_caller_uid,
    annulment_reason = v_reason,
    annulment_payment_transaction_id = v_contra_id
  WHERE id = v_doc.id;

  -- 9. Auditoría atómica
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_doc.store_id, 'CASH_FLOW_ANNULLED', 'cash_flow_documents', v_doc.id,
    jsonb_build_object(
      'document_number', v_doc.document_number,
      'doc_type', v_doc.doc_type,
      'concept', v_doc.concept,
      'amount', v_doc.amount,
      'currency', v_doc.currency,
      'amount_cup', v_doc.amount_cup,
      'reason', v_reason,
      'before_status', v_doc.status,
      'after_status', 'anulado',
      'annulment_payment_transaction_id', v_contra_id,
      'original_payment_transaction_id', v_doc.payment_transaction_id
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'document_id', v_doc.id,
    'document_number', v_doc.document_number,
    'status_doc', 'anulado',
    'annulled_at', now(),
    'annulled_by', v_caller_uid,
    'annulment_payment_transaction_id', v_contra_id
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reverse_cash_flow_document(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_cash_flow_document(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.reverse_cash_flow_document(uuid, text, uuid) IS
  'MISIÓN INGRESOS/EGRESOS 2026-10: anula un documento confirmado (motivo obligatorio >= 3, rol admin/manager/encargado). Inserta fila CONTRARIA en payment_transactions (payment_date=now()) — nunca borra history ni reabre cierres pasados; marca anulado con annulled_at/by/reason + auditoría atómica. Segunda anulación => ERR_ALREADY_ANNULLED. service_role-only.';

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE 6 — RPC get_cash_flow_summary (lectura para la vista; authenticated)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_cash_flow_summary(
  p_store_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_shift RECORD;
  -- R4: FOUND tras SELECT INTO (la nulidad compuesta de RECORD no sirve:
  -- cash_closures.session_reference es NULL en las filas reales y
  -- `<record> IS NOT NULL` exige TODOS los campos no-nulos ⇒ siempre falso).
  v_has_shift boolean := false;
  v_window_start timestamptz;
  v_opening numeric := 0;
  v_total_sales numeric := 0;
  v_cash_sales numeric := 0;
  v_transfer_sales numeric := 0;
  v_zelle_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_cash_flow_in numeric := 0;
  v_cash_flow_out numeric := 0;
  v_expected_cash numeric := 0;
  v_expected_total numeric := 0;
  v_fondo numeric := 0;
  v_fondo_in numeric := 0;
  v_fondo_out numeric := 0;
  v_from timestamptz;
  v_to timestamptz;
  v_period_in_cup numeric := 0;
  v_period_out_cup numeric := 0;
  v_period_in_cup_cup numeric := 0;
  v_period_in_usd numeric := 0;
  v_period_out_cup_usd numeric := 0;
  v_period_out_usd numeric := 0;
  v_period_in_count integer := 0;
  v_period_out_count integer := 0;
  v_annulled_count integer := 0;
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_REQUIRED';
  END IF;

  -- REM-R2-READ: barrera de autorización (service_role mantiene su capacidad
  -- interna; los humanos necesitan acceso activo a la tienda).
  IF auth.role() <> 'service_role' THEN
    IF NOT public.has_store_access(p_store_id) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: %', p_store_id USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Ventana del turno (idéntica a get_cash_shift_expected v2.21.0)
  SELECT * INTO v_shift FROM public.cash_closures
    WHERE store_id = p_store_id AND status = 'pendiente'
    ORDER BY created_at DESC LIMIT 1;
  v_has_shift := FOUND;
  IF v_has_shift THEN
    v_window_start := v_shift.created_at;
    v_opening := COALESCE(v_shift.opening_balance, 0);
  ELSE
    SELECT closed_at INTO v_window_start FROM public.cash_closures
      WHERE store_id = p_store_id AND status = 'cerrado'
      ORDER BY closed_at DESC LIMIT 1;
    v_window_start := COALESCE(v_window_start, '1970-01-01 00:00:00+00'::timestamptz);
  END IF;

  SELECT COALESCE(SUM(total_amount), 0),
         COALESCE(SUM(cash_amount), 0), COALESCE(SUM(transfer_amount), 0), COALESCE(SUM(zelle_amount), 0)
    INTO v_total_sales, v_cash_sales, v_transfer_sales, v_zelle_sales
    FROM public.transactions
    WHERE store_id = p_store_id AND status = 'completed'
      AND created_at > v_window_start AND created_at <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_window_start AND payment_date <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_window_start AND payment_date <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = p_store_id AND status = 'paid' AND payment_method = 'cash'
      AND paid_at > v_window_start AND paid_at <= now();

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in, v_cash_flow_out
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type = 'cash_flow'
      AND payment_date > v_window_start AND payment_date <= now();

  v_expected_cash := v_opening + v_cash_sales + v_cash_production + v_cash_flow_in
                     - v_cash_outflows - v_cash_commissions - v_cash_flow_out;
  v_expected_total := v_expected_cash + v_transfer_sales + v_zelle_sales;

  -- Fondo de cambio vigente (misma definición que create_cash_flow_document)
  SELECT
    COALESCE(SUM(CASE WHEN doc_type = 'ingreso' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN doc_type = 'egreso' THEN amount_cup ELSE 0 END), 0)
    INTO v_fondo_in, v_fondo_out
    FROM public.cash_flow_documents
    WHERE store_id = p_store_id
      AND status = 'confirmado'
      AND concept IN ('constitucion_fondo', 'reposicion_fondo',
                      'devolucion_total_fondo', 'devolucion_parcial_fondo')
      AND operation_date > v_window_start
      AND operation_date <= now();
  v_fondo := v_opening + v_fondo_in - v_fondo_out;

  -- Período solicitado (default: día de negocio Habana en curso)
  v_from := COALESCE(p_date_from, date_trunc('day', now() AT TIME ZONE 'America/Havana') AT TIME ZONE 'America/Havana');
  v_to := COALESCE(p_date_to, v_from + INTERVAL '1 day' - INTERVAL '1 microsecond');

  SELECT
    COALESCE(SUM(CASE WHEN currency = 'CUP' AND doc_type = 'ingreso' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN currency = 'CUP' AND doc_type = 'egreso' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN currency = 'USD' AND doc_type = 'ingreso' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN currency = 'USD' AND doc_type = 'egreso' THEN amount ELSE 0 END), 0),
    COUNT(*) FILTER (WHERE doc_type = 'ingreso'),
    COUNT(*) FILTER (WHERE doc_type = 'egreso')
    INTO v_period_in_cup, v_period_out_cup, v_period_in_usd, v_period_out_usd,
         v_period_in_count, v_period_out_count
    FROM public.cash_flow_documents
    WHERE store_id = p_store_id
      AND status = 'confirmado'
      AND operation_date >= v_from AND operation_date <= v_to;

  SELECT COUNT(*) INTO v_annulled_count
    FROM public.cash_flow_documents
    WHERE store_id = p_store_id
      AND status = 'anulado'
      AND annulled_at >= v_from AND annulled_at <= v_to;

  v_result := jsonb_build_object(
    'window_start', v_window_start,
    'has_pending_shift', v_has_shift,
    'opening_balance', v_opening,
    'total_sales', v_total_sales,
    'cash_sales', v_cash_sales,
    'cash_outflows', v_cash_outflows,
    'cash_production', v_cash_production,
    'cash_commissions', v_cash_commissions,
    'cash_flow_in', v_cash_flow_in,
    'cash_flow_out', v_cash_flow_out,
    'expected_cash', v_expected_cash,
    'transfer_sales', v_transfer_sales,
    'zelle_sales', v_zelle_sales,
    'expected_total', v_expected_total,
    'fondo_vigente', v_fondo,
    'fondo_ingresado', v_fondo_in,
    'fondo_devuelto', v_fondo_out,
    'period', jsonb_build_object(
      'from', v_from,
      'to', v_to,
      'in_cup', v_period_in_cup,
      'out_cup', v_period_out_cup,
      'in_usd', v_period_in_usd,
      'out_usd', v_period_out_usd,
      'ingresos_count', v_period_in_count,
      'egresos_count', v_period_out_count,
      'annulled_count', v_annulled_count
    )
  );
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_cash_flow_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_flow_summary(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_flow_summary(uuid, timestamptz, timestamptz) TO service_role;

COMMENT ON FUNCTION public.get_cash_flow_summary(uuid, timestamptz, timestamptz) IS
  'MISIÓN INGRESOS/EGRESOS 2026-10: KPIs de la vista Ingresos/Egresos — mismo desglose que get_cash_shift_expected v2.21.0 (incluye cash_flow_in/out) + fondo de cambio vigente + totales del período por moneda y conteos. Barrera REM-R2-READ por tienda.';

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE 7 — close_cash_shift v2.21.0 (término cash_flow in/out — D3)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.close_cash_shift(
  p_closure_id uuid,
  p_declared_cash numeric,
  p_declared_vouchers numeric,
  p_notes text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_closure RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_cash_sales numeric := 0;
  v_transfer_sales numeric := 0;
  v_zelle_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_cash_flow_in numeric := 0;
  v_cash_flow_out numeric := 0;
  v_system_cash numeric := 0;
  v_system_expected_total numeric := 0;
  v_difference numeric := 0;
BEGIN
  -- 1. SELECT FOR UPDATE + validar status
  SELECT * INTO v_closure FROM public.cash_closures WHERE id = p_closure_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_FOUND';
  END IF;

  IF v_closure.status <> 'pendiente' THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_PENDING: status=%', v_closure.status;
  END IF;

  -- 2. Auth (actor-explícito, sin cambios respecto a v2.18.2)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_closure.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. Advisory lock por store
  PERFORM pg_advisory_xact_lock(hashtext(v_closure.store_id::text));

  -- 4. Fórmula v2.21.0 — Efectivo esperado =
  --      Fondo inicial + Entradas de efectivo − Salidas de efectivo
  --    Entradas: ventas cobradas en efectivo (parte cash de ventas mixtas
  --      incluida) + anticipos de órdenes de producción/trabajo en efectivo
  --      + ingresos de caja documentados (fondo de cambio y otros —
  --      ref_type='cash_flow', MISIÓN 2026-10-20).
  --    Salidas: pagos a proveedores en efectivo (recepciones + servicios
  --      recibidos) + comisiones pagadas en efectivo + egresos de caja
  --      documentados (devolución del fondo y otros — ref_type='cash_flow').
  --    NO son efectivo: transferencias y zelle (van a su propio lado del
  --      arqueo); pagos pendientes de documentos (no hay salida de dinero);
  --      cobros de ventas (ref_type='sale') — ya están contados como ventas.
  --    La anulación de un documento inserta fila contraria: el efecto neto
  --      de un documento anulado es CERO en esta fórmula (in + out mismo
  --    importe), sin excluir filas por estado — el ledger siempre manda.

  -- Ventas por canal (columnas de desglose: soportan pago 'mixed')
  SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= NOW();

  SELECT COALESCE(SUM(transfer_amount), 0) INTO v_transfer_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= NOW();

  SELECT COALESCE(SUM(zelle_amount), 0) INTO v_zelle_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= NOW();

  -- Egresos reales de caja — pagos a proveedores en efectivo (recepciones y
  -- servicios recibidos). Excluye ref_type='sale' (cobros de ventas — doble
  -- conteo), 'production_order'/'work' (anticipos = ingresos) y 'commission'.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_closure.created_at
      AND payment_date <= NOW();

  -- Anticipos de producción/trabajo EN EFECTIVO son ENTRADAS de caja.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_closure.created_at
      AND payment_date <= NOW();

  -- Comisiones SOLO en efectivo.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = v_closure.store_id
      AND status = 'paid'
      AND payment_method = 'cash'
      AND paid_at > v_closure.created_at
      AND paid_at <= NOW();

  -- MISIÓN 2026-10-20: documentos Ingresos/Egresos de caja (fondo de cambio
  -- y otros autorizados). direction in = entrada de efectivo, out = salida.
  -- Los anulados aportan fila original + fila contra ⇒ neto cero.
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in, v_cash_flow_out
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type = 'cash_flow'
      AND payment_date > v_closure.created_at
      AND payment_date <= NOW();

  -- Calcular totales
  v_system_cash := COALESCE(v_closure.opening_balance, 0)
                 + v_cash_sales + v_cash_production + v_cash_flow_in
                 - v_cash_outflows - v_cash_commissions - v_cash_flow_out;
  v_system_expected_total := v_system_cash + v_transfer_sales + v_zelle_sales;
  v_difference := (COALESCE(p_declared_cash, 0) + COALESCE(p_declared_vouchers, 0)) - v_system_expected_total;

  -- 5. UPDATE closure con valores recalculados (R5: sin updated_at — la
  --    tabla cash_closures NO tiene esa columna; v2.18.0 vivo la referenciaba
  --    y el cierre de turno rebotaba en runtime desde 2026-10-10)
  UPDATE public.cash_closures SET
    status = 'cerrado',
    closed_at = NOW(),
    declared_cash = p_declared_cash,
    declared_vouchers = p_declared_vouchers,
    declared_total = COALESCE(p_declared_cash, 0) + COALESCE(p_declared_vouchers, 0),
    system_expected_total = v_system_expected_total,
    difference = v_difference,
    notes = p_notes
  WHERE id = p_closure_id;

  -- 6. Audit log atómico
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_closure.store_id, 'CASH_CLOSURE_FINALIZED', 'cash_closures', p_closure_id,
    jsonb_build_object(
      'system_cash', v_system_cash,
      'expected_total', v_system_expected_total,
      'difference', v_difference,
      'formula', 'v2.21.0',
      'cash_sales', v_cash_sales,
      'cash_production_income', v_cash_production,
      'cash_outflows_suppliers', v_cash_outflows,
      'cash_commissions', v_cash_commissions,
      'cash_flow_in', v_cash_flow_in,
      'cash_flow_out', v_cash_flow_out,
      'transfer_sales', v_transfer_sales,
      'zelle_sales', v_zelle_sales
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'system_cash', v_system_cash,
    'system_expected_total', v_system_expected_total,
    'difference', v_difference,
    'cash_sales', v_cash_sales,
    'cash_outflows', v_cash_outflows,
    'cash_production', v_cash_production,
    'cash_commissions', v_cash_commissions,
    'cash_flow_in', v_cash_flow_in,
    'cash_flow_out', v_cash_flow_out,
    'transfer_sales', v_transfer_sales,
    'zelle_sales', v_zelle_sales
  );
END;
$function$;

-- ACL idéntica a la vigente certificada (service_role-only — único llamador:
-- la ruta /api/cash-closures/close con cliente admin)
REVOKE EXECUTE ON FUNCTION public.close_cash_shift(uuid, numeric, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_shift(uuid, numeric, numeric, text, uuid) TO service_role;

COMMENT ON FUNCTION public.close_cash_shift(uuid, numeric, numeric, text, uuid) IS
  'v2.21.0: fórmula de arqueo sin doble conteo + documentos Ingresos/Egresos de caja (ref_type=cash_flow in/out, fondo de cambio y otros; anulados = neto cero por fila contra). Egresos = pagos proveedores cash + egresos documentados; ingresos = ventas cash (split, soporta mixed) + anticipos producción/work cash + ingresos documentados; comisiones solo cash. Transfer/Zelle NO son efectivo.';

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE 8 — get_cash_shift_expected v2.21.0 (espejo UI con cash_flow in/out)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_cash_shift_expected(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_window_start timestamptz;
  v_pending RECORD;
  -- R4: FOUND tras SELECT INTO (la nulidad compuesta de RECORD no sirve:
  -- cash_closures.session_reference es NULL en las filas reales y
  -- `<record> IS NOT NULL` exige TODOS los campos no-nulos ⇒ siempre falso).
  v_has_pending boolean := false;
  v_opening numeric := 0;
  v_total_sales numeric := 0;
  v_cash_sales numeric := 0;
  v_transfer_sales numeric := 0;
  v_zelle_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_cash_flow_in numeric := 0;
  v_cash_flow_out numeric := 0;
  v_expected_cash numeric := 0;
  v_expected_total numeric := 0;
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_REQUIRED';
  END IF;

  -- Ventana del turno: si hay turno PENDIENTE (abierto), desde su created_at
  -- (idéntico a close_cash_shift); si no, desde el último cierre cerrado
  -- (fallback histórico: epoch).
  SELECT * INTO v_pending FROM public.cash_closures
    WHERE store_id = p_store_id AND status = 'pendiente'
    ORDER BY created_at DESC LIMIT 1;
  v_has_pending := FOUND;

  IF v_has_pending THEN
    v_window_start := v_pending.created_at;
    v_opening := COALESCE(v_pending.opening_balance, 0);
  ELSE
    SELECT closed_at INTO v_window_start FROM public.cash_closures
      WHERE store_id = p_store_id AND status = 'cerrado'
      ORDER BY closed_at DESC LIMIT 1;
    v_window_start := COALESCE(v_window_start, '1970-01-01 00:00:00+00'::timestamptz);
  END IF;

  SELECT COALESCE(SUM(total_amount), 0),
         COALESCE(SUM(cash_amount), 0), COALESCE(SUM(transfer_amount), 0), COALESCE(SUM(zelle_amount), 0)
    INTO v_total_sales, v_cash_sales, v_transfer_sales, v_zelle_sales
    FROM public.transactions
    WHERE store_id = p_store_id
      AND status = 'completed'
      AND created_at > v_window_start
      AND created_at <= NOW();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_window_start
      AND payment_date <= NOW();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_window_start
      AND payment_date <= NOW();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = p_store_id
      AND status = 'paid'
      AND payment_method = 'cash'
      AND paid_at > v_window_start
      AND paid_at <= NOW();

  -- MISIÓN 2026-10-20: documentos Ingresos/Egresos de caja (fondo de cambio
  -- y otros). Anulados = neto cero (fila original + fila contra).
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in, v_cash_flow_out
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type = 'cash_flow'
      AND payment_date > v_window_start
      AND payment_date <= NOW();

  v_expected_cash := v_opening + v_cash_sales + v_cash_production + v_cash_flow_in
                     - v_cash_outflows - v_cash_commissions - v_cash_flow_out;
  v_expected_total := v_expected_cash + v_transfer_sales + v_zelle_sales;

  v_result := jsonb_build_object(
    'window_start', v_window_start,
    'has_pending_shift', v_has_pending,
    'opening_balance', v_opening,
    'total_sales', v_total_sales,
    'cash_sales', v_cash_sales,
    'cash_outflows', v_cash_outflows,
    'cash_production', v_cash_production,
    'cash_commissions', v_cash_commissions,
    'cash_flow_in', v_cash_flow_in,
    'cash_flow_out', v_cash_flow_out,
    'expected_cash', v_expected_cash,
    'transfer_sales', v_transfer_sales,
    'zelle_sales', v_zelle_sales,
    'expected_total', v_expected_total
  );
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_cash_shift_expected(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_shift_expected(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_shift_expected(uuid) TO service_role;

COMMENT ON FUNCTION public.get_cash_shift_expected(uuid) IS
  'v2.21.0: desglose del turno en curso para el arqueo (fondo, ventas cash, egresos proveedores cash, anticipos producción cash, comisiones cash, ingresos/egresos de caja documentados cash_flow in/out, efectivo esperado, transferencias, zelle). Misma ventana y fórmula que close_cash_shift v2.21.0.';

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE 9 — get_cash_report: grupo cash_flows + totales (Reporte de Entrega)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_cash_report(
  p_store_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT now() - interval '1 day',
  p_end_date TIMESTAMPTZ DEFAULT now(),
  p_include_all_dates BOOLEAN DEFAULT FALSE
)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_sales JSON;
  v_payments JSON;
  v_commissions JSON;
  v_production JSON;
  v_cash_flow_groups JSON;
  v_totals JSON;
  v_sales_total_cup NUMERIC := 0;
  v_payments_total_cup NUMERIC := 0;
  v_commissions_total_cup NUMERIC := 0;
  v_production_total_cup NUMERIC := 0;
  v_cash_flow_in_total_cup NUMERIC := 0;
  v_cash_flow_out_total_cup NUMERIC := 0;
BEGIN
  -- Ventas por método y moneda (siempre filtradas por fecha)
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_sales
  FROM (
    SELECT payment_method, sale_currency AS currency, COUNT(*) AS transaction_count,
      SUM(total_amount) AS total,
      SUM(total_amount) AS total_cup
    FROM transactions
    WHERE store_id = p_store_id AND created_at >= p_start_date AND created_at <= p_end_date AND status != 'voided'
    GROUP BY payment_method, sale_currency ORDER BY payment_method, sale_currency
  ) t;

  -- Pagos a Proveedores
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_payments
  FROM (
    SELECT payment_method, currency, ref_type, COUNT(*) AS payment_count, SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id
      AND ref_type IN ('receipt', 'service')
      AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date))
    GROUP BY payment_method, currency, ref_type ORDER BY payment_method, currency, ref_type
  ) t;

  -- Comisiones
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_commissions
  FROM (
    SELECT payment_method, currency, COUNT(*) AS commission_count, SUM(final_amount) AS total, SUM(amount_cup) AS total_cup
    FROM commission_payments
    WHERE store_id = p_store_id AND status = 'paid'
      AND (p_include_all_dates OR (paid_at >= p_start_date AND paid_at <= p_end_date))
      AND payment_method IS NOT NULL
    GROUP BY payment_method, currency ORDER BY payment_method, currency
  ) t;

  -- Órdenes de Producción/Servicios
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_production
  FROM (
    SELECT payment_method, currency, ref_type, COUNT(*) AS payment_count,
           SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id
      AND ref_type IN ('production_order', 'work')
      AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date))
    GROUP BY payment_method, currency, ref_type ORDER BY payment_method, currency, ref_type
  ) t;

  -- MISIÓN 2026-10-20: Ingresos/Egresos de caja documentados (fondo de cambio
  -- y otros). GRUPOS agregados por moneda+dirección (las FILAS del ledger
  -- las enriquece /api/cash-report como `cash_flows` — nombres distintos a
  -- propósito para no confundir grupos con detalle). Un documento anulado
  -- aporta original + contra (movimientos físicos reales por fecha), igual
  -- criterio que el arqueo v2.21.0.
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_cash_flow_groups
  FROM (
    SELECT payment_method, currency, direction, COUNT(*) AS flow_count,
           SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id
      AND ref_type = 'cash_flow'
      AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date))
    GROUP BY payment_method, currency, direction ORDER BY currency, direction
  ) t;

  -- Totales
  SELECT COALESCE(SUM(total_amount), 0)
  INTO v_sales_total_cup FROM transactions
  WHERE store_id = p_store_id AND created_at >= p_start_date AND created_at <= p_end_date AND status != 'voided';

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_payments_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type IN ('receipt', 'service')
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_commissions_total_cup
  FROM commission_payments WHERE store_id = p_store_id AND status = 'paid'
  AND (p_include_all_dates OR (paid_at >= p_start_date AND paid_at <= p_end_date));

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_production_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type IN ('production_order', 'work')
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in_total_cup, v_cash_flow_out_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type = 'cash_flow'
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

  SELECT json_build_object(
    'sales_total_cup', v_sales_total_cup,
    'payments_total_cup', v_payments_total_cup,
    'commissions_total_cup', v_commissions_total_cup,
    'production_total_cup', v_production_total_cup,
    'cash_flow_in_total_cup', v_cash_flow_in_total_cup,
    'cash_flow_out_total_cup', v_cash_flow_out_total_cup,
    'balance_cup', v_sales_total_cup + v_production_total_cup
                   + v_cash_flow_in_total_cup
                   - v_payments_total_cup - v_commissions_total_cup - v_cash_flow_out_total_cup
  ) INTO v_totals;

  v_result := json_build_object(
    'sales', v_sales, 'payments', v_payments, 'commissions', v_commissions,
    'production', v_production, 'cash_flow_groups', v_cash_flow_groups, 'totals', v_totals,
    'start_date', p_start_date, 'end_date', p_end_date,
    'include_all_dates', p_include_all_dates
  );
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
REVOKE EXECUTE ON FUNCTION public.get_cash_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cash_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Reversible en DDL (no en datos — la historia documental no se borra):
-- DROP FUNCTION IF EXISTS public.get_cash_flow_summary(uuid, timestamptz, timestamptz);
-- DROP FUNCTION IF EXISTS public.reverse_cash_flow_document(uuid, text, uuid);
-- DROP FUNCTION IF EXISTS public.create_cash_flow_document(uuid, text, text, numeric, text, numeric, timestamptz, text, text, text, uuid, text, uuid);
-- DROP INDEX IF EXISTS public.idx_payment_txn_cash_flow;
-- DROP TABLE IF EXISTS public.cash_flow_documents CASCADE;
-- (close_cash_shift / get_cash_shift_expected / get_cash_report /
--  next_document_number vuelven a su versión previa reaplicando la migración
--  anterior correspondiente; document_sequences/payment_transactions CHECK se
--  restauran sin 'cash_flow' si ya no quedan filas de ese tipo.)
-- ============================================================================
