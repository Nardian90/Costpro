-- ============================================================================
-- CP-FIN — MOTOR DE PARTIDA DOBLE · PARTE 1: MODELO BASE
-- Misión: Configuración de Documentos y Estados Financieros Automáticos
-- Expediente: docs/audits/2026-11-13-cp-fin-partida-doble/
--
-- Contenido (idempotente):
--   1. fin_categories            — catálogo jerárquico de categorías económicas
--   2. fin_document_types        — catálogo de tipos documentales REALES
--   3. fin_rule_versions         — versiones de reglas por tipo documental
--   4. fin_entries / fin_movements — asientos y líneas de partida doble
--   5. fin_opening_balances      — saldos iniciales autorizados
--   6. fin_posting_errors        — errores de contabilización (no bloquean negocio)
--   7. fin_metric_catalog        — catálogo de métricas por tipo documental (UI)
--   8. Semillas: 38 categorías, 14 tipos, 10 reglas por defecto, métricas
--   9. RLS multitienda (patrón stock_movements: escritura SOLO vía motor)
--  10. Grants endurecidos (REVOKE PUBLIC/anon)
--
-- Seguridad: escritura de fin_entries/fin_movements denegada a authenticated
-- (igual que stock_movements); todo pasa por RPC SECURITY DEFINER (parte 2).
-- ============================================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- 1. fin_categories — catálogo jerárquico de categorías económicas
--    store_id NULL = global (semilla); con tienda = categoría propia.
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fin_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  clase text NOT NULL
    CONSTRAINT fin_categories_clase_check
    CHECK (clase IN ('activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto')),
  grupo text NOT NULL
    CONSTRAINT fin_categories_grupo_check
    CHECK (grupo IN (
      'activo_corriente', 'activo_no_corriente',
      'pasivo_corriente', 'pasivo_no_corriente', 'patrimonio',
      'ingreso_operacional', 'ajuste_ingreso', 'costo_venta',
      'gasto_operacional', 'ingreso_no_operacional', 'gasto_no_operacional'
    )),
  parent_id uuid REFERENCES public.fin_categories (id) ON DELETE SET NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  store_id uuid REFERENCES public.stores (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_categories_code_key UNIQUE (code),
  CONSTRAINT fin_categories_clase_grupo_sane CHECK (
    (clase = 'activo'   AND grupo IN ('activo_corriente', 'activo_no_corriente')) OR
    (clase = 'pasivo'   AND grupo IN ('pasivo_corriente', 'pasivo_no_corriente')) OR
    (clase = 'patrimonio' AND grupo = 'patrimonio') OR
    (clase = 'ingreso'  AND grupo IN ('ingreso_operacional', 'ajuste_ingreso', 'ingreso_no_operacional')) OR
    (clase = 'gasto'    AND grupo IN ('costo_venta', 'gasto_operacional', 'gasto_no_operacional'))
  )
);

COMMENT ON TABLE public.fin_categories IS
  'CP-FIN: catálogo jerárquico de categorías económicas (no cuentas contables). '
  'store_id NULL = global (semilla del sistema). Ampliable por el usuario.';

CREATE INDEX IF NOT EXISTS idx_fin_categories_store ON public.fin_categories (store_id);
CREATE INDEX IF NOT EXISTS idx_fin_categories_clase ON public.fin_categories (clase, grupo, sort_order);

-- ══════════════════════════════════════════════════════════════════════════
-- 2. fin_document_types — catálogo de tipos documentales REALES de COSTPRO
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fin_document_types (
  code text PRIMARY KEY,
  name text NOT NULL,
  module text NOT NULL,
  source_table text NOT NULL,
  description text,
  trigger_status text,
  is_postable boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fin_document_types IS
  'CP-FIN: tipos documentales reales identificados en la auditoría. '
  'trigger_status = estado del documento que dispara el reconocimiento económico.';

-- ══════════════════════════════════════════════════════════════════════════
-- 3. fin_rule_versions — versiones de reglas de partida doble
--    movements: [{id, evento, categoria, sentido, origen{tipo,metrica|valor},
--                 condicion{campo,op,valor}|[...]|null, orden}]
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fin_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL
    REFERENCES public.fin_document_types (code) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores (id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft'
    CONSTRAINT fin_rule_status_check CHECK (status IN ('draft', 'active', 'inactive')),
  movements jsonb NOT NULL DEFAULT '[]'::jsonb
    CONSTRAINT fin_rule_movements_arr CHECK (jsonb_typeof(movements) = 'array'),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_by uuid REFERENCES public.profiles (id),
  activated_at timestamptz,
  deactivated_at timestamptz,
  CONSTRAINT fin_rule_versions_scope_version_key UNIQUE (document_type, store_id, version)
);

COMMENT ON TABLE public.fin_rule_versions IS
  'CP-FIN: versiones de reglas de movimientos económicos por tipo documental. '
  'store_id NULL = regla global (fallback); con tienda = regla propia que la '
  'reemplaza. Una sola versión activa por (tipo, ámbito). Los asientos históricos '
  'conservan la versión con la que fueron generados.';

CREATE INDEX IF NOT EXISTS idx_fin_rules_doctype ON public.fin_rule_versions (document_type, status);
-- Una sola activa por (tipo, ámbito) — COALESCE trata el ámbito global como valor:
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_rules_one_active
  ON public.fin_rule_versions (document_type, COALESCE(store_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'active';

-- ══════════════════════════════════════════════════════════════════════════
-- 4. fin_entries + fin_movements — asientos y líneas de partida doble
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fin_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  document_type text NOT NULL,
  document_id uuid,
  document_number text,
  event text NOT NULL
    CONSTRAINT fin_entry_event_check
    CHECK (event IN ('reconocimiento', 'pago', 'anulacion', 'apertura', 'ajuste_manual')),
  payment_ref uuid,
  economic_date date NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  rule_version_id uuid REFERENCES public.fin_rule_versions (id),
  movements_snapshot jsonb,
  reversal_of uuid REFERENCES public.fin_entries (id),
  status text NOT NULL DEFAULT 'posted'
    CONSTRAINT fin_entry_status_check CHECK (status IN ('posted', 'reversed')),
  description text,
  created_by uuid REFERENCES public.profiles (id),
  CONSTRAINT fin_entries_doc_type_fk FOREIGN KEY (document_type)
    REFERENCES public.fin_document_types (code)
);

COMMENT ON TABLE public.fin_entries IS
  'CP-FIN: asientos económicos (una fila por documento+evento+pago). '
  'anulacion = asiento compensatorio enlazado vía reversal_of (nunca UPDATE).';

-- Idempotencia: un documento no puede contabilizarse dos veces por el mismo
-- evento (y el mismo pago). Apertura/ajuste_manual (document_id NULL) fuera.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_entries_doc_event
  ON public.fin_entries (document_type, document_id, event, COALESCE(payment_ref, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fin_entries_store_date ON public.fin_entries (store_id, economic_date DESC);
CREATE INDEX IF NOT EXISTS idx_fin_entries_reversal ON public.fin_entries (reversal_of) WHERE reversal_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_entries_payment ON public.fin_entries (payment_ref) WHERE payment_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fin_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.fin_entries (id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  category_code text NOT NULL REFERENCES public.fin_categories (code),
  sense text NOT NULL
    CONSTRAINT fin_movement_sense_check CHECK (sense IN ('debito', 'credito')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'CUP'
    CONSTRAINT fin_movement_currency_check CHECK (currency IN ('CUP', 'USD', 'EUR', 'MLC')),
  exchange_rate numeric(14,6) NOT NULL DEFAULT 1
    CONSTRAINT fin_movement_rate_sane CHECK (
      (currency = 'CUP' AND exchange_rate = 1) OR
      (currency <> 'CUP' AND exchange_rate > 0)
    ),
  amount_cup numeric(14,2) GENERATED ALWAYS AS (
    CASE WHEN currency = 'CUP' THEN amount ELSE round(amount * exchange_rate, 2) END
  ) STORED,
  economic_date date NOT NULL,
  document_number text,
  description text,
  worker_id uuid,
  product_id uuid,
  customer_id uuid,
  traza jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fin_movements IS
  'CP-FIN: líneas de partida doble. Inmutables una vez emitidas (las correcciones '
  'son asientos compensatorios). traza guarda métrica de origen, condición y '
  'fuente del costo (cost_at_sale | unit_cost_derived | cost_average).';

CREATE INDEX IF NOT EXISTS idx_fin_mov_entry ON public.fin_movements (entry_id);
CREATE INDEX IF NOT EXISTS idx_fin_mov_report ON public.fin_movements (store_id, category_code, economic_date);
CREATE INDEX IF NOT EXISTS idx_fin_mov_date ON public.fin_movements (store_id, economic_date DESC);

-- ══════════════════════════════════════════════════════════════════════════
-- 5. fin_opening_balances — saldos iniciales autorizados
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fin_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  category_code text NOT NULL REFERENCES public.fin_categories (code),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'CUP' CHECK (currency IN ('CUP', 'USD', 'EUR', 'MLC')),
  exchange_rate numeric(14,6) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  amount_cup numeric(14,2) NOT NULL,
  as_of_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CONSTRAINT fin_opening_status_check CHECK (status IN ('draft', 'applied', 'voided')),
  entry_id uuid REFERENCES public.fin_entries (id),
  notes text,
  authorized_by uuid REFERENCES public.profiles (id),
  created_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

COMMENT ON TABLE public.fin_opening_balances IS
  'CP-FIN: saldos iniciales (apertura financiera). Draft → applied genera el '
  'asiento de apertura. Nunca se usa un ajuste patrimonial ficticio para cuadrar.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_opening_live
  ON public.fin_opening_balances (store_id, category_code, currency, as_of_date)
  WHERE status <> 'voided';

-- ══════════════════════════════════════════════════════════════════════════
-- 6. fin_posting_errors — errores de contabilización aislados del negocio
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fin_posting_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,
  document_type text,
  document_id uuid,
  event text,
  error_code text,
  error_detail text,
  attempts integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

COMMENT ON TABLE public.fin_posting_errors IS
  'CP-FIN: los triggers de contabilización JAMÁS bloquean la operación comercial: '
  'un fallo de reglas queda registrado aquí y es reprocesable desde la Vista A.';

CREATE INDEX IF NOT EXISTS idx_fin_post_err_store ON public.fin_posting_errors (store_id, resolved_at) WHERE resolved_at IS NULL;

-- ══════════════════════════════════════════════════════════════════════════
-- 7. fin_metric_catalog — métricas disponibles por tipo documental (UI)
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fin_metric_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL REFERENCES public.fin_document_types (code) ON DELETE CASCADE,
  metric text NOT NULL,
  label text NOT NULL,
  unit text NOT NULL DEFAULT 'CUP',
  for_event text NOT NULL DEFAULT 'reconocimiento'
    CHECK (for_event IN ('reconocimiento', 'pago', 'any')),
  CONSTRAINT fin_metric_catalog_key UNIQUE (document_type, metric)
);

COMMENT ON TABLE public.fin_metric_catalog IS 'CP-FIN: origen de importes seleccionables en el constructor de movimientos.';

-- ══════════════════════════════════════════════════════════════════════════
-- 8. SEMILLAS
-- ══════════════════════════════════════════════════════════════════════════

-- 8.1 Categorías económicas (38) ------------------------------------------------
INSERT INTO public.fin_categories (code, name, clase, grupo, is_system, sort_order, description) VALUES
  -- ACTIVOS CORRIENTES
  ('ACT_EFECTIVO_CUP',   'Efectivo en caja (CUP)', 'activo', 'activo_corriente', true, 10, 'Billetes CUP disponibles en caja'),
  ('ACT_EFECTIVO_USD',   'Efectivo en caja (USD)', 'activo', 'activo_corriente', true, 11, 'Billetes USD disponibles en caja'),
  ('ACT_BANCOS',         'Dinero en bancos y transferencias', 'activo', 'activo_corriente', true, 12, 'Transferencias y Zelle acreditados o por acreditar'),
  ('ACT_CXC',            'Cuentas por cobrar a clientes', 'activo', 'activo_corriente', true, 13, 'Ventas a crédito pendientes de cobro'),
  ('ACT_INVENTARIO',     'Inventario de mercancías', 'activo', 'activo_corriente', true, 14, 'Valor del inventario a costo promedio (WAC)'),
  ('ACT_ANTICIPOS_PROV', 'Anticipos a proveedores', 'activo', 'activo_corriente', true, 15, 'Pagos anticipados a proveedores'),
  ('ACT_OTROS_CORR',     'Otros activos corrientes', 'activo', 'activo_corriente', true, 16, 'Otros activos de corto plazo'),
  -- ACTIVOS NO CORRIENTES
  ('ACT_FIJO',           'Activos fijos', 'activo', 'activo_no_corriente', true, 20, 'Equipos e instalaciones'),
  ('ACT_OTROS_NO_CORR',  'Otros activos no corrientes', 'activo', 'activo_no_corriente', true, 21, 'Otros activos de largo plazo'),
  -- PASIVOS CORRIENTES
  ('PAS_CXP_PROV',       'Cuentas por pagar a proveedores', 'pasivo', 'pasivo_corriente', true, 30, 'Recepciones de mercancía pendientes de pago'),
  ('PAS_SERV_PEND',      'Servicios pendientes de pago', 'pasivo', 'pasivo_corriente', true, 31, 'Servicios recibidos pendientes de pago'),
  ('PAS_NOMINA_PEND',    'Nóminas pendientes de pago', 'pasivo', 'pasivo_corriente', true, 32, 'Neto a pagar a trabajadores'),
  ('PAS_RETENCIONES',    'Retenciones y deducciones por pagar', 'pasivo', 'pasivo_corriente', true, 33, 'Deducciones de nómina retenidas a terceros'),
  ('PAS_OBL_SOCIAL',     'Obligaciones sociales pendientes', 'pasivo', 'pasivo_corriente', true, 34, 'Obligaciones sociales con presupuesto del Estado'),
  ('PAS_OBL_TRIB',       'Obligaciones tributarias', 'pasivo', 'pasivo_corriente', true, 35, 'Impuestos y tributos pendientes'),
  ('PAS_ANTICIPOS_CLI',  'Anticipos recibidos de clientes', 'pasivo', 'pasivo_corriente', true, 36, 'Créditos de tienda a favor de clientes (store credit)'),
  ('PAS_OTRAS',          'Otras obligaciones', 'pasivo', 'pasivo_corriente', true, 37, 'Otras deudas de corto plazo'),
  ('PAS_LARGO_PLAZO',    'Obligaciones de largo plazo', 'pasivo', 'pasivo_no_corriente', true, 40, 'Deudas de largo plazo'),
  -- PATRIMONIO
  ('PAT_CAPITAL',        'Patrimonio inicial (apertura)', 'patrimonio', 'patrimonio', true, 50, 'Saldos iniciales autorizados en la apertura financiera'),
  ('PAT_APORTES',        'Aportes', 'patrimonio', 'patrimonio', true, 51, 'Aportes de los propietarios'),
  ('PAT_RESULT_ACUM',    'Resultados acumulados', 'patrimonio', 'patrimonio', true, 52, 'Resultados de períodos anteriores'),
  ('PAT_RESULT_PERIODO', 'Resultado del período', 'patrimonio', 'patrimonio', true, 53, 'Resultado del período en curso (cierre)'),
  ('PAT_OTROS',          'Otros movimientos patrimoniales', 'patrimonio', 'patrimonio', true, 54, 'Otros conceptos patrimoniales autorizados'),
  -- INGRESOS
  ('ING_VENTAS',         'Ingresos por ventas de productos', 'ingreso', 'ingreso_operacional', true, 60, 'Ventas de productos confirmadas'),
  ('ING_SERVICIOS_PREST','Ingresos por servicios prestados', 'ingreso', 'ingreso_operacional', true, 61, 'Servicios prestados por la tienda'),
  ('ING_OTROS_OPER',     'Otros ingresos operacionales', 'ingreso', 'ingreso_operacional', true, 62, 'Sobrantes de inventario justificados, ingresos de caja'),
  ('ING_FINANCIEROS',    'Ingresos financieros', 'ingreso', 'ingreso_no_operacional', true, 63, 'Intereses y rendimientos'),
  ('ING_NO_OPER',        'Otros ingresos no operacionales', 'ingreso', 'ingreso_no_operacional', true, 64, 'Ingresos ajenos a la operación'),
  ('ING_DEVOLUCIONES',   'Devoluciones sobre ventas', 'ingreso', 'ajuste_ingreso', true, 65, 'Contra-ingreso: devuelve ventas al cliente'),
  ('ING_DESCUENTOS',     'Descuentos sobre ventas', 'ingreso', 'ajuste_ingreso', true, 66, 'Contra-ingreso: descuentos concedidos'),
  -- COSTOS Y GASTOS
  ('GAS_COSTO_VENTAS',   'Costo de los productos vendidos', 'gasto', 'costo_venta', true, 70, 'Costo (WAC) de las mercancías vendidas o devueltas'),
  ('GAS_SERVICIOS',      'Gastos por Servicios Recibidos', 'gasto', 'gasto_operacional', true, 71, 'Servicios recibidos de terceros'),
  ('GAS_NOMINAS',        'Gastos de nóminas de salarios', 'gasto', 'gasto_operacional', true, 72, 'Salarios y haberes devengados'),
  ('GAS_COMISIONES',     'Gastos por comisiones', 'gasto', 'gasto_operacional', true, 73, 'Comisiones a cargo de la entidad'),
  ('GAS_VALES',          'Consumo interno de mercancías (vales)', 'gasto', 'gasto_operacional', true, 74, 'Salidas de almacén por vales'),
  ('GAS_PERDIDA_INV',    'Pérdidas de inventario', 'gasto', 'gasto_operacional', true, 75, 'Faltantes y deterioros justificados'),
  ('GAS_TRANSPORTE',     'Gastos de transportación', 'gasto', 'gasto_operacional', true, 76, 'Transporte de mercancías y personas'),
  ('GAS_ELECTRICIDAD',   'Gastos de electricidad y servicios básicos', 'gasto', 'gasto_operacional', true, 77, 'Electricidad, agua, gas, comunicaciones'),
  ('GAS_MANTENIMIENTO',  'Gastos de mantenimiento', 'gasto', 'gasto_operacional', true, 78, 'Mantenimiento de equipos e instalaciones'),
  ('GAS_ADMIN',          'Gastos de administración', 'gasto', 'gasto_operacional', true, 79, 'Gastos administrativos generales'),
  ('GAS_BANCARIOS',      'Gastos bancarios', 'gasto', 'gasto_operacional', true, 80, 'Comisiones y cargos bancarios'),
  ('GAS_OTROS_OPER',     'Otros gastos operacionales', 'gasto', 'gasto_operacional', true, 81, 'Egresos de caja sin clasificación específica'),
  ('GAS_FINANCIEROS',    'Gastos financieros', 'gasto', 'gasto_no_operacional', true, 82, 'Intereses y diferencias de cambio'),
  ('GAS_NO_OPER',        'Otros gastos no operacionales', 'gasto', 'gasto_no_operacional', true, 83, 'Gastos ajenos a la operación')
ON CONFLICT (code) DO NOTHING;

-- 8.2 Tipos documentales REALES (auditoría 2026-11-13) -------------------------
INSERT INTO public.fin_document_types (code, name, module, source_table, trigger_status, is_postable, is_active, sort_order, description) VALUES
  ('VENTA',             'Ventas', 'Ventas', 'transactions', 'completed', true, true, 10, 'Venta de productos (POS). Reconoce ingreso, cobro por método y costo de ventas.'),
  ('DEVOLUCION_VENTA',  'Devoluciones de venta', 'Ventas', 'devolutions', 'completed', true, true, 11, 'Devolución de cliente: revierte ingreso, costo y reembolsa o acredita.'),
  ('RECEPCION',         'Entradas de almacén', 'Inventario', 'receipts', 'active', true, true, 20, 'Recepción de mercancía: aumenta inventario y nace la deuda con el proveedor.'),
  ('SERVICIO_RECIBIDO', 'Servicios recibidos', 'Servicios', 'received_services', 'active', true, true, 30, 'Servicio de un tercero: gasto operacional y obligación según pago.'),
  ('VALE_SALIDA',       'Vales de salida', 'Inventario', 'issue_slips', 'completed', true, true, 21, 'Salida de mercancía por vale (consumo interno).'),
  ('AJUSTE_INVENTARIO', 'Ajustes de inventario', 'Inventario', 'inventory_adjustments', 'confirmed', true, true, 22, 'Sobrante/faltante/deterioro con causa justificada.'),
  ('COMISION',          'Comisiones', 'Recursos Humanos', 'commission_payments', 'paid', true, true, 40, 'Comisión a trabajador reconocida y pagada.'),
  ('NOMINA',            'Nóminas de salario', 'Recursos Humanos', 'payrolls', 'confirmed', true, true, 41, 'Nómina SC-4-06: gasto al confirmar, obligaciones, pago al marcar pagada.'),
  ('FLUJO_CAJA',        'Ingresos y egresos de caja', 'Caja', 'cash_flow_documents', 'confirmado', true, true, 50, 'Movimiento manual de efectivo (fondo de caja y otros).'),
  ('TRANSFERENCIA',     'Transferencias entre almacenes', 'Inventario', 'transfers', 'CONFIRMADA', true, true, 23, 'Traslado interno de la misma tienda: SIN efecto económico (Caso F).'),
  ('ORDEN_COMPRA',      'Órdenes de compra', 'Inventario', 'purchase_orders', NULL, true, true, 24, 'La deuda nace en la recepción, no en la OC. Sin regla por defecto.'),
  ('ORDEN_PRODUCCION',  'Órdenes de producción', 'Producción', 'production_orders', NULL, true, true, 25, 'Consumo/entrada ya genera stock_movements. Configuración futura.'),
  ('ORDEN_TRABAJO',     'Órdenes de trabajo', 'Producción', 'work_orders', NULL, true, true, 26, 'Anticipos registrados en payment_transactions. Sin regla por defecto.'),
  ('DEVOLUCION_PROV',   'Devoluciones a proveedores', 'Inventario', 'receipts (reversa)', 'voided', true, true, 27, 'Se modela como reversa de recepción: anula el asiento original.')
ON CONFLICT (code) DO NOTHING;

-- 8.3 Reglas por defecto (globales, versión 1, ACTIVAS) ------------------------
-- Estructura de cada plantilla:
--   {id, evento, categoria, sentido, origen:{tipo:'metrica',metrica}|{tipo:'constante',valor},
--    condicion:{campo,op,valor}|[{...}]|null, orden}

INSERT INTO public.fin_rule_versions (document_type, store_id, version, status, movements, effective_from, notes) VALUES
-- VENTA: cobros por método (payment_components) + ingreso + costo WAC
('VENTA', NULL, 1, 'active', '[
  {"id":"v-cash-cup","evento":"reconocimiento","categoria":"ACT_EFECTIVO_CUP","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_cash_cup"},"condicion":{"campo":"cob_cash_cup","op":">","valor":0},"orden":1},
  {"id":"v-cash-usd","evento":"reconocimiento","categoria":"ACT_EFECTIVO_USD","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_cash_usd_cup"},"condicion":{"campo":"cob_cash_usd_cup","op":">","valor":0},"orden":2},
  {"id":"v-transf-cup","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_transfer_cup"},"condicion":{"campo":"cob_transfer_cup","op":">","valor":0},"orden":3},
  {"id":"v-transf-usd","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_transfer_usd_cup"},"condicion":{"campo":"cob_transfer_usd_cup","op":">","valor":0},"orden":4},
  {"id":"v-zelle","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_zelle_usd_cup"},"condicion":{"campo":"cob_zelle_usd_cup","op":">","valor":0},"orden":5},
  {"id":"v-ingreso","evento":"reconocimiento","categoria":"ING_VENTAS","sentido":"credito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":null,"orden":6},
  {"id":"v-cogs-d","evento":"reconocimiento","categoria":"GAS_COSTO_VENTAS","sentido":"debito","origen":{"tipo":"metrica","metrica":"costo_productos_cup"},"condicion":{"campo":"costo_productos_cup","op":">","valor":0},"orden":7},
  {"id":"v-cogs-c","evento":"reconocimiento","categoria":"ACT_INVENTARIO","sentido":"credito","origen":{"tipo":"metrica","metrica":"costo_productos_cup"},"condicion":{"campo":"costo_productos_cup","op":">","valor":0},"orden":8}
]'::jsonb, CURRENT_DATE, 'Regla por defecto: cobros por método (payment_transactions), ingreso y costo de ventas (WAC).'),

-- DEVOLUCIÓN DE VENTA: contra-ingreso + devolución de costo + reembolso/crédito
('DEVOLUCION_VENTA', NULL, 1, 'active', '[
  {"id":"d-ref-cash-cup","evento":"reconocimiento","categoria":"ACT_EFECTIVO_CUP","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_cash_cup"},"condicion":{"campo":"reembolso_cash_cup","op":">","valor":0},"orden":1},
  {"id":"d-ref-cash-usd","evento":"reconocimiento","categoria":"ACT_EFECTIVO_USD","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_cash_usd_cup"},"condicion":{"campo":"reembolso_cash_usd_cup","op":">","valor":0},"orden":2},
  {"id":"d-ref-transf-cup","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_transfer_cup"},"condicion":{"campo":"reembolso_transfer_cup","op":">","valor":0},"orden":3},
  {"id":"d-ref-transf-usd","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_transfer_usd_cup"},"condicion":{"campo":"reembolso_transfer_usd_cup","op":">","valor":0},"orden":4},
  {"id":"d-ref-zelle","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_zelle_usd_cup"},"condicion":{"campo":"reembolso_zelle_usd_cup","op":">","valor":0},"orden":5},
  {"id":"d-store-credit","evento":"reconocimiento","categoria":"PAS_ANTICIPOS_CLI","sentido":"credito","origen":{"tipo":"metrica","metrica":"store_credit_cup"},"condicion":{"campo":"store_credit_cup","op":">","valor":0},"orden":6},
  {"id":"d-dev-ingreso","evento":"reconocimiento","categoria":"ING_DEVOLUCIONES","sentido":"debito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":null,"orden":7},
  {"id":"d-cogs-c","evento":"reconocimiento","categoria":"GAS_COSTO_VENTAS","sentido":"credito","origen":{"tipo":"metrica","metrica":"costo_devuelto_cup"},"condicion":{"campo":"costo_devuelto_cup","op":">","valor":0},"orden":8},
  {"id":"d-inv-d","evento":"reconocimiento","categoria":"ACT_INVENTARIO","sentido":"debito","origen":{"tipo":"metrica","metrica":"costo_devuelto_cup"},"condicion":{"campo":"costo_devuelto_cup","op":">","valor":0},"orden":9}
]'::jsonb, CURRENT_DATE, 'Regla por defecto: revierte ingreso y costo; reembolsa por método o acredita store_credit.'),

-- RECEPCIÓN: inventario + deuda proveedor (completa; los pagos generan asientos propios)
('RECEPCION', NULL, 1, 'active', '[
  {"id":"r-inv-d","evento":"reconocimiento","categoria":"ACT_INVENTARIO","sentido":"debito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":{"campo":"total_cup","op":">","valor":0},"orden":1},
  {"id":"r-cxp-c","evento":"reconocimiento","categoria":"PAS_CXP_PROV","sentido":"credito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":{"campo":"total_cup","op":">","valor":0},"orden":2},
  {"id":"r-pay-cash","evento":"pago","categoria":"ACT_EFECTIVO_CUP","sentido":"debito","origen":{"tipo":"metrica","metrica":"importe_pago_cup"},"condicion":{"campo":"metodo_pago","op":"=","valor":"cash"},"orden":3},
  {"id":"r-pay-bank","evento":"pago","categoria":"ACT_BANCOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"importe_pago_cup"},"condicion":{"campo":"metodo_pago","op":"!=","valor":"cash"},"orden":4},
  {"id":"r-pay-cxp","evento":"pago","categoria":"PAS_CXP_PROV","sentido":"credito","origen":{"tipo":"metrica","metrica":"importe_pago_cup"},"condicion":null,"orden":5}
]'::jsonb, CURRENT_DATE, 'Reconocimiento al pasar a active. Cada pago posterior (register_payment) cancela deuda sin re-reconocer.'),

-- SERVICIO RECIBIDO: gasto + obligación
('SERVICIO_RECIBIDO', NULL, 1, 'active', '[
  {"id":"s-gasto-d","evento":"reconocimiento","categoria":"GAS_SERVICIOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":{"campo":"total_cup","op":">","valor":0},"orden":1},
  {"id":"s-cxp-c","evento":"reconocimiento","categoria":"PAS_SERV_PEND","sentido":"credito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":{"campo":"total_cup","op":">","valor":0},"orden":2},
  {"id":"sp-cash-d","evento":"pago","categoria":"ACT_EFECTIVO_CUP","sentido":"debito","origen":{"tipo":"metrica","metrica":"importe_pago_cup"},"condicion":{"campo":"metodo_pago","op":"=","valor":"cash"},"orden":3},
  {"id":"sp-bank-d","evento":"pago","categoria":"ACT_BANCOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"importe_pago_cup"},"condicion":{"campo":"metodo_pago","op":"!=","valor":"cash"},"orden":4},
  {"id":"sp-cxp-c","evento":"pago","categoria":"PAS_SERV_PEND","sentido":"credito","origen":{"tipo":"metrica","metrica":"importe_pago_cup"},"condicion":null,"orden":5}
]'::jsonb, CURRENT_DATE, 'Gasto al activarse; el pago posterior cancela la obligación sin duplicar el gasto.'),

-- VALE DE SALIDA: consumo interno
('VALE_SALIDA', NULL, 1, 'active', '[
  {"id":"vs-gasto-d","evento":"reconocimiento","categoria":"GAS_VALES","sentido":"debito","origen":{"tipo":"metrica","metrica":"costo_cup"},"condicion":{"campo":"costo_cup","op":">","valor":0},"orden":1},
  {"id":"vs-inv-c","evento":"reconocimiento","categoria":"ACT_INVENTARIO","sentido":"credito","origen":{"tipo":"metrica","metrica":"costo_cup"},"condicion":{"campo":"costo_cup","op":">","valor":0},"orden":2}
]'::jsonb, CURRENT_DATE, 'El vale no tiene campo motivo: se clasifica como consumo operacional por defecto.'),

-- AJUSTE DE INVENTARIO: por causa
('AJUSTE_INVENTARIO', NULL, 1, 'active', '[
  {"id":"aj-perd-d","evento":"reconocimiento","categoria":"GAS_PERDIDA_INV","sentido":"debito","origen":{"tipo":"metrica","metrica":"valor_faltante_cup"},"condicion":{"campo":"valor_faltante_cup","op":">","valor":0},"orden":1},
  {"id":"aj-inv-c","evento":"reconocimiento","categoria":"ACT_INVENTARIO","sentido":"credito","origen":{"tipo":"metrica","metrica":"valor_faltante_cup"},"condicion":{"campo":"valor_faltante_cup","op":">","valor":0},"orden":2},
  {"id":"aj-inv-d","evento":"reconocimiento","categoria":"ACT_INVENTARIO","sentido":"debito","origen":{"tipo":"metrica","metrica":"valor_sobrante_cup"},"condicion":{"campo":"valor_sobrante_cup","op":">","valor":0},"orden":3},
  {"id":"aj-ing-c","evento":"reconocimiento","categoria":"ING_OTROS_OPER","sentido":"credito","origen":{"tipo":"metrica","metrica":"valor_sobrante_cup"},"condicion":{"campo":"valor_sobrante_cup","op":">","valor":0},"orden":4}
]'::jsonb, CURRENT_DATE, 'Faltante/deterioro → pérdida. Sobrante → otro ingreso operacional. Motivo OTHER no contabiliza (pendiente de clasificación).'),

-- COMISIÓN: gasto y pago en el mismo evento (el módulo no tiene devengo separado)
('COMISION', NULL, 1, 'active', '[
  {"id":"co-gasto-d","evento":"pago","categoria":"GAS_COMISIONES","sentido":"debito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":null,"orden":1},
  {"id":"co-cash-cup","evento":"pago","categoria":"ACT_EFECTIVO_CUP","sentido":"credito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":[{"campo":"metodo_pago","op":"=","valor":"cash"},{"campo":"moneda_documento","op":"=","valor":"CUP"}],"orden":2},
  {"id":"co-cash-usd","evento":"pago","categoria":"ACT_EFECTIVO_USD","sentido":"credito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":[{"campo":"metodo_pago","op":"=","valor":"cash"},{"campo":"moneda_documento","op":"=","valor":"USD"}],"orden":3},
  {"id":"co-bank-c","evento":"pago","categoria":"ACT_BANCOS","sentido":"credito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":{"campo":"metodo_pago","op":"!=","valor":"cash"},"orden":4}
]'::jsonb, CURRENT_DATE, 'Comisión a trabajador pagada: gasto y salida de efectivo/banco en un asiento.'),

-- NÓMINA: gasto al confirmar; obligaciones neto+retenciones; pago cancela la neta
('NOMINA', NULL, 1, 'active', '[
  {"id":"no-gasto-d","evento":"reconocimiento","categoria":"GAS_NOMINAS","sentido":"debito","origen":{"tipo":"metrica","metrica":"total_gross_cup"},"condicion":{"campo":"total_gross_cup","op":">","valor":0},"orden":1},
  {"id":"no-neto-c","evento":"reconocimiento","categoria":"PAS_NOMINA_PEND","sentido":"credito","origen":{"tipo":"metrica","metrica":"total_net_cup"},"condicion":{"campo":"total_net_cup","op":">","valor":0},"orden":2},
  {"id":"no-ded-c","evento":"reconocimiento","categoria":"PAS_RETENCIONES","sentido":"credito","origen":{"tipo":"metrica","metrica":"total_deducciones_cup"},"condicion":{"campo":"total_deducciones_cup","op":">","valor":0},"orden":3},
  {"id":"np-neto-d","evento":"pago","categoria":"PAS_NOMINA_PEND","sentido":"debito","origen":{"tipo":"metrica","metrica":"total_net_cup"},"condicion":{"campo":"total_net_cup","op":">","valor":0},"orden":4},
  {"id":"np-efec-c","evento":"pago","categoria":"ACT_EFECTIVO_CUP","sentido":"credito","origen":{"tipo":"metrica","metrica":"total_net_cup"},"condicion":{"campo":"metodo_pago","op":"=","valor":"efectivo"},"orden":5},
  {"id":"np-tarj-c","evento":"pago","categoria":"ACT_BANCOS","sentido":"credito","origen":{"tipo":"metrica","metrica":"total_net_cup"},"condicion":{"campo":"metodo_pago","op":"=","valor":"tarjeta"},"orden":6}
]'::jsonb, CURRENT_DATE, 'Gasto = total_gross (incluye obligación social según semántica del módulo). Paga el neto; retenciones quedan pendientes hasta su liquidación.'),

-- FLUJO DE CAJA: egreso/ingreso manual
('FLUJO_CAJA', NULL, 1, 'active', '[
  {"id":"fc-eg-d","evento":"reconocimiento","categoria":"GAS_OTROS_OPER","sentido":"debito","origen":{"tipo":"metrica","metrica":"importe_cup"},"condicion":{"campo":"tipo_documento","op":"=","valor":"egreso"},"orden":1},
  {"id":"fc-eg-cup-c","evento":"reconocimiento","categoria":"ACT_EFECTIVO_CUP","sentido":"credito","origen":{"tipo":"metrica","metrica":"importe_cup"},"condicion":[{"campo":"tipo_documento","op":"=","valor":"egreso"},{"campo":"moneda_documento","op":"=","valor":"CUP"}],"orden":2},
  {"id":"fc-eg-usd-c","evento":"reconocimiento","categoria":"ACT_EFECTIVO_USD","sentido":"credito","origen":{"tipo":"metrica","metrica":"importe_cup"},"condicion":[{"campo":"tipo_documento","op":"=","valor":"egreso"},{"campo":"moneda_documento","op":"=","valor":"USD"}],"orden":3},
  {"id":"fc-in-cup-d","evento":"reconocimiento","categoria":"ACT_EFECTIVO_CUP","sentido":"debito","origen":{"tipo":"metrica","metrica":"importe_cup"},"condicion":[{"campo":"tipo_documento","op":"=","valor":"ingreso"},{"campo":"moneda_documento","op":"=","valor":"CUP"}],"orden":4},
  {"id":"fc-in-usd-d","evento":"reconocimiento","categoria":"ACT_EFECTIVO_USD","sentido":"debito","origen":{"tipo":"metrica","metrica":"importe_cup"},"condicion":[{"campo":"tipo_documento","op":"=","valor":"ingreso"},{"campo":"moneda_documento","op":"=","valor":"USD"}],"orden":5},
  {"id":"fc-in-c","evento":"reconocimiento","categoria":"ING_OTROS_OPER","sentido":"credito","origen":{"tipo":"metrica","metrica":"importe_cup"},"condicion":{"campo":"tipo_documento","op":"=","valor":"ingreso"},"orden":6}
]'::jsonb, CURRENT_DATE, 'Movimientos manuales de fondo de caja. El concepto es condicionable en reglas custom.'),

-- TRANSFERENCIA: SIN efecto económico (Caso F) — configurada explícitamente vacía
('TRANSFERENCIA', NULL, 1, 'active', '[]'::jsonb, CURRENT_DATE, 'Traslado interno entre almacenes de la misma tienda: sin ingresos, sin gastos, valor total del inventario invariante.')
ON CONFLICT DO NOTHING;

-- 8.4 Catálogo de métricas (para el constructor de la Vista A) ------------------
INSERT INTO public.fin_metric_catalog (document_type, metric, label, unit, for_event) VALUES
  ('VENTA','total_cup','Total del documento (CUP)','CUP','reconocimiento'),
  ('VENTA','cob_cash_cup','Cobrado en efectivo CUP','CUP','reconocimiento'),
  ('VENTA','cob_cash_usd_cup','Cobrado en efectivo USD (valor CUP)','CUP','reconocimiento'),
  ('VENTA','cob_transfer_cup','Cobrado por transferencia CUP','CUP','reconocimiento'),
  ('VENTA','cob_transfer_usd_cup','Cobrado por transferencia USD (valor CUP)','CUP','reconocimiento'),
  ('VENTA','cob_zelle_usd_cup','Cobrado por Zelle (valor CUP)','CUP','reconocimiento'),
  ('VENTA','costo_productos_cup','Costo de los productos (WAC)','CUP','reconocimiento'),
  ('VENTA','moneda_documento','Moneda de la venta','texto','any'),
  ('VENTA','estado_documento','Estado del documento','texto','any'),
  ('DEVOLUCION_VENTA','total_cup','Total de la devolución (CUP)','CUP','reconocimiento'),
  ('DEVOLUCION_VENTA','reembolso_cash_cup','Reembolsado en efectivo CUP','CUP','reconocimiento'),
  ('DEVOLUCION_VENTA','reembolso_cash_usd_cup','Reembolsado en efectivo USD (valor CUP)','CUP','reconocimiento'),
  ('DEVOLUCION_VENTA','reembolso_transfer_cup','Reembolsado por transferencia CUP','CUP','reconocimiento'),
  ('DEVOLUCION_VENTA','reembolso_transfer_usd_cup','Reembolsado por transferencia USD (valor CUP)','CUP','reconocimiento'),
  ('DEVOLUCION_VENTA','reembolso_zelle_usd_cup','Reembolsado por Zelle (valor CUP)','CUP','reconocimiento'),
  ('DEVOLUCION_VENTA','store_credit_cup','Crédito de tienda otorgado (valor CUP)','CUP','reconocimiento'),
  ('DEVOLUCION_VENTA','costo_devuelto_cup','Costo de los productos devueltos','CUP','reconocimiento'),
  ('RECEPCION','total_cup','Valor total de la recepción (CUP)','CUP','reconocimiento'),
  ('RECEPCION','importe_pago_cup','Importe del pago (CUP)','CUP','pago'),
  ('RECEPCION','metodo_pago','Método del pago','texto','pago'),
  ('RECEPCION','pendiente_cup','Pendiente de pago (CUP)','CUP','reconocimiento'),
  ('SERVICIO_RECIBIDO','total_cup','Total del servicio (CUP)','CUP','reconocimiento'),
  ('SERVICIO_RECIBIDO','importe_pago_cup','Importe del pago (CUP)','CUP','pago'),
  ('SERVICIO_RECIBIDO','metodo_pago','Método del pago','texto','pago'),
  ('SERVICIO_RECIBIDO','pendiente_cup','Pendiente de pago (CUP)','CUP','reconocimiento'),
  ('VALE_SALIDA','costo_cup','Costo de la salida (WAC)','CUP','reconocimiento'),
  ('AJUSTE_INVENTARIO','valor_faltante_cup','Valor del faltante/deterioro','CUP','reconocimiento'),
  ('AJUSTE_INVENTARIO','valor_sobrante_cup','Valor del sobrante','CUP','reconocimiento'),
  ('AJUSTE_INVENTARIO','motivo','Motivo del ajuste','texto','any'),
  ('COMISION','total_cup','Importe final de la comisión (CUP)','CUP','pago'),
  ('COMISION','metodo_pago','Método de pago','texto','pago'),
  ('COMISION','moneda_documento','Moneda de la comisión','texto','pago'),
  ('NOMINA','total_gross_cup','Total devengado (CUP)','CUP','reconocimiento'),
  ('NOMINA','total_net_cup','Neto a pagar (CUP)','CUP','any'),
  ('NOMINA','total_deducciones_cup','Deducciones retenidas (CUP)','CUP','reconocimiento'),
  ('NOMINA','total_social_cup','Obligaciones sociales (CUP)','CUP','reconocimiento'),
  ('NOMINA','metodo_pago','Método de pago','texto','pago'),
  ('FLUJO_CAJA','importe_cup','Importe del documento (CUP)','CUP','reconocimiento'),
  ('FLUJO_CAJA','tipo_documento','Tipo (ingreso/egreso)','texto','any'),
  ('FLUJO_CAJA','moneda_documento','Moneda del documento','texto','any'),
  ('FLUJO_CAJA','concepto','Concepto del documento','texto','any')
ON CONFLICT (document_type, metric) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 9. RLS MULTITIENDA
--    Patrón del repo: is_admin() cubre admin+superadmin; has_store_role para
--    membresías. fin_entries/fin_movements: SOLO lectura para usuarios;
--    escritura exclusiva del motor (RPC SECURITY DEFINER).
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.fin_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_opening_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_posting_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_metric_catalog ENABLE ROW LEVEL SECURITY;

-- fin_categories: legible por todos los autenticados; escritura controlada
DROP POLICY IF EXISTS fin_categories_select ON public.fin_categories;
CREATE POLICY fin_categories_select ON public.fin_categories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS fin_categories_insert ON public.fin_categories;
CREATE POLICY fin_categories_insert ON public.fin_categories
  FOR INSERT TO authenticated WITH CHECK (
    store_id IS NOT NULL AND has_store_role (store_id, ARRAY['admin'])
  );

DROP POLICY IF EXISTS fin_categories_update ON public.fin_categories;
CREATE POLICY fin_categories_update ON public.fin_categories
  FOR UPDATE TO authenticated USING (
    (is_system AND is_admin()) OR
    (NOT is_system AND store_id IS NOT NULL AND has_store_role (store_id, ARRAY['admin']))
  ) WITH CHECK (
    (is_system AND is_admin()) OR
    (NOT is_system AND store_id IS NOT NULL AND has_store_role (store_id, ARRAY['admin']))
  );
-- Sin política DELETE: las categorías se desactivan (is_active), no se borran.

-- fin_document_types: lectura todos; actualización solo admin
DROP POLICY IF EXISTS fin_document_types_select ON public.fin_document_types;
CREATE POLICY fin_document_types_select ON public.fin_document_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS fin_document_types_update ON public.fin_document_types;
CREATE POLICY fin_document_types_update ON public.fin_document_types
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- fin_rule_versions: lectura (global o tienda propia); versiones solo admin de ámbito
DROP POLICY IF EXISTS fin_rules_select ON public.fin_rule_versions;
CREATE POLICY fin_rules_select ON public.fin_rule_versions
  FOR SELECT TO authenticated
  USING (store_id IS NULL OR has_store_access (store_id));

DROP POLICY IF EXISTS fin_rules_insert ON public.fin_rule_versions;
CREATE POLICY fin_rules_insert ON public.fin_rule_versions
  FOR INSERT TO authenticated WITH CHECK (
    (store_id IS NULL AND is_admin()) OR
    (store_id IS NOT NULL AND has_store_role (store_id, ARRAY['admin']))
  );

DROP POLICY IF EXISTS fin_rules_update ON public.fin_rule_versions;
CREATE POLICY fin_rules_update ON public.fin_rule_versions
  FOR UPDATE TO authenticated
  USING (store_id IS NULL OR has_store_access (store_id))
  WITH CHECK (
    (store_id IS NULL AND is_admin()) OR
    (store_id IS NOT NULL AND has_store_role (store_id, ARRAY['admin']))
  );
-- Sin política DELETE: el historial de versiones es inmutable (desactivar).

-- fin_entries / fin_movements: lectura por tienda; escritura SOLO motor
DROP POLICY IF EXISTS fin_entries_select ON public.fin_entries;
CREATE POLICY fin_entries_select ON public.fin_entries
  FOR SELECT TO authenticated
  USING (is_admin() OR has_store_access (store_id));

DROP POLICY IF EXISTS fin_movements_select ON public.fin_movements;
CREATE POLICY fin_movements_select ON public.fin_movements
  FOR SELECT TO authenticated
  USING (is_admin() OR has_store_access (store_id));
-- Sin políticas INSERT/UPDATE/DELETE: escritura denegada a authenticated.

-- fin_opening_balances: por tienda; admin de tienda gestiona borradores
DROP POLICY IF EXISTS fin_opening_select ON public.fin_opening_balances;
CREATE POLICY fin_opening_select ON public.fin_opening_balances
  FOR SELECT TO authenticated
  USING (is_admin() OR has_store_access (store_id));

DROP POLICY IF EXISTS fin_opening_insert ON public.fin_opening_balances;
CREATE POLICY fin_opening_insert ON public.fin_opening_balances
  FOR INSERT TO authenticated WITH CHECK (has_store_role (store_id, ARRAY['admin']));

DROP POLICY IF EXISTS fin_opening_update ON public.fin_opening_balances;
CREATE POLICY fin_opening_update ON public.fin_opening_balances
  FOR UPDATE TO authenticated
  USING (is_admin() OR has_store_role (store_id, ARRAY['admin']))
  WITH CHECK (is_admin() OR has_store_role (store_id, ARRAY['admin']));

-- fin_posting_errors: lectura por tienda; marcado de resuelto por admin de tienda
DROP POLICY IF EXISTS fin_post_err_select ON public.fin_posting_errors;
CREATE POLICY fin_post_err_select ON public.fin_posting_errors
  FOR SELECT TO authenticated
  USING (store_id IS NULL OR is_admin() OR has_store_access (store_id));

DROP POLICY IF EXISTS fin_post_err_update ON public.fin_posting_errors;
CREATE POLICY fin_post_err_update ON public.fin_posting_errors
  FOR UPDATE TO authenticated
  USING (store_id IS NULL OR is_admin() OR has_store_role (store_id, ARRAY['admin']))
  WITH CHECK (store_id IS NULL OR is_admin() OR has_store_role (store_id, ARRAY['admin']));

-- fin_metric_catalog: lectura para todos los autenticados
DROP POLICY IF EXISTS fin_metric_catalog_select ON public.fin_metric_catalog;
CREATE POLICY fin_metric_catalog_select ON public.fin_metric_catalog
  FOR SELECT TO authenticated USING (true);

-- ══════════════════════════════════════════════════════════════════════════
-- 10. GRANTS ENDURECIDOS
-- ══════════════════════════════════════════════════════════════════════════
GRANT SELECT ON public.fin_categories, public.fin_document_types,
  public.fin_rule_versions, public.fin_entries, public.fin_movements,
  public.fin_opening_balances, public.fin_posting_errors, public.fin_metric_catalog
TO authenticated;
GRANT INSERT, UPDATE ON public.fin_categories TO authenticated;
GRANT UPDATE ON public.fin_document_types TO authenticated;
GRANT INSERT, UPDATE ON public.fin_rule_versions TO authenticated;
GRANT INSERT, UPDATE ON public.fin_opening_balances TO authenticated;
GRANT UPDATE ON public.fin_posting_errors TO authenticated;
-- fin_entries / fin_movements: sin INSERT/UPDATE/DELETE para authenticated.
REVOKE ALL ON public.fin_entries, public.fin_movements FROM anon, authenticated;
GRANT SELECT ON public.fin_entries, public.fin_movements TO authenticated;

COMMIT;

-- Verificación de cierre (fail-closed)
DO $$
DECLARE
  v_cat int; v_dt int; v_rules int; v_metrics int;
BEGIN
  SELECT count(*) INTO v_cat FROM public.fin_categories;
  SELECT count(*) INTO v_dt FROM public.fin_document_types;
  SELECT count(*) INTO v_rules FROM public.fin_rule_versions WHERE status = 'active';
  SELECT count(*) INTO v_metrics FROM public.fin_metric_catalog;
  IF v_cat < 38 THEN RAISE EXCEPTION 'CP-FIN base: categorías semilla incompletas (%)', v_cat; END IF;
  IF v_dt < 14 THEN RAISE EXCEPTION 'CP-FIN base: tipos documentales semilla incompletos (%)', v_dt; END IF;
  IF v_rules < 10 THEN RAISE EXCEPTION 'CP-FIN base: reglas activas semilla incompletas (%)', v_rules; END IF;
  IF v_metrics < 30 THEN RAISE EXCEPTION 'CP-FIN base: métricas semilla incompletas (%)', v_metrics; END IF;
  RAISE NOTICE 'CP-FIN base OK: % categorías, % tipos, % reglas activas, % métricas', v_cat, v_dt, v_rules, v_metrics;
END $$;
