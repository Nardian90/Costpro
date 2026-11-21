-- ============================================================================
-- 20261121230000 — CP-FIN-INV-EXPORT-AND-CONTINUOUS-RECONCILIATION-001 (PR A)
-- Pestaña permanente «Conciliación operativa-contable» en Estados Financieros.
-- ============================================================================
-- MISIÓN: CP-FIN-INV-EXPORT-AND-CONTINUOUS-RECONCILIATION-001
--   OBJETIVO B — comparar de forma permanente el valor calculado desde los
--   módulos OPERATIVOS con el saldo que presenta el MOTOR CONTABLE, aunque la
--   ecuación cuadre y los saldos sean positivos.
--
-- Qué introduce esta migración (idempotente, aditiva, sin tocar datos):
--   §1 fin_reconciliation_config  — tolerancias/materalidad por cuenta
--      (naturaleza-específicas; NUNCA un porcentaje genérico global).
--   §2 fin_reconciliation_snapshots — evidencia histórica de ejecuciones
--      (auditoría; NO reescribe el libro; solo lectura para miembros de la
--      tienda, escritura exclusiva por el RPC de guardado service_role).
--   §3 Helpers internos SECURITY INVOKER (fuera de la superficie DEFINER):
--      fin_ledger_saldo            — saldo del mayor por cuenta+generación.
--      fin_cash_flows_operacional  — flujos de dinero desde fuentes
--      operacionales (payment_transactions + commission_payments + payrolls
--      + aperturas declaradas), INDEPENDIENTES de fin_movements.
--   §4 fin_get_reconciliation — matriz completa por cuenta (RPC de lectura).
--   §5 fin_reconciliation_snapshot_save — persiste una ejecución (writer).
--   §6 fin_reconciliation_history — evolución histórica de diferencias.
--   §7 Corrección de inconsistencia: DEVOLUCION_VENTA v4 — la regla v3
--      (CP-FIN-004) referencia la categoría PAS_CREDITO_TIENDA que NO EXISTE
--      en fin_categories (la semilla crea PAS_ANTICIPOS_CLI): una devolución
--      con store_credit fallaría con violación de FK → fin_posting_errors.
--      v4 restaura la cuenta real PAS_ANTICIPOS_CLI (la misma de v1/v2).
--
-- Qué NO hace:
--   · NO modifica fin_entries/fin_movements existentes (libro inmutable).
--   · NO crea asientos, ajustes ni rectificaciones (misión §4: sin asientos
--     artificiales; el residual del inventario queda IDENTIFICADO, no maquillado).
--   · NO cambia el comportamiento de las vistas existentes de EEFF.
--
-- Convención documentada (misión §5.1):
--   Diferencia = Valor operacional − Valor contable
--   (naturaleza-aware: el valor contable se presenta con el signo natural del
--    rubro — débito−crédito para activo/gasto, crédito−débito para el resto —
--    de modo que la comparación jamás mezcla signos incompatibles).
--
-- Fuentes operacionales (independientes del asiento que verifican — misión
-- §5.3, prohibición de conciliación circular): products, kardex_entries,
-- payment_transactions, transactions/transaction_items, devolutions,
-- receipts/receipt_items, received_services, issue_slips,
-- inventory_adjustments(+items, wac_change_log), commission_payments,
-- payrolls, cash_flow_documents, production_orders, store_credit_ledger,
-- fin_opening_balances (declaración autorizada de apertura).
-- ============================================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- §1. CONFIGURACIÓN DE TOLERANCIAS POR CUENTA (misión §5.4)
--      · tolerancia      — banda de conciliación (precisión 0.01 CUP para
--                          cuentas monetarias de copia exacta).
--      · materialidad_min — umbral absoluto (CUP) de alerta.
--      · materialidad_pct — umbral relativo sobre max(|op|,|contable|).
--      La ALERTA se dispara cuando |diferencia| > max(min, pct·base): una
--      cuenta positiva con valor operacional distinto del mayor ALERTA igual
--      (comportamiento obligatorio de la misión §5.4).
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fin_reconciliation_config (
  category_code text PRIMARY KEY REFERENCES public.fin_categories (code) ON DELETE CASCADE,
  tolerancia numeric NOT NULL DEFAULT 0.01 CHECK (tolerancia >= 0),
  materialidad_min numeric NOT NULL DEFAULT 1.00 CHECK (materialidad_min >= 0),
  materialidad_pct numeric NOT NULL DEFAULT 0 CHECK (materialidad_pct >= 0 AND materialidad_pct <= 1),
  notas text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.fin_reconciliation_config (category_code, tolerancia, materialidad_min, materialidad_pct, notas) VALUES
  -- Inventarios: el WAC vivo es la valoración del sistema; cualquier brecha
  -- frente al mayor es señal de contaminación histórica o faltantes de posting.
  ('ACT_INVENTARIO',       0.01, 100.00, 0.010, 'Brecha esperada documentada (era FAC-VITALLCONS-001): el residual debe verse, no ocultarse.'),
  -- Cuentas monetarias de copia exacta (mismo riel documental): 1 CUP ya es material.
  ('ACT_EFECTIVO_CUP',     0.01,   1.00, 0.000, 'Copia exacta del riel de pagos; la mínima diferencia es investigable.'),
  ('ACT_EFECTIVO_USD',     0.01,   1.00, 0.000, 'Equivalente CUP del efectivo USD (amount_cup).'),
  ('ACT_EFECTIVO_EUR',     0.01,   1.00, 0.000, 'Sin riel POS actualmente (documentado); queda listo si se habilita.'),
  ('ACT_EFECTIVO_MLC',     0.01,   1.00, 0.000, 'Sin riel POS actualmente (documentado); queda listo si se habilita.'),
  ('ACT_BANCOS',           0.01,   1.00, 0.000, 'Transferencias (cualquier moneda) por mapeo canónico.'),
  ('ACT_TRANSF_EXTERIOR',  0.01,   1.00, 0.000, 'Transf. Exterior (external_transfer + zelle heredado).'),
  -- Obligaciones y derechos documentales.
  ('PAS_CXP_PROV',         0.01,   1.00, 0.000, 'Recepciones activas − pagos (misma semántica de fecha del motor: fecha del documento).'),
  ('PAS_SERV_PEND',        0.01,   1.00, 0.000, 'Servicios activos − pagos (ídem).'),
  ('ACT_CXC',              0.01,  10.00, 0.001, 'Órdenes service/work pendientes (presupuesto − pagado) a tasa del documento.'),
  ('ACT_OTROS_CORR',       0.01,  10.00, 0.001, 'Entregas de efectivo para depósito (FLUJO_CAJA v2).'),
  ('PAS_NOMINA_PEND',      0.01,   1.00, 0.000, 'Nóminas confirmadas no pagadas (neto).'),
  ('PAS_RETENCIONES',      0.01,   1.00, 0.000, 'Retenciones de nóminas confirmadas (pendientes de liquidación).'),
  ('PAS_ANTICIPOS_CLI',    0.01,   1.00, 0.000, 'Crédito de tienda (store_credit_ledger).'),
  -- Cuentas de período (requieren from/to): materialidad relativa + piso de 100 CUP.
  ('ING_VENTAS',           0.01, 100.00, 0.005, 'Ventas completadas − devoluciones del período (neteo canónico v4).'),
  ('ING_DESCUENTOS',       0.01, 100.00, 0.005, 'Diferencias de cobro (cobrado − facturado) del período.'),
  ('GAS_COSTO_VENTAS',     0.01, 100.00, 0.005, 'Σ qty×cost_at_sale (fallback cost_average) de ventas − costo devuelto.'),
  ('GAS_VALES',            0.01, 100.00, 0.005, 'Vales completados del período (total_cost).'),
  ('GAS_SERVICIOS',        0.01, 100.00, 0.005, 'Servicios recibidos activos del período.'),
  ('GAS_COMISIONES',       0.01, 100.00, 0.005, 'Comisiones pagadas del período.'),
  ('GAS_NOMINAS',          0.01, 100.00, 0.005, 'Nóminas confirmadas/pagadas del período (gross).'),
  ('GAS_PERDIDA_INV',      0.01, 100.00, 0.005, 'Faltantes de inventario confirmados del período.'),
  ('ING_OTROS_OPER',       0.01, 100.00, 0.005, 'Sobrantes de inventario + ingresos de caja documentados.'),
  ('GAS_OTROS_OPER',       0.01, 100.00, 0.005, 'Egresos de caja ordinarios (≠ entrega_efectivo).')
ON CONFLICT (category_code) DO UPDATE
  SET tolerancia = EXCLUDED.tolerancia,
      materialidad_min = EXCLUDED.materialidad_min,
      materialidad_pct = EXCLUDED.materialidad_pct,
      notas = EXCLUDED.notas,
      updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- §2. SNAPSHOTS DE CONCILIACIÓN (misión §5.7 — evidencia de auditoría)
--      Conserva la matriz por ejecución para observar la EVOLUCIÓN de las
--      diferencias (¿nació ahora? ¿venía de meses atrás? ¿crece? ¿se corrigió?).
--      No duplica movimientos contables: solo la matriz resumida + metadatos.
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fin_reconciliation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  fecha_corte date NOT NULL,
  desde date,
  hasta date,
  generation_id uuid,
  generation_code text,
  metodologia_version text NOT NULL,
  resumen jsonb NOT NULL,
  cuentas jsonb NOT NULL,
  hallazgos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ejecutado_en timestamptz NOT NULL DEFAULT now(),
  ejecutado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_rec_snapshots_store
  ON public.fin_reconciliation_snapshots (store_id, ejecutado_en DESC);

-- ══════════════════════════════════════════════════════════════════════════
-- §3. HELPERS INTERNOS — SECURITY INVOKER (sin superficie DEFINER nueva para
--      el gate; solo invocables desde el cuerpo de los RPC DEFINER o por el
--      propio postgres). Lectura pura.
-- ══════════════════════════════════════════════════════════════════════════

-- §3.1 Saldo del mayor por cuenta y ventana de fecha, sobre una generación.
--      Naturaleza-aware: activo/gasto → débito−crédito; resto → crédito−débito
--      (misma convención de fin_get_balance_sheet).
CREATE OR REPLACE FUNCTION public.fin_ledger_saldo(
  p_store_id uuid, p_category text, p_gen uuid, p_from date, p_to date
) RETURNS TABLE (saldo numeric, movimientos bigint, ultima_fecha date)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = 'public', 'pg_temp'
AS $$
  SELECT round(coalesce(sum(
           CASE WHEN c.clase IN ('activo', 'gasto')
             THEN CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END
             ELSE CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END
           END), 0), 2) AS saldo,
         count(DISTINCT m.entry_id) AS movimientos,
         max(m.economic_date) AS ultima_fecha
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  JOIN public.fin_categories c ON c.code = m.category_code
  WHERE m.store_id = p_store_id
    AND m.category_code = p_category
    AND m.economic_date BETWEEN p_from AND p_to
    AND e.generation_id IS NOT DISTINCT FROM p_gen
$$;

-- §3.2 Flujos de dinero OPERACIONALES por conjunto de medios de pago.
--      Reconstruye el movimiento de la cuenta financiera desde las fuentes
--      operacionales (NUNCA desde fin_movements — prohibición de circularidad,
--      misión §5.3), replicando la semántica documental del motor:
--        · cobros de venta     → fecha económica = transactions.created_at::date
--        · reembolso/recuperación de devolución → devolutions.processed_at::date
--        · flujos de caja      → cash_flow_documents.operation_date::date
--        · pagos a proveedores → fecha del documento (reception_date/service_date,
--          igual que el motor: el asiento de pago lleva la fecha del documento)
--        · anticipos production_order/work → payment_date (sin riel contable:
--          cualquier importe aquí es un HALLAZGO real, no un error del cálculo)
--        · ajustes de caja (ref_type='adjustment') → payment_date (ídem)
--        · comisiones pagadas  → commission_payments.paid_at::date (fuente
--          directa: pay_commission NO escribe payment_transactions)
--        · nóminas pagadas     → payrolls.period_end (semántica del motor)
--      Devuelve {apertura, flujos, n_flujos, desglose} en equivalente CUP
--      (amount_cup), con desglose por origen para el panel de detalle.
CREATE OR REPLACE FUNCTION public.fin_cash_flows_operacional(
  p_store_id uuid, p_methods text[], p_currency text, p_as_of date
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = 'public', 'pg_temp'
AS $$
SELECT jsonb_build_object(
  'apertura', round(coalesce(sum(f.total) FILTER (WHERE f.origen = 'apertura'), 0), 2),
  'flujos', round(coalesce(sum(f.signed) FILTER (WHERE f.origen <> 'apertura'), 0), 2),
  'n_flujos', coalesce(sum(f.n) FILTER (WHERE f.origen <> 'apertura'), 0),
  'desglose', coalesce(jsonb_object_agg(f.origen, f.total)
                         FILTER (WHERE f.origen IS NOT NULL AND f.total <> 0), '{}'::jsonb))
FROM (
  -- Apertura declarada (fuente: declaración autorizada, no el libro)
  SELECT 'apertura'::text AS origen, round(coalesce(sum(ob.amount_cup), 0), 2) AS total,
         0::numeric AS signed, 0::bigint AS n
  FROM public.fin_opening_balances ob
  WHERE ob.store_id = p_store_id AND ob.status = 'applied'
    AND ob.as_of_date <= p_as_of
    AND p_methods = ARRAY['cash']::text[]
    AND ob.category_code = 'ACT_EFECTIVO_' || coalesce(p_currency, 'CUP')
  UNION ALL
  SELECT 'apertura', round(coalesce(sum(ob.amount_cup), 0), 2), 0, 0
  FROM public.fin_opening_balances ob
  WHERE ob.store_id = p_store_id AND ob.status = 'applied'
    AND ob.as_of_date <= p_as_of
    AND p_methods = ARRAY['transfer']::text[] AND ob.category_code = 'ACT_BANCOS'
  UNION ALL
  SELECT 'apertura', round(coalesce(sum(ob.amount_cup), 0), 2), 0, 0
  FROM public.fin_opening_balances ob
  WHERE ob.store_id = p_store_id AND ob.status = 'applied'
    AND ob.as_of_date <= p_as_of
    AND p_methods @> ARRAY['external_transfer']::text[] AND ob.category_code = 'ACT_TRANSF_EXTERIOR'
  -- Cobros de ventas completadas
  UNION ALL
  SELECT 'cobros_ventas', round(coalesce(sum(pt.amount_cup), 0), 2), coalesce(sum(pt.amount_cup), 0),
         count(*)
  FROM public.payment_transactions pt
  JOIN public.transactions t ON t.id = pt.ref_id
  WHERE pt.store_id = p_store_id AND pt.ref_type = 'sale'
    AND coalesce(pt.direction, 'in') = 'in'
    AND pt.payment_method = ANY (p_methods)
    AND (p_currency IS NULL OR pt.currency = p_currency)
    AND t.status = 'completed' AND t.created_at::date <= p_as_of
  -- Reembolsos de devoluciones completadas (salida de dinero)
  UNION ALL
  SELECT 'reembolsos_devoluciones', round(-coalesce(sum(pt.amount_cup), 0), 2), -coalesce(sum(pt.amount_cup), 0),
         count(*)
  FROM public.payment_transactions pt
  JOIN public.devolutions d ON d.id = pt.ref_id
  WHERE pt.store_id = p_store_id AND pt.ref_type = 'devolution'
    AND pt.direction = 'refund'
    AND pt.payment_method = ANY (p_methods)
    AND (p_currency IS NULL OR pt.currency = p_currency)
    AND d.status = 'completed' AND d.processed_at::date <= p_as_of
  -- Recuperaciones de reembolsos (reversa de devolución: vuelve a entrar)
  UNION ALL
  SELECT 'recuperaciones_devoluciones', round(coalesce(sum(pt.amount_cup), 0), 2), coalesce(sum(pt.amount_cup), 0),
         count(*)
  FROM public.payment_transactions pt
  JOIN public.devolutions d ON d.id = pt.ref_id
  WHERE pt.store_id = p_store_id AND pt.ref_type = 'devolution'
    AND pt.direction = 'recovery'
    AND pt.payment_method = ANY (p_methods)
    AND (p_currency IS NULL OR pt.currency = p_currency)
    AND d.status <> 'voided' AND d.processed_at::date <= p_as_of
  -- Flujos de caja documentados (ingreso/egreso; la anulación inserta la fila contraria)
  UNION ALL
  SELECT 'flujos_caja', round(coalesce(sum(CASE WHEN pt.direction = 'in' THEN pt.amount_cup ELSE -pt.amount_cup END), 0), 2),
         coalesce(sum(CASE WHEN pt.direction = 'in' THEN pt.amount_cup ELSE -pt.amount_cup END), 0),
         count(*)
  FROM public.payment_transactions pt
  JOIN public.cash_flow_documents cfd ON cfd.id = pt.ref_id
  WHERE pt.store_id = p_store_id AND pt.ref_type = 'cash_flow'
    AND pt.payment_method = ANY (p_methods)
    AND (p_currency IS NULL OR pt.currency = p_currency)
    AND cfd.operation_date::date <= p_as_of
  -- Pagos a proveedores: recepciones (egreso; fecha del documento como el motor)
  UNION ALL
  SELECT 'pagos_recepciones', round(-coalesce(sum(pt.amount_cup), 0), 2), -coalesce(sum(pt.amount_cup), 0),
         count(*)
  FROM public.payment_transactions pt
  JOIN public.receipts r ON r.id = pt.ref_id
  WHERE pt.store_id = p_store_id AND pt.ref_type = 'receipt'
    AND coalesce(pt.direction, 'in') = 'in'
    AND pt.payment_method = ANY (p_methods)
    AND (p_currency IS NULL OR pt.currency = p_currency)
    AND r.reception_date <= p_as_of
  -- Pagos a proveedores: servicios recibidos
  UNION ALL
  SELECT 'pagos_servicios', round(-coalesce(sum(pt.amount_cup), 0), 2), -coalesce(sum(pt.amount_cup), 0),
         count(*)
  FROM public.payment_transactions pt
  JOIN public.received_services rs ON rs.id = pt.ref_id
  WHERE pt.store_id = p_store_id AND pt.ref_type = 'service'
    AND coalesce(pt.direction, 'in') = 'in'
    AND pt.payment_method = ANY (p_methods)
    AND (p_currency IS NULL OR pt.currency = p_currency)
    AND rs.service_date <= p_as_of
  -- Anticipos de clientes (production_order/work): ENTRADA real de dinero.
  -- El motor NO tiene regla para ORDEN_* (sin asiento): todo importe aquí es
  -- un hallazgo de cobertura, no un error de cálculo.
  UNION ALL
  SELECT 'anticipos_ordenes', round(coalesce(sum(pt.amount_cup), 0), 2), coalesce(sum(pt.amount_cup), 0),
         count(*)
  FROM public.payment_transactions pt
  WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
    AND coalesce(pt.direction, 'in') = 'in'
    AND pt.payment_method = ANY (p_methods)
    AND (p_currency IS NULL OR pt.currency = p_currency)
    AND pt.payment_date::date <= p_as_of
  -- Ajustes de caja (register_cash_adjustment): efectivo físico, sin riel contable.
  UNION ALL
  SELECT 'ajustes_caja', round(coalesce(sum(CASE WHEN pt.direction = 'in' THEN pt.amount_cup ELSE -pt.amount_cup END), 0), 2),
         coalesce(sum(CASE WHEN pt.direction = 'in' THEN pt.amount_cup ELSE -pt.amount_cup END), 0),
         count(*)
  FROM public.payment_transactions pt
  WHERE pt.store_id = p_store_id AND pt.ref_type = 'adjustment'
    AND pt.payment_method = ANY (p_methods)
    AND (p_currency IS NULL OR pt.currency = p_currency)
    AND pt.payment_date::date <= p_as_of
  -- Comisiones pagadas (fuente directa: no pasan por payment_transactions)
  UNION ALL
  SELECT 'comisiones_pagadas',
         round(-coalesce(sum(CASE WHEN c.currency = 'CUP' OR coalesce(c.exchange_rate, 0) <= 0
                              THEN c.final_amount ELSE c.final_amount * c.exchange_rate END), 0), 2),
         -coalesce(sum(CASE WHEN c.currency = 'CUP' OR coalesce(c.exchange_rate, 0) <= 0
                        THEN c.final_amount ELSE c.final_amount * c.exchange_rate END), 0),
         count(*)
  FROM public.commission_payments c
  WHERE c.store_id = p_store_id AND c.status = 'paid'
    AND c.payment_method = ANY (p_methods)
    AND (p_currency IS NULL OR c.currency = p_currency)
    AND c.paid_at::date <= p_as_of
  -- Nóminas pagadas (payment_method del módulo: efectivo/tarjeta)
  UNION ALL
  SELECT 'nominas_pagadas', round(-coalesce(sum(n.total_net), 0), 2), -coalesce(sum(n.total_net), 0),
         count(*)
  FROM public.payrolls n
  WHERE n.store_id = p_store_id AND n.status = 'paid' AND n.currency = 'CUP'
    AND ((p_methods @> ARRAY['cash']::text[] AND n.payment_method = 'efectivo')
      OR (p_methods @> ARRAY['transfer']::text[] AND n.payment_method = 'tarjeta'))
    AND (p_currency IS NULL OR p_currency = 'CUP')
    AND n.period_end <= p_as_of
) f(origen, total, signed, n)
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- §4. RPC PRINCIPAL — MATRIZ DE CONCILIACIÓN OPERATIVA-CONTABLE
--      Una sola sentencia (un solo snapshot de lectura consistente, misión
--      §8): el lado operacional se calcula desde tablas operacionales y el
--      lado contable desde el mayor de la generación activa, AMBOS con la
--      misma fecha de corte / período.
--      Diferencia = valor operacional − valor contable (naturaleza-aware).
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_get_reconciliation(
  p_store_id uuid, p_as_of date,
  p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_gen uuid := public.fin_active_generation(p_store_id);
  v_hist date := '1900-01-01';
  v_met_ver text := 'CP-FIN-REC-001/v1';
  v_res jsonb;
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  WITH
  -- ── Inventario: estadísticas del maestro (valoración WAC del sistema) ──
  inv AS (
    SELECT count(*) AS productos_total,
           count(*) FILTER (WHERE p.stock_current > 0) AS con_stock,
           count(*) FILTER (WHERE p.stock_current = 0) AS stock_cero,
           count(*) FILTER (WHERE p.stock_current < 0) AS stock_negativo,
           round(coalesce(sum(p.stock_current), 0), 2) AS cantidad_total,
           round(coalesce(sum(p.stock_current * coalesce(p.cost_average, 0)), 0), 2) AS valor_wac,
           round(coalesce(sum(p.stock_current * coalesce(p.cost_price, 0)), 0), 2) AS valor_cost_price,
           CASE WHEN coalesce(sum(p.stock_current), 0) <> 0
             THEN round(coalesce(sum(p.stock_current * coalesce(p.cost_average, 0)), 0)
                        / sum(p.stock_current), 4) END AS costo_promedio_ponderado,
           count(*) FILTER (WHERE p.stock_current <> 0 AND coalesce(p.cost_average, 0) = 0) AS sin_costo,
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'sku', x.sku, 'nombre', x.name, 'existencia', x.stock_current,
                     'costo_promedio', x.cost_average, 'valor', x.valor) ORDER BY x.valor DESC), '[]'::jsonb)
            FROM (SELECT p2.sku, p2.name, p2.stock_current, p2.cost_average,
                         round(p2.stock_current * coalesce(p2.cost_average, 0), 2) AS valor
                  FROM public.products p2
                  WHERE p2.store_id = p_store_id AND p2.stock_current <> 0
                  ORDER BY valor DESC LIMIT 15) x) AS top_productos,
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'sku', x.sku, 'nombre', x.name, 'existencia', x.stock_current)
                    ORDER BY x.sku), '[]'::jsonb)
            FROM (SELECT p3.sku, p3.name, p3.stock_current
                  FROM public.products p3
                  WHERE p3.store_id = p_store_id AND p3.stock_current <> 0
                    AND coalesce(p3.cost_average, 0) = 0
                  ORDER BY p3.sku LIMIT 10) x) AS sin_costo_detalle
    FROM public.products p WHERE p.store_id = p_store_id
  ),
  -- Kardex: valor del último saldo por producto al corte (reconstrucción histórica)
  krd AS (
    SELECT round(coalesce(sum(k.balance_total_value), 0), 2) AS valor_kardex,
           count(*) AS productos_con_kardex,
           max(k.ultimo)::date AS ultima_fecha
    FROM (
      SELECT DISTINCT ON (ke.product_id) ke.product_id, ke.balance_total_value,
             max(ke.created_at) OVER () AS ultimo
      FROM public.kardex_entries ke
      WHERE ke.store_id = p_store_id AND ke.created_at::date <= p_as_of
      ORDER BY ke.product_id, ke.created_at DESC
    ) k
  ),
  -- Detector de ventas con fallback de liquidación USD (settlement/carve):
  -- su cobro contable (cob_cash_cup/cob_cash_usd_cup reescritos por el motor)
  -- puede divergir del riel de payment_transactions → calidad PARCIAL en cajas.
  fb AS (
    SELECT count(*) AS n FROM public.transactions t
    WHERE t.store_id = p_store_id AND t.status = 'completed'
      AND t.created_at::date <= p_as_of
      AND coalesce(t.cash_received_usd, 0) - coalesce(t.change_given_usd, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_transactions pt
        WHERE pt.ref_type = 'sale' AND pt.ref_id = t.id
          AND pt.payment_method = 'cash' AND pt.currency = 'USD')
  ),
  -- Cuentas financieras: flujos operacionales por (medios × moneda)
  cash AS (
    SELECT cur.*, (f ->> 'apertura')::numeric AS apertura, (f ->> 'flujos')::numeric AS flujos,
           (f ->> 'n_flujos')::bigint AS n_flujos, f -> 'desglose' AS desglose
    FROM (
      SELECT 'CUP' AS cur, public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'CUP', p_as_of) AS f
      UNION ALL SELECT 'USD', public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'USD', p_as_of)
      UNION ALL SELECT 'EUR', public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'EUR', p_as_of)
      UNION ALL SELECT 'MLC', public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'MLC', p_as_of)
      UNION ALL SELECT 'BANCOS', public.fin_cash_flows_operacional(p_store_id, ARRAY['transfer'], NULL, p_as_of)
      UNION ALL SELECT 'EXTERIOR', public.fin_cash_flows_operacional(p_store_id, ARRAY['external_transfer', 'zelle'], NULL, p_as_of)
    ) cur(cur, f)
  ),
  -- Documentos operacionales postables SIN asiento en la generación activa
  docs_pend AS (
    SELECT 'VENTA' AS tipo, count(*) AS n FROM public.transactions t
    WHERE t.store_id = p_store_id AND t.status = 'completed' AND t.created_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'VENTA'
                        AND e.document_id = t.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'DEVOLUCION_VENTA', count(*) FROM public.devolutions d
    WHERE d.store_id = p_store_id AND d.status = 'completed' AND d.processed_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'DEVOLUCION_VENTA'
                        AND e.document_id = d.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'RECEPCION', count(*) FROM public.receipts r
    WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'RECEPCION'
                        AND e.document_id = r.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'SERVICIO_RECIBIDO', count(*) FROM public.received_services s
    WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'SERVICIO_RECIBIDO'
                        AND e.document_id = s.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'VALE_SALIDA', count(*) FROM public.issue_slips i
    WHERE i.store_id = p_store_id AND i.status = 'completed' AND i.created_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'VALE_SALIDA'
                        AND e.document_id = i.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'AJUSTE_INVENTARIO', count(*) FROM public.inventory_adjustments a
    WHERE a.store_id = p_store_id AND a.status = 'confirmed' AND a.confirmed_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'AJUSTE_INVENTARIO'
                        AND e.document_id = a.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'COMISION', count(*) FROM public.commission_payments c
    WHERE c.store_id = p_store_id AND c.status = 'paid' AND c.paid_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'COMISION'
                        AND e.document_id = c.id AND e.event = 'pago'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'NOMINA', count(*) FROM public.payrolls n
    WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'NOMINA'
                        AND e.document_id = n.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'FLUJO_CAJA', count(*) FROM public.cash_flow_documents cfd
    WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado' AND cfd.operation_date::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'FLUJO_CAJA'
                        AND e.document_id = cfd.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
  ),
  -- Asientos cuyo documento de origen YA NO EXISTE en la tabla fuente
  sin_resp AS (
    SELECT e.document_type AS tipo, count(*) AS n
    FROM public.fin_entries e
    WHERE e.store_id = p_store_id AND e.generation_id IS NOT DISTINCT FROM v_gen
      AND e.document_id IS NOT NULL AND e.economic_date <= p_as_of
      AND (e.document_type = 'VENTA' AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = e.document_id)
        OR e.document_type = 'DEVOLUCION_VENTA' AND NOT EXISTS (SELECT 1 FROM public.devolutions d WHERE d.id = e.document_id)
        OR e.document_type = 'RECEPCION' AND NOT EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = e.document_id)
        OR e.document_type = 'SERVICIO_RECIBIDO' AND NOT EXISTS (SELECT 1 FROM public.received_services s WHERE s.id = e.document_id)
        OR e.document_type = 'VALE_SALIDA' AND NOT EXISTS (SELECT 1 FROM public.issue_slips i WHERE i.id = e.document_id)
        OR e.document_type = 'AJUSTE_INVENTARIO' AND NOT EXISTS (SELECT 1 FROM public.inventory_adjustments a WHERE a.id = e.document_id)
        OR e.document_type = 'COMISION' AND NOT EXISTS (SELECT 1 FROM public.commission_payments c WHERE c.id = e.document_id)
        OR e.document_type = 'NOMINA' AND NOT EXISTS (SELECT 1 FROM public.payrolls n WHERE n.id = e.document_id)
        OR e.document_type = 'FLUJO_CAJA' AND NOT EXISTS (SELECT 1 FROM public.cash_flow_documents cfd WHERE cfd.id = e.document_id))
    GROUP BY e.document_type
  ),
  -- ── Lado OPERACIONAL por cuenta (UNION: una fila por cuenta conciliable) ──
  op AS (
    -- ACT_INVENTARIO · valoración WAC del sistema (hoy) o kardex al corte (histórico)
    SELECT 'ACT_INVENTARIO' AS cuenta, false AS es_periodo, 10::int AS orden,
           CASE WHEN p_as_of < CURRENT_DATE THEN krd.valor_kardex ELSE inv.valor_wac END AS valor_op,
           inv.con_stock AS docs_op,
           (SELECT max(sm.created_at)::date FROM public.stock_movements sm WHERE sm.store_id = p_store_id) AS ultima_op,
           CASE WHEN inv.sin_costo > 0
                 OR inv.con_stock <> krd.productos_con_kardex
                 OR p_as_of < CURRENT_DATE
                THEN 'PARCIAL' ELSE 'COMPLETA' END::text AS calidad,
           CASE WHEN p_as_of < CURRENT_DATE
             THEN 'Valor según Kardex al corte (último saldo por producto): reconstrucción histórica documental.'
             ELSE 'Σ products.stock_current × cost_average (WAC — método de valoración del sistema). Fuente viva del maestro de productos.' END AS metodologia,
           ARRAY['products', 'kardex_entries', 'stock_movements']::text[] AS fuentes,
           jsonb_build_object(
             'productos_total', inv.productos_total, 'con_stock_positivo', inv.con_stock,
             'stock_cero', inv.stock_cero, 'stock_negativo', inv.stock_negativo,
             'cantidad_total', inv.cantidad_total, 'valor_wac', inv.valor_wac,
             'valor_cost_price', inv.valor_cost_price, 'valor_kardex', krd.valor_kardex,
             'costo_promedio_ponderado', inv.costo_promedio_ponderado,
             'productos_sin_costo', inv.sin_costo, 'sin_costo_detalle', inv.sin_costo_detalle,
             'top_productos', inv.top_productos,
             'diferencia_wac_kardex', round(inv.valor_wac - krd.valor_kardex, 2),
             'documentos_pendientes', coalesce((SELECT jsonb_object_agg(tipo, n) FROM (SELECT tipo, n FROM docs_pend WHERE n > 0 AND tipo IN ('VENTA','DEVOLUCION_VENTA','RECEPCION','VALE_SALIDA','AJUSTE_INVENTARIO')) z), '{}'::jsonb),
             'movimientos_sin_respaldo', coalesce((SELECT jsonb_object_agg(tipo, n) FROM (SELECT tipo, n FROM sin_resp WHERE tipo IN ('VENTA','DEVOLUCION_VENTA','RECEPCION','VALE_SALIDA','AJUSTE_INVENTARIO')) z), '{}'::jsonb),
             'nota_corte', CASE WHEN p_as_of < CURRENT_DATE THEN 'Corte histórico: el valor vivo del maestro refleja HOY; se usa el Kardex al corte como fuente primaria.' END) AS detalle
    FROM inv CROSS JOIN krd
    -- Cajas por moneda (medio = efectivo físico)
    UNION ALL
    SELECT 'ACT_EFECTIVO_' || c.cur, false, 11,
           c.apertura + c.flujos, c.n_flujos,
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
             WHERE pt.store_id = p_store_id AND pt.payment_method = 'cash'
               AND pt.currency = c.cur AND pt.payment_date::date <= p_as_of),
           CASE WHEN (c.cur IN ('CUP', 'USD') AND fb.n > 0) THEN 'PARCIAL' ELSE 'COMPLETA' END,
           'Apertura declarada + flujos operacionales de payment_transactions/comisiones/nóminas por (efectivo × ' || c.cur || '), en equivalente CUP (amount_cup). Réplica de la semántica de fechas del motor.',
           ARRAY['payment_transactions', 'cash_flow_documents', 'commission_payments', 'payrolls', 'fin_opening_balances']::text[],
           jsonb_build_object('apertura', c.apertura, 'flujos', c.flujos, 'desglose', c.desglose,
             'ventas_con_fallback_usd', fb.n,
             'documentos_pendientes', coalesce((SELECT jsonb_object_agg(tipo, n) FROM (SELECT tipo, n FROM docs_pend WHERE n > 0 AND tipo IN ('VENTA','DEVOLUCION_VENTA','FLUJO_CAJA','COMISION','NOMINA','RECEPCION','SERVICIO_RECIBIDO')) z), '{}'::jsonb))
    FROM cash c CROSS JOIN fb WHERE c.cur IN ('CUP', 'USD', 'EUR', 'MLC')
    -- Bancos (transferencias, cualquier moneda)
    UNION ALL
    SELECT 'ACT_BANCOS', false, 12,
           c.apertura + c.flujos, c.n_flujos,
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
             WHERE pt.store_id = p_store_id AND pt.payment_method = 'transfer'
               AND pt.payment_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + flujos por transferencia (cualquier moneda) según mapeo canónico fin_account_mapping (transfer × * → ACT_BANCOS).',
           ARRAY['payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('apertura', c.apertura, 'flujos', c.flujos, 'desglose', c.desglose)
    FROM cash c WHERE c.cur = 'BANCOS'
    -- Transferencias del exterior (external_transfer + zelle heredado)
    UNION ALL
    SELECT 'ACT_TRANSF_EXTERIOR', false, 13,
           c.apertura + c.flujos, c.n_flujos,
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
             WHERE pt.store_id = p_store_id AND pt.payment_method IN ('external_transfer', 'zelle')
               AND pt.payment_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + flujos Transf. Exterior (external_transfer canónico + zelle heredado normalizado), equivalente CUP.',
           ARRAY['payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('apertura', c.apertura, 'flujos', c.flujos, 'desglose', c.desglose)
    FROM cash c WHERE c.cur = 'EXTERIOR'
    -- Cuentas por cobrar: órdenes service/work pendientes
    UNION ALL
    SELECT 'ACT_CXC', false, 14,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'ACT_CXC' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(greatest(o.budget_total - o.paid_amount, 0)
                * CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP' THEN 1
                       ELSE coalesce(o.budget_exchange_rate, 1) END), 2)
              FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND o.status <> 'voided' AND o.order_date <= p_as_of), 0),
           (SELECT count(*) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND o.status <> 'voided' AND o.order_date <= p_as_of
               AND greatest(o.budget_total - o.paid_amount, 0) > 0.01),
           (SELECT max(o.order_date) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND o.status <> 'voided' AND o.order_date <= p_as_of),
           'PARCIAL',
           'Apertura declarada + Σ (budget_total − paid_amount) de órdenes service/work no anuladas, a la tasa del propio documento. El motor NO tiene regla para ORDEN_*: todo saldo aquí es un hallazgo de cobertura contable (dinero/mercado por documentar), no un error de cálculo.',
           ARRAY['production_orders', 'fin_opening_balances']::text[],
           jsonb_build_object(
             'ordenes_pendientes', (SELECT count(*) FROM public.production_orders o
               WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
                 AND o.status <> 'voided' AND o.order_date <= p_as_of
                 AND greatest(o.budget_total - o.paid_amount, 0) > 0.01),
             'anticipos_cobrados', coalesce((SELECT round(sum(pt.amount_cup), 2) FROM public.payment_transactions pt
               WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                 AND coalesce(pt.direction, 'in') = 'in' AND pt.payment_date::date <= p_as_of), 0))
    -- Entregas de efectivo para depósito (ACT_OTROS_CORR · FLUJO_CAJA v2)
    UNION ALL
    SELECT 'ACT_OTROS_CORR', false, 15,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'ACT_OTROS_CORR' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(cfd.amount_cup), 2) FROM public.cash_flow_documents cfd
              WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
                AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
                AND cfd.operation_date::date <= p_as_of), 0),
           (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
               AND cfd.operation_date::date <= p_as_of),
           (SELECT max(cfd.operation_date)::date FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
               AND cfd.operation_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ entregas de efectivo confirmadas (cash_flow_documents egreso/entrega_efectivo → ACT_OTROS_CORR, regla FLUJO_CAJA v2).',
           ARRAY['cash_flow_documents', 'fin_opening_balances']::text[],
           jsonb_build_object('entregas_confirmadas', (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
               AND cfd.operation_date::date <= p_as_of))
    -- Cuentas por pagar a proveedores: recepciones activas − pagos
    UNION ALL
    SELECT 'PAS_CXP_PROV', false, 30,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_CXP_PROV' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(x.total - x.pagos), 2) FROM (
                SELECT r.id,
                       (SELECT coalesce(sum(ri.quantity * ri.unit_cost * coalesce(NULLIF(ri.tasa_cambio_recepcion, 0), 1)), 0)
                          FROM public.receipt_items ri WHERE ri.receipt_id = r.id) AS total,
                       (SELECT coalesce(sum(pt.amount_cup), 0) FROM public.payment_transactions pt
                         WHERE pt.ref_type = 'receipt' AND pt.ref_id = r.id
                           AND coalesce(pt.direction, 'in') = 'in') AS pagos
                FROM public.receipts r
                WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of) x), 0),
           (SELECT count(*) FROM public.receipts r
             WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of),
           (SELECT max(r.reception_date) FROM public.receipts r
             WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ recepciones activas (Σ receipt_items qty×unit_cost×tasa) − pagos registrados (payment_transactions). Misma semántica de fecha del motor: el asiento de pago lleva la fecha del documento.',
           ARRAY['receipts', 'receipt_items', 'payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('recepciones_activas', (SELECT count(*) FROM public.receipts r
             WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of))
    -- Servicios pendientes de pago
    UNION ALL
    SELECT 'PAS_SERV_PEND', false, 31,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_SERV_PEND' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(x.total - x.pagos), 2) FROM (
                SELECT s.id,
                       CASE WHEN coalesce(s.currency, 'CUP') = 'CUP' OR coalesce(s.exchange_rate, 0) <= 0
                            THEN coalesce(s.total_amount, 0)
                            ELSE coalesce(s.total_amount, 0) * s.exchange_rate END AS total,
                       (SELECT coalesce(sum(pt.amount_cup), 0) FROM public.payment_transactions pt
                         WHERE pt.ref_type = 'service' AND pt.ref_id = s.id
                           AND coalesce(pt.direction, 'in') = 'in') AS pagos
                FROM public.received_services s
                WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of) x), 0),
           (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of),
           (SELECT max(s.service_date) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ servicios activos (total × tasa documental) − pagos registrados. Misma métrica del motor (fin_compute_metrics SERVICIO_RECIBIDO).',
           ARRAY['received_services', 'payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('servicios_activos', (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of))
    -- Nómina pendiente (confirmada, no pagada: neto)
    UNION ALL
    SELECT 'PAS_NOMINA_PEND', false, 32,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_NOMINA_PEND' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(n.total_net), 2) FROM public.payrolls n
              WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.currency = 'CUP'
                AND n.period_end <= p_as_of), 0),
           (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.period_end <= p_as_of),
           (SELECT max(n.period_end) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.period_end <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ total_net de nóminas confirmadas (devengadas) no pagadas. El pago cancela la obligación (regla NOMINA v1: np-neto-d).',
           ARRAY['payrolls', 'fin_opening_balances']::text[],
           jsonb_build_object('nominas_confirmadas', (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.period_end <= p_as_of))
    -- Retenciones de nómina (pendientes de liquidación)
    UNION ALL
    SELECT 'PAS_RETENCIONES', false, 33,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_RETENCIONES' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(n.total_deductions), 2) FROM public.payrolls n
              WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
                AND n.currency = 'CUP' AND n.period_end <= p_as_of), 0),
           (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of),
           (SELECT max(n.period_end) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ total_deductions de nóminas confirmadas/pagadas (las retenciones permanecen hasta su liquidación — regla NOMINA v1).',
           ARRAY['payrolls', 'fin_opening_balances']::text[],
           jsonb_build_object('nominas_con_retenciones', (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of))
    -- Crédito de tienda (store credit)
    UNION ALL
    SELECT 'PAS_ANTICIPOS_CLI', false, 36,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_ANTICIPOS_CLI' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(scl.amount), 2) FROM public.store_credit_ledger scl
              WHERE scl.store_id = p_store_id AND scl.created_at::date <= p_as_of), 0),
           (SELECT count(*) FROM public.store_credit_ledger scl
             WHERE scl.store_id = p_store_id AND scl.created_at::date <= p_as_of),
           (SELECT max(scl.created_at)::date FROM public.store_credit_ledger scl
             WHERE scl.store_id = p_store_id AND scl.created_at::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ store_credit_ledger (positivo = crédito emitido por devolución; negativo = compensación por reversa). Sin mecanismo de redención en el sistema (documentado).',
           ARRAY['store_credit_ledger', 'fin_opening_balances']::text[],
           jsonb_build_object('creditos_emitidos', (SELECT count(*) FROM public.store_credit_ledger scl
             WHERE scl.store_id = p_store_id AND scl.amount > 0 AND scl.created_at::date <= p_as_of))
    -- ══ Cuentas de PERÍODO (mismo rango que el Estado de Rendimiento) ══
    -- Ingresos por ventas (neteo canónico v4: ventas − devoluciones)
    UNION ALL
    SELECT 'ING_VENTAS', true, 60,
           round(coalesce((SELECT sum(t.total_amount) FROM public.transactions t
               WHERE t.store_id = p_store_id AND t.status = 'completed'
                 AND t.created_at::date BETWEEN p_from AND p_to), 0)
               - coalesce((SELECT sum(d.total_amount) FROM public.devolutions d
               WHERE d.store_id = p_store_id AND d.status = 'completed'
                 AND d.processed_at::date BETWEEN p_from AND p_to), 0), 2),
           (SELECT count(*) FROM public.transactions t
             WHERE t.store_id = p_store_id AND t.status = 'completed'
               AND t.created_at::date BETWEEN p_from AND p_to)
           + (SELECT count(*) FROM public.devolutions d
             WHERE d.store_id = p_store_id AND d.status = 'completed'
               AND d.processed_at::date BETWEEN p_from AND p_to),
           (SELECT max(d.processed_at)::date FROM public.devolutions d
             WHERE d.store_id = p_store_id AND d.status = 'completed'
               AND d.processed_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total_amount de ventas completadas − Σ devoluciones completadas del período (neteo canónico de la regla VENTA v4: d-ing-d debita ING_VENTAS).',
           ARRAY['transactions', 'devolutions']::text[],
           jsonb_build_object(
             'ventas_completadas', (SELECT count(*) FROM public.transactions t
               WHERE t.store_id = p_store_id AND t.status = 'completed'
                 AND t.created_at::date BETWEEN p_from AND p_to),
             'devoluciones', (SELECT count(*) FROM public.devolutions d
               WHERE d.store_id = p_store_id AND d.status = 'completed'
                 AND d.processed_at::date BETWEEN p_from AND p_to))
    -- Descuentos / diferencias de cobro
    UNION ALL
    SELECT 'ING_DESCUENTOS', true, 66,
           round(coalesce((SELECT sum(pt.amount_cup)
               FROM public.payment_transactions pt
               JOIN public.transactions t ON t.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type = 'sale'
                AND coalesce(pt.direction, 'in') = 'in'
                AND t.status = 'completed'
                AND t.created_at::date BETWEEN p_from AND p_to), 0)
             - coalesce((SELECT sum(t.total_amount) FROM public.transactions t
               WHERE t.store_id = p_store_id AND t.status = 'completed'
                 AND t.created_at::date BETWEEN p_from AND p_to), 0), 2),
           (SELECT count(*) FROM public.transactions t
             WHERE t.store_id = p_store_id AND t.status = 'completed'
               AND t.created_at::date BETWEEN p_from AND p_to),
           NULL::date,
           CASE WHEN (SELECT fb2.n FROM fb fb2) > 0 THEN 'PARCIAL' ELSE 'COMPLETA' END,
           'Σ (cobrado − facturado) de las ventas del período (diferencia_cobro de la métrica del motor; presentación crédito−débito). Las ventas con fallback de liquidación USD pueden divergir del riel de pagos.',
           ARRAY['transactions', 'payment_transactions']::text[],
           jsonb_build_object('ventas_con_fallback_usd', (SELECT fb2.n FROM fb fb2))
    -- Costo de ventas (WAC congelado a la venta − costo devuelto)
    UNION ALL
    SELECT 'GAS_COSTO_VENTAS', true, 70,
           round(coalesce((SELECT sum(ti.quantity * coalesce(NULLIF(ti.cost_at_sale, 0), p.cost_average, 0))
               FROM public.transaction_items ti
               JOIN public.transactions t ON t.id = ti.transaction_id
               LEFT JOIN public.products p ON p.id = ti.product_id
              WHERE t.store_id = p_store_id AND t.status = 'completed'
                AND t.created_at::date BETWEEN p_from AND p_to), 0)
             - coalesce((SELECT sum(di.quantity * coalesce(NULLIF(oti.cost_at_sale, 0), p.cost_average, 0))
               FROM public.devolution_items di
               JOIN public.devolutions d ON d.id = di.devolution_id
               LEFT JOIN public.transaction_items oti
                 ON oti.transaction_id = d.original_transaction_id AND oti.product_id = di.product_id
               LEFT JOIN public.products p ON p.id = di.product_id
              WHERE d.store_id = p_store_id AND d.status = 'completed'
                AND d.processed_at::date BETWEEN p_from AND p_to), 0), 2),
           (SELECT count(*) FROM public.transactions t
             WHERE t.store_id = p_store_id AND t.status = 'completed'
               AND t.created_at::date BETWEEN p_from AND p_to),
           NULL::date,
           'COMPLETA',
           'Σ qty×COALESCE(cost_at_sale, cost_average) de ventas completadas − costo devuelto de devoluciones (misma fórmula de fin_compute_metrics v5: costo_productos_cup y costo_devuelto_cup). El costo queda CONGELADO a la venta (DF-02): no se recalcula.',
           ARRAY['transaction_items', 'devolution_items', 'products']::text[],
           jsonb_build_object(
             'nota', 'COGS histórico congelado (cost_at_sale de la era de cada venta). La brecha frente al inventario vivo de la era FAC-VITALLCONS-001 está documentada en el expediente CP-FIN-003 §5.1.')
    -- Vales de salida (consumo interno)
    UNION ALL
    SELECT 'GAS_VALES', true, 74,
           coalesce((SELECT round(sum(i.total_cost), 2) FROM public.issue_slips i
              WHERE i.store_id = p_store_id AND i.status = 'completed'
                AND i.created_at::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.issue_slips i
             WHERE i.store_id = p_store_id AND i.status = 'completed'
               AND i.created_at::date BETWEEN p_from AND p_to),
           (SELECT max(i.created_at)::date FROM public.issue_slips i
             WHERE i.store_id = p_store_id AND i.status = 'completed'
               AND i.created_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total_cost de vales completados del período (métrica costo_cup del motor).',
           ARRAY['issue_slips']::text[],
           jsonb_build_object('vales_completados', (SELECT count(*) FROM public.issue_slips i
             WHERE i.store_id = p_store_id AND i.status = 'completed'
               AND i.created_at::date BETWEEN p_from AND p_to))
    -- Servicios recibidos (gasto)
    UNION ALL
    SELECT 'GAS_SERVICIOS', true, 71,
           coalesce((SELECT round(sum(CASE WHEN coalesce(s.currency, 'CUP') = 'CUP' OR coalesce(s.exchange_rate, 0) <= 0
                        THEN coalesce(s.total_amount, 0)
                        ELSE coalesce(s.total_amount, 0) * s.exchange_rate END), 2)
              FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to),
           (SELECT max(s.service_date) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total×tasa de servicios recibidos activos del período (métrica total_cup del motor).',
           ARRAY['received_services']::text[],
           jsonb_build_object('servicios_activos', (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to))
    -- Comisiones pagadas
    UNION ALL
    SELECT 'GAS_COMISIONES', true, 73,
           coalesce((SELECT round(sum(CASE WHEN coalesce(c.currency, 'CUP') = 'CUP' OR coalesce(c.exchange_rate, 0) <= 0
                        THEN coalesce(c.final_amount, 0)
                        ELSE coalesce(c.final_amount, 0) * c.exchange_rate END), 2)
              FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to),
           (SELECT max(c.paid_at)::date FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ final_amount×tasa de comisiones pagadas del período (métrica total_cup del motor; gasto y pago en el mismo evento).',
           ARRAY['commission_payments']::text[],
           jsonb_build_object('comisiones_pagadas', (SELECT count(*) FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to))
    -- Nóminas (gasto devengado)
    UNION ALL
    SELECT 'GAS_NOMINAS', true, 72,
           coalesce((SELECT round(sum(n.total_gross), 2) FROM public.payrolls n
              WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
                AND n.currency = 'CUP' AND n.period_end BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
               AND n.period_end BETWEEN p_from AND p_to),
           (SELECT max(n.period_end) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
               AND n.period_end BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total_gross de nóminas confirmadas/pagadas del período (métrica total_gross_cup del motor).',
           ARRAY['payrolls']::text[],
           jsonb_build_object('nominas', (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
               AND n.period_end BETWEEN p_from AND p_to))
    -- Pérdidas de inventario (faltantes confirmados, valorados al WAC del momento)
    UNION ALL
    SELECT 'GAS_PERDIDA_INV', true, 75,
           coalesce((SELECT round(sum((-i.difference) * coalesce(NULLIF(w.wac, 0), p.cost_average, 0))
                 FILTER (WHERE i.difference < 0), 2)
              FROM public.inventory_adjustments a
              JOIN public.inventory_adjustment_items i ON i.adjustment_id = a.id
              JOIN public.products p ON p.id = i.product_id
              LEFT JOIN LATERAL (
                SELECT wcl.wac_after AS wac FROM public.wac_change_log wcl
                WHERE wcl.product_id = i.product_id AND wcl.store_id = a.store_id
                  AND wcl.created_at <= a.confirmed_at
                ORDER BY wcl.created_at DESC LIMIT 1) w ON true
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.inventory_adjustments a
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to),
           (SELECT max(a.confirmed_at)::date FROM public.inventory_adjustments a
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ faltantes (difference<0 × WAC del momento del ajuste según wac_change_log, fallback cost_average) de ajustes confirmados — métrica valor_faltante_cup del motor.',
           ARRAY['inventory_adjustments', 'inventory_adjustment_items', 'wac_change_log', 'products']::text[],
           jsonb_build_object('ajustes_confirmados', (SELECT count(*) FROM public.inventory_adjustments a
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to))
    -- Otros ingresos operacionales (sobrantes + ingresos de caja)
    UNION ALL
    SELECT 'ING_OTROS_OPER', true, 62,
           round(coalesce((SELECT sum(i.difference * coalesce(NULLIF(w.wac, 0), p.cost_average, 0))
                 FILTER (WHERE i.difference > 0)
              FROM public.inventory_adjustments a
              JOIN public.inventory_adjustment_items i ON i.adjustment_id = a.id
              JOIN public.products p ON p.id = i.product_id
              LEFT JOIN LATERAL (
                SELECT wcl.wac_after AS wac FROM public.wac_change_log wcl
                WHERE wcl.product_id = i.product_id AND wcl.store_id = a.store_id
                  AND wcl.created_at <= a.confirmed_at
                ORDER BY wcl.created_at DESC LIMIT 1) w ON true
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to), 0)
             + coalesce((SELECT sum(cfd.amount_cup) FROM public.cash_flow_documents cfd
              WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
                AND cfd.doc_type = 'ingreso'
                AND cfd.operation_date::date BETWEEN p_from AND p_to), 0), 2),
           (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'ingreso'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           (SELECT max(cfd.operation_date)::date FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'ingreso'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ sobrantes de inventario (WAC del momento) + ingresos de caja documentados del período (reglas AJUSTE_INVENTARIO v1 y FLUJO_CAJA v2: fc-in-c).',
           ARRAY['inventory_adjustments', 'inventory_adjustment_items', 'wac_change_log', 'cash_flow_documents']::text[],
           jsonb_build_object('ingresos_caja', coalesce((SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'ingreso'
               AND cfd.operation_date::date BETWEEN p_from AND p_to), 0))
    -- Otros gastos operacionales (egresos de caja ordinarios ≠ entrega_efectivo)
    UNION ALL
    SELECT 'GAS_OTROS_OPER', true, 81,
           coalesce((SELECT round(sum(cfd.amount_cup), 2) FROM public.cash_flow_documents cfd
              WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
                AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
                AND cfd.operation_date::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           (SELECT max(cfd.operation_date)::date FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ egresos de caja ordinarios confirmados (concepto ≠ entrega_efectivo) del período — regla FLUJO_CAJA v2: fc-eg-d.',
           ARRAY['cash_flow_documents']::text[],
           jsonb_build_object('egresos_confirmados', (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
               AND cfd.operation_date::date BETWEEN p_from AND p_to))
  ),
  -- ── Lado CONTABLE (mayor de la generación activa, ventana por naturaleza) ──
  led AS (
    SELECT o.cuenta, o.es_periodo, o.orden, o.valor_op, o.docs_op, o.ultima_op,
           o.calidad, o.metodologia, o.fuentes, o.detalle,
           c.name AS nombre, c.clase, c.grupo, c.sort_order,
           CASE WHEN o.es_periodo THEN lper.saldo ELSE lcut.saldo END AS valor_contable,
           CASE WHEN o.es_periodo THEN lper.movimientos ELSE lcut.movimientos END AS movs,
           CASE WHEN o.es_periodo THEN lper.ultima_fecha ELSE lcut.ultima_fecha END AS ultima_cont
    FROM op o
    JOIN public.fin_categories c ON c.code = o.cuenta
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, o.cuenta, v_gen, v_hist, p_as_of) ls) lcut ON true
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, o.cuenta, v_gen, p_from, p_to) ls) lper ON true
  ),
  calc AS (
    SELECT l.*,
           round(l.valor_op - l.valor_contable, 2) AS diferencia,
           round(coalesce(cf.tolerancia, 0.01), 2) AS tolerancia,
           greatest(coalesce(cf.materialidad_min, 1), round(coalesce(cf.materialidad_pct, 0)
                 * greatest(abs(l.valor_op), abs(l.valor_contable)), 2)) AS materialidad
    FROM led l LEFT JOIN public.fin_reconciliation_config cf ON cf.category_code = l.cuenta
  ),
  final_rows AS (
    SELECT calc.cuenta, calc.nombre, calc.clase, calc.grupo, calc.sort_order,
           calc.es_periodo,
           CASE WHEN calc.es_periodo AND (p_from IS NULL OR p_to IS NULL) THEN NULL
                ELSE calc.valor_op END AS valor_operacional,
           calc.valor_contable,
           CASE WHEN calc.es_periodo AND (p_from IS NULL OR p_to IS NULL) THEN NULL
                ELSE calc.diferencia END AS diferencia,
           CASE WHEN abs(calc.valor_contable) > 0.005
             THEN round(abs(calc.valor_op - calc.valor_contable) / abs(calc.valor_contable) * 100, 2) END AS diferencia_pct,
           CASE
             WHEN calc.es_periodo AND (p_from IS NULL OR p_to IS NULL) THEN 'PENDIENTE'
             WHEN calc.calidad = 'SIN_FUENTE' THEN 'INCOMPLETO'
             WHEN abs(calc.diferencia) <= calc.tolerancia
               THEN CASE WHEN calc.calidad = 'PARCIAL' THEN 'INCOMPLETO' ELSE 'CONCILIADO' END
             WHEN abs(calc.diferencia) > calc.materialidad THEN 'ALERTA'
             ELSE 'DIFERENCIA'
           END AS estado,
           calc.tolerancia, calc.materialidad,
           calc.docs_op AS documentos_operacionales, calc.movs AS movimientos_contables,
           calc.ultima_op AS ultima_fecha_operacional, calc.ultima_cont AS ultima_fecha_contable,
           calc.calidad, calc.metodologia, calc.fuentes, calc.detalle,
           calc.orden
    FROM calc
    UNION ALL
    -- Resto del catálogo: SIN fuente operacional independiente (misión §5.3)
    SELECT c.code, c.name, c.clase, c.grupo, c.sort_order,
           (c.clase IN ('ingreso', 'gasto')) AS es_periodo,
           NULL::numeric AS valor_operacional,
           CASE WHEN c.clase IN ('ingreso', 'gasto') AND (p_from IS NULL OR p_to IS NULL) THEN NULL
                ELSE CASE WHEN c.clase IN ('ingreso', 'gasto')
                     THEN lper.saldo ELSE lcut.saldo END END AS valor_contable,
           NULL::numeric AS diferencia, NULL::numeric AS diferencia_pct,
           CASE WHEN c.clase IN ('ingreso', 'gasto') AND (p_from IS NULL OR p_to IS NULL)
             THEN 'PENDIENTE' ELSE 'NO_CONCILIABLE' END AS estado,
           NULL::numeric AS tolerancia, NULL::numeric AS materialidad,
           NULL::bigint AS documentos_operacionales,
           CASE WHEN c.clase IN ('ingreso', 'gasto') THEN lper.movimientos ELSE lcut.movimientos END AS movimientos_contables,
           NULL::date AS ultima_fecha_operacional,
           CASE WHEN c.clase IN ('ingreso', 'gasto') THEN lper.ultima_fecha ELSE lcut.ultima_fecha END AS ultima_fecha_contable,
           'SIN_FUENTE' AS calidad,
           'NO CONCILIABLE — FALTA FUENTE OPERACIONAL: ninguna tabla operativa independiente respalda esta cuenta (sin módulo documental que la genere).' AS metodologia,
           ARRAY[]::text[] AS fuentes,
           NULL::jsonb AS detalle,
           c.sort_order AS orden
    FROM public.fin_categories c
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, c.code, v_gen, v_hist, p_as_of) ls) lcut ON true
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, c.code, v_gen, p_from, p_to) ls) lper ON true
    WHERE c.is_active AND NOT EXISTS (SELECT 1 FROM op o WHERE o.cuenta = c.code)
  )
  SELECT jsonb_build_object(
    'ejecucion', jsonb_build_object(
      'calculado_en', now(),
      'fecha_corte', p_as_of,
      'desde', p_from, 'hasta', p_to,
      'generacion', (SELECT jsonb_build_object('id', id, 'code', code)
                     FROM public.fin_posting_generations WHERE id = v_gen),
      'metodologia_version', v_met_ver,
      'fuentes_actualizadas', jsonb_build_object(
        'products', (SELECT max(updated_at)::text FROM public.products WHERE store_id = p_store_id),
        'inventory', (SELECT max(updated_at)::text FROM public.inventory WHERE store_id = p_store_id),
        'stock_movements', (SELECT max(created_at)::text FROM public.stock_movements WHERE store_id = p_store_id),
        'kardex_entries', (SELECT max(created_at)::text FROM public.kardex_entries WHERE store_id = p_store_id),
        'payment_transactions', (SELECT max(created_at)::text FROM public.payment_transactions WHERE store_id = p_store_id),
        'transactions', (SELECT max(created_at)::text FROM public.transactions WHERE store_id = p_store_id),
        'receipts', (SELECT max(created_at)::text FROM public.receipts WHERE store_id = p_store_id),
        'received_services', (SELECT max(created_at)::text FROM public.received_services WHERE store_id = p_store_id),
        'issue_slips', (SELECT max(created_at)::text FROM public.issue_slips WHERE store_id = p_store_id),
        'fin_entries', (SELECT max(posted_at)::text FROM public.fin_entries
                         WHERE store_id = p_store_id AND generation_id IS NOT DISTINCT FROM v_gen)),
      'convention', 'Diferencia = valor operacional − valor contable (naturaleza-aware).'),
    'resumen', jsonb_build_object(
      'conciliadas', count(*) FILTER (WHERE r.estado = 'CONCILIADO'),
      'diferencias', count(*) FILTER (WHERE r.estado = 'DIFERENCIA'),
      'alertas', count(*) FILTER (WHERE r.estado = 'ALERTA'),
      'incompletas', count(*) FILTER (WHERE r.estado = 'INCOMPLETO'),
      'no_conciliables', count(*) FILTER (WHERE r.estado = 'NO_CONCILIABLE'),
      'pendientes', count(*) FILTER (WHERE r.estado = 'PENDIENTE'),
      'documentos_pendientes', coalesce((SELECT sum(n) FROM docs_pend), 0),
      'movimientos_sin_respaldo', coalesce((SELECT sum(n) FROM sin_resp), 0)),
    'hallazgos', jsonb_build_object(
      'documentos_pendientes', coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'pendientes', n)
                          ORDER BY tipo) FROM docs_pend WHERE n > 0), '[]'::jsonb),
      'movimientos_sin_respaldo', coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'n', n)
                          ORDER BY tipo) FROM sin_resp), '[]'::jsonb),
      'ventas_con_fallback_usd', max(fb.n)),
    'cuentas', coalesce(jsonb_agg(row_to_json(r) ORDER BY r.orden), '[]'::jsonb))
  INTO v_res
  FROM final_rows r, fb;

  RETURN v_res;
END $function$;

-- ══════════════════════════════════════════════════════════════════════════
-- §5. GUARDADO DE SNAPSHOT (misión §5.7 — evidencia histórica de auditoría)
--      Recalcula SERVER-SIDE (nunca confía en un payload del cliente) y
--      persiste la matriz. Requiere nivel de gestión (can_manage_store_as):
--      guardar evidencia es una acción de administración de la tienda.
--      VOLATILE (escribe); canal canónico service_role (la API autoriza con
--      withAuth y canManageStore antes de invocar).
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_reconciliation_snapshot_save(
  p_store_id uuid, p_as_of date,
  p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_res jsonb; v_id uuid;
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.can_manage_store_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  v_res := public.fin_get_reconciliation(p_store_id, p_as_of, p_from, p_to, v_caller);

  INSERT INTO public.fin_reconciliation_snapshots (
    store_id, fecha_corte, desde, hasta, generation_id, generation_code,
    metodologia_version, resumen, cuentas, hallazgos, ejecutado_por)
  VALUES (
    p_store_id, p_as_of, p_from, p_to,
    (v_res -> 'ejecucion' -> 'generacion' ->> 'id')::uuid,
    v_res -> 'ejecucion' -> 'generacion' ->> 'code',
    v_res -> 'ejecucion' ->> 'metodologia_version',
    v_res -> 'resumen', v_res -> 'cuentas',
    v_res -> 'hallazgos', v_caller)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('run_id', v_id, 'ejecutado_en', now(),
                            'resumen', v_res -> 'resumen');
END $function$;

-- ══════════════════════════════════════════════════════════════════════════
-- §6. HISTORIAL DE SNAPSHOTS (evolución de diferencias — misión §5.7)
--      Metadatos + resumen por ejecución (las cuentas completas quedan en la
--      tabla para análisis forense; este RPC no las duplica en la respuesta).
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_reconciliation_history(
  p_store_id uuid, p_limit integer DEFAULT 20, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', s.id, 'fecha_corte', s.fecha_corte, 'desde', s.desde, 'hasta', s.hasta,
             'generacion', s.generation_code, 'metodologia_version', s.metodologia_version,
             'resumen', s.resumen, 'ejecutado_en', s.ejecutado_en, 'ejecutado_por', s.ejecutado_por)
           ORDER BY s.ejecutado_en DESC)
    FROM (SELECT * FROM public.fin_reconciliation_snapshots
           WHERE store_id = p_store_id
           ORDER BY ejecutado_en DESC
           LIMIT greatest(coalesce(p_limit, 20), 1)) s
  ), '[]'::jsonb);
END $function$;

-- ══════════════════════════════════════════════════════════════════════════
-- §7. CORRECCIÓN DE INCONSISTENCIA (misión OBJETIVO A / §13 PR A)
--      DEFECTO LATENTE: la regla DEVOLUCION_VENTA v3 (CP-FIN-004,
--      20261120210000 §22, línea d-credit) referencia la categoría
--      PAS_CREDITO_TIENDA, que NO EXISTE en fin_categories (la semilla de la
--      base crea PAS_ANTICIPOS_CLI «Anticipos recibidos de clientes», la
--      misma que usaban v1/v2). Mientras una devolución no pague con
--      store_credit la condición filtra la línea y el FK nunca se evalúa;
--      el día que ocurra, fin_post_documentSafe registraría el asiento en
--      fin_posting_errors (violación de FK) y la devolución quedaría SIN
--      respaldo contable. v4 restaura la cuenta real SIN cambio de
--      comportamiento para las devoluciones existentes (GEN-1/GEN-2 no
--      tienen movimientos store_credit: la política de re-derivación es
--      estable ante este cambio — una re-derivación futura produce los
--      mismos asientos).
-- ══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fin_rule_versions
             WHERE document_type = 'DEVOLUCION_VENTA' AND store_id IS NULL
               AND notes LIKE '%CP-FIN-REC-001%') THEN
    RAISE NOTICE 'DEVOLUCION_VENTA: regla CP-FIN-REC-001 ya presente — omisión idempotente';
  ELSE
    UPDATE public.fin_rule_versions
      SET status = 'inactive', deactivated_at = now(),
          notes = coalesce(notes, '') || ' | Sustituida por CP-FIN-REC-001 (cuenta real PAS_ANTICIPOS_CLI: PAS_CREDITO_TIENDA no existe en el catálogo).'
      WHERE document_type = 'DEVOLUCION_VENTA' AND store_id IS NULL AND status = 'active';
    INSERT INTO public.fin_rule_versions (document_type, store_id, version, status, movements, effective_from, notes)
    SELECT 'DEVOLUCION_VENTA', NULL, coalesce(max(version), 0) + 1, 'active', '[
      {"id":"d-ref-cash","evento":"reconocimiento","categoria":"ACT_EFECTIVO_CUP","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_cash_cup"},"condicion":{"campo":"reembolso_cash_cup","op":">","valor":0},"orden":1},
      {"id":"d-ref-cash-usd","evento":"reconocimiento","categoria":"ACT_EFECTIVO_USD","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_cash_usd_cup"},"condicion":{"campo":"reembolso_cash_usd_cup","op":">","valor":0},"orden":2},
      {"id":"d-ref-transf","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_transfer_cup"},"condicion":{"campo":"reembolso_transfer_cup","op":">","valor":0},"orden":3},
      {"id":"d-ref-transf-usd","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_transfer_usd_cup"},"condicion":{"campo":"reembolso_transfer_usd_cup","op":">","valor":0},"orden":4},
      {"id":"d-ref-ext-usd","evento":"reconocimiento","categoria":"ACT_TRANSF_EXTERIOR","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_external_transfer_usd_cup"},"condicion":{"campo":"reembolso_external_transfer_usd_cup","op":">","valor":0},"orden":5},
      {"id":"d-ref-zelle","evento":"reconocimiento","categoria":"ACT_TRANSF_EXTERIOR","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_zelle_usd_cup"},"condicion":{"campo":"reembolso_zelle_usd_cup","op":">","valor":0},"orden":6},
      {"id":"d-inv-d","evento":"reconocimiento","categoria":"ACT_INVENTARIO","sentido":"debito","origen":{"tipo":"metrica","metrica":"costo_devuelto_cup"},"condicion":{"campo":"costo_devuelto_cup","op":">","valor":0},"orden":7},
      {"id":"d-cogs-c","evento":"reconocimiento","categoria":"GAS_COSTO_VENTAS","sentido":"credito","origen":{"tipo":"metrica","metrica":"costo_devuelto_cup"},"condicion":{"campo":"costo_devuelto_cup","op":">","valor":0},"orden":8},
      {"id":"d-ing-d","evento":"reconocimiento","categoria":"ING_VENTAS","sentido":"debito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":null,"orden":9},
      {"id":"d-credit","evento":"reconocimiento","categoria":"PAS_ANTICIPOS_CLI","sentido":"credito","origen":{"tipo":"metrica","metrica":"store_credit_cup"},"condicion":{"campo":"store_credit_cup","op":">","valor":0},"orden":10}
    ]'::jsonb, CURRENT_DATE,
      'CP-FIN-REC-001: idéntica a v3 (CP-FIN-004) con la corrección de la línea d-credit — la categoría PAS_CREDITO_TIENDA no existe en fin_categories; el crédito de tienda contabiliza en PAS_ANTICIPOS_CLI (misma cuenta que v1/v2).'
    FROM public.fin_rule_versions WHERE document_type = 'DEVOLUCION_VENTA' AND store_id IS NULL;
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- §8. RLS, ACL Y SANITY CHECKS (fail-closed, patrón del repo)
-- ══════════════════════════════════════════════════════════════════════════

-- RLS: lectura por membresía de tienda (patrón fin_posting_generations);
-- SIN políticas de escritura → escritura exclusiva por el canal service_role
-- (RPC SECURITY DEFINER fin_reconciliation_snapshot_save).
ALTER TABLE public.fin_reconciliation_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fin_reconciliation_snapshots_select ON public.fin_reconciliation_snapshots;
CREATE POLICY fin_reconciliation_snapshots_select ON public.fin_reconciliation_snapshots
  FOR SELECT TO authenticated
  USING (public.is_admin_check(auth.uid()) OR public.has_store_access_as(auth.uid(), store_id));

DROP POLICY IF EXISTS fin_reconciliation_config_select ON public.fin_reconciliation_config;
CREATE POLICY fin_reconciliation_config_select ON public.fin_reconciliation_config
  FOR SELECT TO authenticated USING (true);

-- ENABLE también en la tabla de configuración: una política SELECT sin RLS
-- habilitado no filtra nada (la tabla queda legible para todo grantee). Canon
-- del repo = ENABLE + política; sin ENABLE el anon (sin grant) no ve nada por
-- ACL, pero el contrato de seguridad exige RLS activo en ambas tablas.
ALTER TABLE public.fin_reconciliation_config ENABLE ROW LEVEL SECURITY;

-- Grants de tabla: lectura a authenticated, sin escritura directa.
REVOKE ALL ON public.fin_reconciliation_snapshots FROM PUBLIC, anon;
GRANT SELECT ON public.fin_reconciliation_snapshots TO authenticated, service_role;
REVOKE ALL ON public.fin_reconciliation_config FROM PUBLIC, anon;
GRANT SELECT ON public.fin_reconciliation_config TO authenticated, service_role;

-- ACL de funciones: canal canónico service_role (idéntico a los RPC de
-- informes CP-FIN: withAuth en la API + admin.rpc + p_user_id del session).
REVOKE EXECUTE ON FUNCTION public.fin_get_reconciliation(uuid, date, date, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_get_reconciliation(uuid, date, date, date, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fin_reconciliation_snapshot_save(uuid, date, date, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_reconciliation_snapshot_save(uuid, date, date, date, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fin_reconciliation_history(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_reconciliation_history(uuid, integer, uuid) TO service_role;
-- Helpers INTERNOS (SECURITY INVOKER): sin EXECUTE para anon; los RPC los
-- invocan con los privilegios del canal autorizado.
REVOKE EXECUTE ON FUNCTION public.fin_ledger_saldo(uuid, text, uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_cash_flows_operacional(uuid, text[], text, date) FROM PUBLIC, anon;

-- Comentarios de trazabilidad.
COMMENT ON FUNCTION public.fin_get_reconciliation(uuid, date, date, date, uuid) IS
  'CP-FIN-REC-001: matriz de conciliación operativa-contable por cuenta (fuentes operativas independientes vs mayor de la generación activa, misma fecha de corte). Diferencia = operacional − contable (naturaleza-aware). Estados CONCILIADO/DIFERENCIA/ALERTA/INCOMPLETO/NO_CONCILIABLE/PENDIENTE con tolerancias por cuenta (fin_reconciliation_config).';
COMMENT ON FUNCTION public.fin_reconciliation_snapshot_save(uuid, date, date, date, uuid) IS
  'CP-FIN-REC-001: persiste una ejecución de la conciliación (recalculada server-side; requiere can_manage_store_as). Evidencia de auditoría para seguir la evolución de las diferencias — NO reescribe el libro.';
COMMENT ON FUNCTION public.fin_reconciliation_history(uuid, integer, uuid) IS
  'CP-FIN-REC-001: historial de snapshots de conciliación (metadatos + resumen por ejecución).';
COMMENT ON TABLE public.fin_reconciliation_snapshots IS
  'CP-FIN-REC-001: snapshots de conciliación operativa-contable (auditoría; lectura por membresía, escritura solo service_role vía RPC).';
COMMENT ON TABLE public.fin_reconciliation_config IS
  'CP-FIN-REC-001: tolerancias y materialidad por cuenta (naturaleza-específicas; nunca un porcentaje genérico).';

-- Sanity checks fail-closed (un fallo aquí revierte la migración completa).
DO $$
DECLARE
  v_n int;
BEGIN
  -- 1) RLS activo y sin políticas de escritura en snapshots.
  SELECT count(*) INTO v_n FROM pg_tables
   WHERE tablename = 'fin_reconciliation_snapshots' AND rowsecurity;
  IF v_n <> 1 THEN RAISE EXCEPTION 'SANITY_FAIL: fin_reconciliation_snapshots sin RLS'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE tablename = 'fin_reconciliation_snapshots' AND cmd <> 'SELECT';
  IF v_n <> 0 THEN RAISE EXCEPTION 'SANITY_FAIL: snapshots NO debe tener políticas de escritura (canal service_role exclusivo)'; END IF;

  -- 2) Ningún privilegio para anon en los nuevos objetos.
  SELECT count(*) INTO v_n FROM information_schema.table_privileges
   WHERE grantee = 'anon' AND table_name IN ('fin_reconciliation_snapshots', 'fin_reconciliation_config');
  IF v_n <> 0 THEN RAISE EXCEPTION 'SANITY_FAIL: anon tiene privilegios sobre tablas de conciliación'; END IF;
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
   WHERE grantee = 'anon'
     AND routine_name IN ('fin_get_reconciliation', 'fin_reconciliation_snapshot_save',
                          'fin_reconciliation_history', 'fin_ledger_saldo', 'fin_cash_flows_operacional');
  IF v_n <> 0 THEN RAISE EXCEPTION 'SANITY_FAIL: anon tiene EXECUTE sobre RPC de conciliación'; END IF;

  -- 3) La regla v4 de DEVOLUCION quedó activa y referencia SOLO categorías reales.
  SELECT count(*) INTO v_n FROM public.fin_rule_versions rv
   WHERE rv.document_type = 'DEVOLUCION_VENTA' AND rv.status = 'active'
     AND rv.store_id IS NULL
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(rv.movements) m
       WHERE m ->> 'categoria' = 'PAS_CREDITO_TIENDA');
  IF v_n <> 0 THEN RAISE EXCEPTION 'SANITY_FAIL: la regla activa aún referencia PAS_CREDITO_TIENDA (inexistente)'; END IF;
  SELECT count(*) INTO v_n FROM public.fin_rule_versions rv
   WHERE rv.document_type = 'DEVOLUCION_VENTA' AND rv.status = 'active' AND rv.store_id IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'SANITY_FAIL: se esperaba exactamente 1 regla activa global de DEVOLUCION_VENTA'; END IF;

  -- 4) Tolerancias sembradas para las cuentas conciliables.
  SELECT count(*) INTO v_n FROM public.fin_reconciliation_config;
  IF v_n < 24 THEN RAISE EXCEPTION 'SANITY_FAIL: configuración de tolerancias incompleta (%)', v_n; END IF;
END $$;

COMMIT;


