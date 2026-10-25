-- ═══════════════════════════════════════════════════════════════════════════
-- 20261026200000_efectivo_fisico_disponibilidad.sql
-- MISIÓN P0 «EFECTIVO FANTASMA» (2026-10-26) — El libro físico por moneda
-- como fuente única de la DISPONIBILIDAD de efectivo; la valoración canónica
-- queda clasificada como diferencia de valoración, nunca como billetes.
--
-- INCIDENTE (ENERVIDA-VITALLCONS, verificado READ-ONLY en producción):
--   · get_cash_flow_summary / get_cash_shift_expected devuelven
--     expected_cash = 2.820,00 CUP (valoración canónica de la ventana
--     1970→now: cobros de 367 USD a tasas históricas por 296.420 CUP frente
--     a la entrega de los mismos 367 USD a 800 CUP/USD por 293.600 CUP).
--   · El libro físico (get_cash_currency_summary → net) marca CUP = 0 y
--     USD = 0: los billetes entraron y salieron COMPLETOS.
--   ⇒ El 2.820 NO es efectivo disponible. Ninguna autorización podía usarlo
--     ya (los reductores validan físico por moneda desde 20261024220000 y
--     leen post-lock con tope 'infinity' desde 20261026000000 — verificado
--     vivo), pero los KPIs de resumen lo mostraban como cifra principal.
--
-- CAMBIO DE CONTRATO (aditivo, sin TOUCH de autorizaciones):
--   1. get_cash_shift_expected AÑADE:
--        physical_cash            {CUP, USD} — saldo del libro físico por
--                                  moneda (neto ACUMULADO, MISMA lectura que
--                                  las autorizaciones: tope 'infinity').
--        valuation_residual_cup   expected_cash − physical_cash.CUP. NO
--                                  representa efectivo disponible: recoge la
--                                  valorización de flujos USD a tasas
--                                  históricas y, con turno abierto, la base
--                                  de apertura del turno. Solo informativo.
--   2. get_cash_flow_summary AÑADE exactamente los mismos dos campos (un
--      solo contrato para Inicio→Caja, Ingresos/Egresos y el modal de
--      registro: cada componente deja de tener su propia fórmula).
--   Cuerpos base verbatim de las definiciones VIVAS (20261026000000 para
--   get_cash_shift_expected; 20261024400000 para get_cash_flow_summary) +
--   inserciones quirúrgicas marcadas «MISIÓN EFECTIVO FÍSICO». Ninguna
--   fórmula existente cambia de valor; ningún consumidor se rompe.
--
-- REGLA INVOLABLE que este contrato materializa: si el libro físico marca
-- CUP = 0 y USD = 0, la disponibilidad presentada es 0,00 CUP y 0,00 USD.
-- El residuo de valoración se conserva visible y trazable (campo propio),
-- jamás bajo una etiqueta de efectivo disponible.
--
-- VALIDACIÓN: aditiva e idempotente (CREATE OR REPLACE de funciones STABLE
-- de lectura). Sin escrituras de datos. Sin cambios de ACL. Sin cambios en
-- create/reverse_cash_flow_document, close_cash_shift ni ningún reductor
-- del cajón (los cuerpos autoritativos de 20261026000000 permanecen).
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) get_cash_shift_expected — base viva (20261026000000) + disponibilidad
--    física y residuo de valoración. Consumidores: CajaStatusStrip (Inicio→
--    Caja), CashClosureView (prellenado del arqueo).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_cash_shift_expected(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
  v_cash_refunds numeric := 0;
  v_voucher_refunds numeric := 0;
  v_cash_recoveries numeric := 0;
  v_voucher_recoveries numeric := 0;
  v_expected_cash numeric := 0;
  v_expected_total numeric := 0;
  v_opening_usd numeric := 0;
  v_expected_cash_usd numeric := 0;
  v_window_usd_net numeric := 0;
  -- MISIÓN EFECTIVO FÍSICO (P0 2026-10-26): libro físico acumulado + residuo.
  v_phys_cup numeric := 0;
  v_phys_usd numeric := 0;
  v_valuation_residual numeric := 0;
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
    v_opening_usd := COALESCE(v_pending.opening_balance_usd, 0);
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
      AND created_at <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_window_start
      AND payment_date <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_window_start
      AND payment_date <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = p_store_id
      AND status = 'paid'
      AND payment_method = 'cash'
      AND paid_at > v_window_start
      AND paid_at <= 'infinity'::timestamptz;

  -- Documentos Ingresos/Egresos de caja (fondo de cambio y otros).
  -- Anulados = neto cero (fila original + fila contra).
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in, v_cash_flow_out
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type = 'cash_flow'
      AND payment_date > v_window_start
      AND payment_date <= 'infinity'::timestamptz;

  -- Reembolsos EN EFECTIVO de devoluciones comerciales (P1, 2026-10-21):
  -- mismo término que close_cash_shift v2.23.0 (coherencia espejo↔autoridad).
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_refunds
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type = 'devolution'
      AND direction = 'refund'
      AND payment_date > v_window_start
      AND payment_date <= 'infinity'::timestamptz;

  -- Reembolsos por VOUCHERS (v2.23.0 — base NETA, decisión del propietario
  -- 2026-10-21): mismo término que close_cash_shift (lado vouchers).
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_voucher_refunds
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method IN ('transfer', 'zelle')
      AND ref_type = 'devolution'
      AND direction = 'refund'
      AND payment_date > v_window_start
      AND payment_date <= 'infinity'::timestamptz;

  -- (recuperaciones antes del esperado)
  -- RECUPERACIONES de reembolsos revertidos (MISIÓN DE CIERRE 2026-10-24 §4):
  -- simétrico a los refunds — el dinero que VOLVIÓ por el medio real de cobro.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_recoveries
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type = 'devolution'
      AND direction = 'recovery'
      AND payment_date > v_window_start
      AND payment_date <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_voucher_recoveries
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method IN ('transfer', 'zelle')
      AND ref_type = 'devolution'
      AND direction = 'recovery'
      AND payment_date > v_window_start
      AND payment_date <= 'infinity'::timestamptz;
  v_expected_cash := v_opening + v_cash_sales + v_cash_production + v_cash_flow_in
                     - v_cash_outflows - v_cash_commissions - v_cash_flow_out
                     - v_cash_refunds + v_cash_recoveries;
  v_expected_total := v_expected_cash + v_transfer_sales + v_zelle_sales
                      - v_voucher_refunds + v_voucher_recoveries;

  -- MISIÓN CAJA 2026-10-23 (D8): lado USD FÍSICO de la MISMA ventana (única
  -- fuente de clasificación por moneda — coherente con close_cash_shift v2.24.0).
  SELECT COALESCE((public.get_cash_currency_summary(
             p_store_id, v_window_start, NULL)->'net'->>'USD')::numeric, 0)
    INTO v_window_usd_net;
  v_expected_cash_usd := round(v_opening_usd + v_window_usd_net, 2);

  -- ═══ MISIÓN EFECTIVO FÍSICO (P0 2026-10-26) ═══
  -- Disponibilidad FÍSICA acumulada por moneda: la MISMA lectura que usan las
  -- autorizaciones del cajón (get_cash_currency_summary con tope 'infinity'
  -- — post-inserto, el movimiento ES un hecho físico). El saldo que la UI
  -- presenta como disponible es EXACTAMENTE el que los RPC de autorización
  -- exigen: una sola fuente de verdad, sin fórmulas por componente.
  SELECT
    COALESCE((public.get_cash_currency_summary(
                p_store_id, NULL, 'infinity'::timestamptz)->'net'->>'CUP')::numeric, 0),
    COALESCE((public.get_cash_currency_summary(
                p_store_id, NULL, 'infinity'::timestamptz)->'net'->>'USD')::numeric, 0)
    INTO v_phys_cup, v_phys_usd;

  -- Residuo de valoración: esperado canónico − libro físico CUP. NUNCA es
  -- efectivo disponible: recoge la valorización de flujos en otra moneda a
  -- tasas históricas (p. ej. cobros USD a tasa del ítem vs entrega a tasa
  -- vigente) y, con turno abierto, la base de apertura del turno. Informativo,
  -- trazable en el libro de movimientos; las salidas siguen autorizándose
  -- SOLO contra physical_cash por moneda (sin cambios en los reductores).
  v_valuation_residual := round(v_expected_cash - v_phys_cup, 2);

  v_result := jsonb_build_object(
    'opening_balance_usd', v_opening_usd,
    'expected_cash_usd', v_expected_cash_usd,
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
    'cash_refunds', v_cash_refunds,
    'voucher_refunds', v_voucher_refunds,
    'cash_recoveries', v_cash_recoveries,
    'voucher_recoveries', v_voucher_recoveries,
    'expected_cash', v_expected_cash,
    'transfer_sales', v_transfer_sales,
    'zelle_sales', v_zelle_sales,
    'expected_total', v_expected_total,
    'physical_cash', jsonb_build_object(
      'CUP', round(v_phys_cup, 2),
      'USD', round(v_phys_usd, 2)
    ),
    'valuation_residual_cup', v_valuation_residual
  );
  RETURN v_result;
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) get_cash_flow_summary — base viva (20261024400000) + disponibilidad
--    física y residuo de valoración. Consumidores: Ingresos/Egresos (KPIs y
--    modal de registro), CajaStatusStrip (fondo), API de resumen.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_cash_flow_summary(p_store_id uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
  v_cash_refunds numeric := 0;
  v_voucher_refunds numeric := 0;
  v_cash_recoveries numeric := 0;
  v_voucher_recoveries numeric := 0;
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
  -- MISIÓN EFECTIVO FÍSICO (P0 2026-10-26): libro físico acumulado + residuo.
  v_phys_cup numeric := 0;
  v_phys_usd numeric := 0;
  v_valuation_residual numeric := 0;
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

  -- Ventana del turno (idéntica a get_cash_shift_expected v2.23.0)
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

  -- Reembolsos EN EFECTIVO de devoluciones comerciales (P1, 2026-10-21):
  -- mismo término que close_cash_shift v2.23.0.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_refunds
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type = 'devolution' AND direction = 'refund'
      AND payment_date > v_window_start AND payment_date <= now();

  -- Reembolsos por VOUCHERS (v2.23.0 — base NETA, decisión del propietario
  -- 2026-10-21): mismo término que close_cash_shift (lado vouchers).
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_voucher_refunds
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method IN ('transfer', 'zelle')
      AND ref_type = 'devolution' AND direction = 'refund'
      AND payment_date > v_window_start AND payment_date <= now();

  -- (recuperaciones antes del esperado)
  -- RECUPERACIONES de reembolsos revertidos (MISIÓN DE CIERRE 2026-10-24 §4):
  -- simétrico a los refunds — el dinero que VOLVIÓ por el medio real de cobro.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_recoveries
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type = 'devolution'
      AND direction = 'recovery'
      AND payment_date > v_window_start AND payment_date <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_voucher_recoveries
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method IN ('transfer', 'zelle')
      AND ref_type = 'devolution'
      AND direction = 'recovery'
      AND payment_date > v_window_start AND payment_date <= now();
  v_expected_cash := v_opening + v_cash_sales + v_cash_production + v_cash_flow_in
                     - v_cash_outflows - v_cash_commissions - v_cash_flow_out
                     - v_cash_refunds + v_cash_recoveries;
  v_expected_total := v_expected_cash + v_transfer_sales + v_zelle_sales
                      - v_voucher_refunds + v_voucher_recoveries;

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

  -- ═══ MISIÓN EFECTIVO FÍSICO (P0 2026-10-26) ═══
  -- Misma lectura acumulada por moneda que las autorizaciones del cajón
  -- (tope 'infinity': el inserto ES la entrega de billetes). Los KPIs de
  -- disponibilidad consumen ESTE campo — nunca expected_cash.
  SELECT
    COALESCE((public.get_cash_currency_summary(
                p_store_id, NULL, 'infinity'::timestamptz)->'net'->>'CUP')::numeric, 0),
    COALESCE((public.get_cash_currency_summary(
                p_store_id, NULL, 'infinity'::timestamptz)->'net'->>'USD')::numeric, 0)
    INTO v_phys_cup, v_phys_usd;

  -- Residuo de valoración (canónico − libro físico CUP): informativo, jamás
  -- disponible. Traza: cobros/entregas en otra moneda valorados a tasas
  -- históricas distintas sobre los MISMOS billetes.
  v_valuation_residual := round(v_expected_cash - v_phys_cup, 2);

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
    'cash_refunds', v_cash_refunds,
    'voucher_refunds', v_voucher_refunds,
    'cash_recoveries', v_cash_recoveries,
    'voucher_recoveries', v_voucher_recoveries,
    'expected_cash', v_expected_cash,
    'transfer_sales', v_transfer_sales,
    'zelle_sales', v_zelle_sales,
    'expected_total', v_expected_total,
    'fondo_vigente', v_fondo,
    'fondo_ingresado', v_fondo_in,
    'fondo_devuelto', v_fondo_out,
    'physical_cash', jsonb_build_object(
      'CUP', round(v_phys_cup, 2),
      'USD', round(v_phys_usd, 2)
    ),
    'valuation_residual_cup', v_valuation_residual,
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

-- ACL idénticas a las vivas (sin cambios de permisos).
revoke all on function public.get_cash_shift_expected(uuid) from public;
grant execute on function public.get_cash_shift_expected(uuid) to authenticated, service_role;
revoke all on function public.get_cash_flow_summary(uuid, timestamp with time zone, timestamp with time zone) from public;
grant execute on function public.get_cash_flow_summary(uuid, timestamp with time zone, timestamp with time zone) to service_role;

COMMIT;
