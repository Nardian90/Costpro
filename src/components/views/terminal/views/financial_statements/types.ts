/**
 * CP-FIN · Vista B — Estados Financieros: tipos de datos.
 *
 * Espejo EXACTO de los JSON devueltos por los RPC del motor de partida doble
 * (fin_get_balance_sheet / fin_get_income_statement / fin_get_dashboard /
 * fin_get_category_detail), expuestos por GET /api/fin/statements y
 * GET /api/fin/statements/category-detail. Los endpoints devuelven el JSON
 * del RPC directamente (sin wrapper).
 */

// ── Comunes ─────────────────────────────────────────────────────────────────

/** Pestañas de la Vista B (orden del menú de tabs). */
export type FinancialStatementTabId = 'situacion' | 'rendimiento' | 'dashboard';

/** Clase económica de una categoría (misma taxonomía de fin_categories). */
export type FinClase = 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'gasto';

/** Grupo contable (restricción fin_categories_clase_grupo_sane). */
export type FinGrupo =
  | 'activo_corriente'
  | 'activo_no_corriente'
  | 'pasivo_corriente'
  | 'pasivo_no_corriente'
  | 'patrimonio'
  | 'ingreso_operacional'
  | 'ajuste_ingreso'
  | 'costo_venta'
  | 'gasto_operacional'
  | 'ingreso_no_operacional'
  | 'gasto_no_operacional';

/** Fila de categoría del Estado de Situación (fin_get_balance_sheet). */
export interface BalanceCategoryRow {
  code: string;
  name: string;
  clase: FinClase;
  grupo: FinGrupo;
  sort_order: number;
  /**
   * Saldo con la naturaleza del rubro (convención del RPC de balance):
   * activo/gasto → débito−crédito; pasivo/patrimonio/ingreso → crédito−débito.
   */
  saldo: number;
  /** Nº de asientos (entries) con movimientos en la categoría. */
  movimientos: number;
}

/** Fila de categoría del Estado de Rendimiento (fin_get_income_statement). */
export interface IncomeCategoryRow {
  code: string;
  name: string;
  grupo: FinGrupo;
  sort_order: number;
  /**
   * Saldo crédito−débito (naturaleza ingreso): los rubros de gasto/costo y
   * los ajustes (devoluciones) llegan NEGATIVOS; los ingresos, positivos.
   */
  saldo: number;
  documentos: number;
}

// ── Estado de Situación (type=balance) ──────────────────────────────────────

export interface BalanceSheetData {
  as_of: string;
  /** Todas las categorías con saldo ≠ 0 (incluye ingreso/gasto: filtrar por clase). */
  categorias: BalanceCategoryRow[];
  total_activos: number;
  total_pasivos: number;
  /** Saldo de las categorías de patrimonio propiamente (aportes, etc.). */
  patrimonio_movimientos: number;
  /** Ingresos − gastos acumulados a la fecha (naturaleza positiva de ambos). */
  resultado_acumulado: number;
  patrimonio_total: number;
  ecuacion: {
    activos: number;
    pasivos_mas_patrimonio: number;
    diferencia: number;
    equilibrado: boolean;
  };
  completitud: {
    sin_apertura: boolean;
    apertura_tardia: boolean;
    primer_documento: string | null;
    primera_apertura: string | null;
  };
}

// ── Estado de Rendimiento (type=income) ─────────────────────────────────────

export interface IncomeStatementData {
  desde: string;
  hasta: string;
  categorias: IncomeCategoryRow[];
  ingresos_operacionales: number;
  /** Negativo (devoluciones/descuentos son débitos sobre contra-ingresos). */
  ajustes_ingresos: number;
  ingresos_netos: number;
  /** Negativo (el costo de ventas es débito → saldo crédito−débito < 0). */
  costo_ventas: number;
  utilidad_bruta: number;
  /** Negativo (gastos operacionales son débitos). */
  gastos_operacionales: number;
  resultado_operativo: number;
  ingresos_no_operacionales: number;
  gastos_no_operacionales: number;
  resultado_neto: number;
}

// ── Dashboard (type=dashboard) ──────────────────────────────────────────────

export interface DashboardKpis {
  /** Naturaleza positiva en todo el dashboard (costos/gastos ya restan). */
  ingresos: number;
  costo_ventas: number;
  gastos: number;
  utilidad_bruta: number;
  resultado_neto: number;
  efectivo_cup: number;
  /** Saldo de la caja USD convertido a CUP (amount_cup). */
  efectivo_usd: number;
  bancos: number;
  cuentas_por_cobrar: number;
  cuentas_por_pagar: number;
  nomina_pendiente: number;
  retenciones_pendientes: number;
  inventario_valor: number;
}

export interface DashboardSeriesPoint {
  /** 'YYYY-MM'. */
  mes: string;
  ingresos: number;
  gastos: number;
}

export interface DashboardTopGasto {
  code: string;
  name: string;
  total: number;
}

export interface DashboardAlertas {
  gastos_mayores_que_ingresos: boolean;
  desequilibrio_balance: boolean;
  desequilibrio_monto: number;
  tipos_sin_configurar: number;
  errores_contabilizacion: number;
}

export interface DashboardData {
  desde: string;
  hasta: string;
  kpis: DashboardKpis;
  series_mensuales: DashboardSeriesPoint[];
  top_gastos: DashboardTopGasto[];
  alertas: DashboardAlertas;
}

// ── Detalle de categoría (drilldown) ────────────────────────────────────────

export interface MovementRow {
  id: string;
  entry_id: string;
  document_type: string;
  document_id: string;
  document_number: string | null;
  /** 'YYYY-MM-DD'. */
  economic_date: string;
  event: string;
  sense: 'debito' | 'credito';
  amount: number;
  amount_cup: number;
  currency_origin: string | null;
  description: string | null;
  posted_at: string;
}

export interface CategoryDetailData {
  categoria: string;
  /** Total de movimientos del rango (para paginar con «Ver más»). */
  total: number;
  desde: string;
  hasta: string;
  movimientos: MovementRow[];
}

// ── Presentación del Estado de Rendimiento ──────────────────────────────────

/**
 * Cifras de presentación del Estado de Rendimiento.
 *
 * CONVENCIÓN DE SIGNOS (verificada contra el motor): el RPC
 * fin_get_income_statement calcula el saldo de cada categoría como
 * crédito−débito, por lo que ajustes (devoluciones), costo de ventas y
 * gastos llegan NEGATIVOS, y `ingresos_netos` (ventas−devoluciones) es
 * consistente con las filas. En cambio, sus totales derivados
 * (utilidad_bruta / resultado_operativo / resultado_neto) RESTAN esos
 * valores ya negativos — con lo cual SUMARÍAN el costo/gasto en vez de
 * restarlo y contradirían tanto a las propias filas como al
 * `resultado_acumulado` del Estado de Situación (naturaleza positiva) y al
 * `resultado_neto` del dashboard (gastos positivos restados).
 *
 * Para que el estado sea internamente consistente (y coherente entre las
 * tres pestañas), los totales derivados se calculan aquí como SUMA de los
 * valores CON SIGNO que devuelve el propio RPC — presentación pura de los
 * mismos datos, sin inventar ni ajustar cifra alguna.
 */
export interface IncomePresentation {
  ingresosOperacionales: number;
  /** Negativo (contra-ingresos). */
  ajustes: number;
  ingresosNetos: number;
  /** Negativo (débitos). */
  costoVentas: number;
  utilidadBruta: number;
  /** Negativo (débitos). */
  gastosOperacionales: number;
  resultadoOperativo: number;
  ingresosNoOperacionales: number;
  /** Negativo (débitos). */
  gastosNoOperacionales: number;
  resultadoNeto: number;
}

export function computeIncomePresentation(data: IncomeStatementData): IncomePresentation {
  const ingresosNetos = data.ingresos_netos;
  const utilidadBruta = ingresosNetos + data.costo_ventas;
  const resultadoOperativo = utilidadBruta + data.gastos_operacionales;
  const resultadoNeto =
    resultadoOperativo + data.ingresos_no_operacionales + data.gastos_no_operacionales;
  return {
    ingresosOperacionales: data.ingresos_operacionales,
    ajustes: data.ajustes_ingresos,
    ingresosNetos,
    costoVentas: data.costo_ventas,
    utilidadBruta,
    gastosOperacionales: data.gastos_operacionales,
    resultadoOperativo,
    ingresosNoOperacionales: data.ingresos_no_operacionales,
    gastosNoOperacionales: data.gastos_no_operacionales,
    resultadoNeto,
  };
}
