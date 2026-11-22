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

/**
 * CP-FIN · Misión integral 2026-11-22 (§3.1): navegación de Estados
 * Financieros en TRES opciones — Dashboard (primera y inicial, ejecutiva),
 * Análisis (gráficos contables y estados del motor) y Configuración (acceso
 * contextual a Configuración de Documentos, cuya página oficial vive en
 * SISTEMA — no es una segunda implementación).
 */
export type FinancialStatementTabId = 'dashboard' | 'analisis';

/** Sub-pestañas del módulo Análisis (todo el análisis contable previo). */
export type AnalysisSubTabId = 'resumen' | 'situacion' | 'rendimiento' | 'conciliacion';

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
  /** ID real del documento de origen; NULL en asientos sin documento (apertura/ajuste manual). */
  document_id: string | null;
  document_number: string | null;
  /** 'YYYY-MM-DD'. */
  economic_date: string;
  event: string;
  sense: 'debito' | 'credito';
  amount: number;
  amount_cup: number;
  /** Moneda contable de la línea (CUP en reconocimiento; la del saldo en aperturas). */
  currency: string;
  currency_origin: string | null;
  /**
   * CP-FIN-001: importe ORIGINAL del documento en `currency_origin` (nominal
   * registrado por el motor desde el documento de origen). `null` = dato no
   * registrado en el histórico (deficiencia de trazabilidad que la UI muestra
   * de forma explícita; NUNCA se reconstruye).
   */
  amount_origin: number | null;
  /** CP-FIN-REC-001/PR B: tasa documental de la línea (columna de exportación). */
  exchange_rate?: number | null;
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
  /** CP-FIN-REC-001/PR B (aditivo): generación activa consultada + reconstrucción de saldo. */
  generacion?: { id: string | null; code: string | null };
  saldo_inicial?: number;
  clase?: string | null;
}

// ── Conciliación operativa-contable (CP-FIN-REC-001, fin_get_reconciliation) ─

/** Estados de conciliación (misión §5.4). */
export type ReconciliationEstado =
  | 'CONCILIADO'
  | 'DIFERENCIA'
  | 'ALERTA'
  | 'INCOMPLETO'
  | 'NO_CONCILIABLE'
  | 'PENDIENTE';

/** Calidad/cobertura de la información fuente de una cuenta. */
export type ReconciliationCalidad = 'COMPLETA' | 'PARCIAL' | 'SIN_FUENTE';

/** Fila de la matriz de conciliación (espejo del RPC por cuenta). */
export interface ReconciliationAccountRow {
  cuenta: string;
  nombre: string;
  clase: FinClase;
  grupo: FinGrupo;
  sort_order: number;
  /** Cuenta de período (ingresos/gastos): concilia contra from..to, no contra el corte. */
  es_periodo: boolean;
  /** NULL cuando no hay fuente o falta el período. */
  valor_operacional: number | null;
  valor_contable: number | null;
  /** Convención uniforme: operacional − contable (naturaleza-aware). */
  diferencia: number | null;
  /** % sobre |valor contable| cuando es matemáticamente aplicable. */
  diferencia_pct: number | null;
  estado: ReconciliationEstado;
  tolerancia: number | null;
  materialidad: number | null;
  documentos_operacionales: number | null;
  movimientos_contables: number | null;
  ultima_fecha_operacional: string | null;
  ultima_fecha_contable: string | null;
  calidad: ReconciliationCalidad;
  metodologia: string;
  fuentes: string[];
  /** Payload específico por cuenta (inventario: estadísticas/top productos; cajas: desglose). */
  detalle: Record<string, unknown> | null;
}

export interface ReconciliationExecution {
  calculado_en: string;
  fecha_corte: string;
  desde: string | null;
  hasta: string | null;
  generacion: { id: string | null; code: string | null } | null;
  metodologia_version: string;
  fuentes_actualizadas: Record<string, string | null>;
  convention: string;
}

export interface ReconciliationResumen {
  conciliadas: number;
  diferencias: number;
  alertas: number;
  incompletas: number;
  no_conciliables: number;
  pendientes: number;
  documentos_pendientes: number;
  movimientos_sin_respaldo: number;
}

export interface ReconciliationHallazgoTipo {
  tipo: string;
  pendientes?: number;
  n?: number;
}

export interface ReconciliationData {
  ejecucion: ReconciliationExecution;
  resumen: ReconciliationResumen;
  hallazgos: {
    documentos_pendientes: ReconciliationHallazgoTipo[];
    movimientos_sin_respaldo: ReconciliationHallazgoTipo[];
    ventas_con_fallback_usd: number;
  };
  cuentas: ReconciliationAccountRow[];
}

/** Metadatos de un snapshot guardado (fin_reconciliation_history). */
export interface ReconciliationSnapshotMeta {
  id: string;
  fecha_corte: string;
  desde: string | null;
  hasta: string | null;
  generacion: string | null;
  metodologia_version: string;
  resumen: ReconciliationResumen;
  ejecutado_en: string;
  ejecutado_por: string | null;
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
