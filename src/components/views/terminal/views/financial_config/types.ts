/**
 * CP-FIN — Vista A: Configuración de Documentos.
 * Tipos compartidos por la vista (DocumentConfigView) y sus diálogos.
 * Espejo EXACTO de los contratos de las rutas /api/fin/* (ver
 * src/app/api/fin/config/route.ts y las funciones RPC del motor en
 * supabase/migrations/2026111312*_cp_fin_partida_doble_*.sql).
 */

// ─────────────────────────────────────────────────────────────────
// Catálogos (GET /api/fin/config)
// ─────────────────────────────────────────────────────────────────

/** Estado de un tipo documental (RPC fin_get_document_types_status). */
export interface DocumentTypeStatus {
  code: string;
  name: string;
  module: string;
  source_table: string;
  description: string | null;
  /** Estado del documento fuente que dispara el reconocimiento. */
  trigger_status: string | null;
  is_postable: boolean;
  sort_order: number;
  /** true si existe regla ACTIVA vigente (global o de la tienda). */
  configurado: boolean;
  rule_version_id: string | null;
  version: number | null;
  movements: MovementTemplate[] | null;
  effective_from: string | null;
  /** Nº de asientos contabilizados para el tipo en la tienda. */
  asientos: number;
  /** Nº de errores de contabilización pendientes (no resueltos). */
  errores: number;
}

/** Categoría económica (tabla fin_categories). */
export interface FinCategory {
  code: string;
  name: string;
  description: string | null;
  clase: 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'gasto' | string;
  grupo: string;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  store_id: string | null;
}

/** Métrica del catálogo (tabla fin_metric_catalog). */
export interface MetricCatalogItem {
  document_type: string;
  metric: string;
  label: string;
  /** 'CUP' (importe) | 'texto' (atributo para condiciones). */
  unit: string;
  for_event: 'reconocimiento' | 'pago' | 'any' | string;
}

/** Versión de regla (tabla fin_rule_versions; GET /api/fin/config → rules). */
export interface RuleVersion {
  id: string;
  document_type: string;
  store_id: string | null;
  version: number;
  status: 'draft' | 'active' | 'inactive' | string;
  movements: MovementTemplate[] | null;
  effective_from: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  activated_by: string | null;
  activated_at: string | null;
  deactivated_at: string | null;
}

// ─────────────────────────────────────────────────────────────────
// Plantillas de movimientos (constructor)
// ─────────────────────────────────────────────────────────────────

export type ConditionOp = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'existe';

export interface MovementCondition {
  campo: string;
  op: ConditionOp | string;
  valor: string | number | Array<string | number>;
}

export type MovementOrigen =
  | { tipo: 'metrica'; metrica: string }
  | { tipo: 'constante'; valor: number };

/** Plantilla de movimiento económico (misma estructura que el motor). */
export interface MovementTemplate {
  id?: string;
  evento: 'reconocimiento' | 'pago';
  categoria: string;
  sentido: 'debito' | 'credito';
  origen: MovementOrigen;
  condicion?: MovementCondition | MovementCondition[] | null;
  orden?: number;
}

// ─────────────────────────────────────────────────────────────────
// Simulador (POST /api/fin/config/simulate — nunca escribe datos)
// ─────────────────────────────────────────────────────────────────

export interface SimulatedMovement {
  categoria: string;
  sentido: 'debito' | 'credito';
  amount: number;
  currency?: string;
  exchange_rate?: number;
  currency_origin?: string | null;
  traza?: { template?: string; metrica?: string; regla?: string } | null;
}

export interface SimulateResult {
  doctype: string;
  document_id: string | null;
  metrics: Record<string, unknown>;
  movimientos: SimulatedMovement[];
  total_debitos: number;
  total_creditos: number;
  equilibrado: boolean;
  regla: { fuente: 'borrador' | 'regla_activa'; version?: number };
  escribe_datos: boolean;
}

/** Documento real para el selector del simulador (GET /api/fin/documents). */
export interface FinDocumentOption {
  id: string;
  number: string;
  date: string | null;
  total: number | string | null;
  status: string;
}

// ─────────────────────────────────────────────────────────────────
// Saldos iniciales (GET/POST /api/fin/opening-balances)
// ─────────────────────────────────────────────────────────────────

export interface OpeningBalance {
  id: string;
  category_code: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  amount_cup: number;
  as_of_date: string;
  status: 'draft' | 'applied' | 'voided' | string;
  entry_id: string | null;
  notes: string | null;
  authorized_by: string | null;
  created_at: string;
  applied_at: string | null;
}

// ─────────────────────────────────────────────────────────────────
// Errores de contabilización (tabla fin_posting_errors, lectura RLS)
// ─────────────────────────────────────────────────────────────────

export interface PostingErrorRow {
  id: string;
  store_id: string;
  document_type: string;
  document_id: string;
  document_number: string | null;
  event: string;
  error_code: string | null;
  error_detail: string | null;
  attempts: number;
  created_at: string;
  last_attempt_at: string | null;
  resolved_at: string | null;
}

/** Resultado de POST /api/fin/posting {action:'reprocess'}. */
export interface ReprocessResult {
  resueltos: number;
  fallidos: number;
}

/** Resultado de POST /api/fin/config/rule-action. */
export interface RuleActionResult {
  status: string;
  rule_version_id?: string;
  advertencias?: string[];
}

// ─────────────────────────────────────────────────────────────────
// Utilidades de la vista
// ─────────────────────────────────────────────────────────────────

/** Etiquetas y colores por clase de categoría (partida doble). */
export const CLASE_META: Record<string, { label: string; badge: string; dot: string }> = {
  activo: { label: 'Activo', badge: 'bg-blue-500/10 text-blue-600 border-blue-500/30', dot: 'bg-blue-500' },
  pasivo: { label: 'Pasivo', badge: 'bg-red-500/10 text-red-600 border-red-500/30', dot: 'bg-red-500' },
  patrimonio: { label: 'Patrimonio', badge: 'bg-violet-500/10 text-violet-600 border-violet-500/30', dot: 'bg-violet-500' },
  ingreso: { label: 'Ingreso', badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', dot: 'bg-emerald-500' },
  gasto: { label: 'Gasto', badge: 'bg-orange-500/10 text-orange-600 border-orange-500/30', dot: 'bg-orange-500' },
};

export function claseMeta(clase: string) {
  return CLASE_META[clase] ?? { label: clase, badge: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground' };
}

/** Tipos documentales con documentos reales consultables (GET /api/fin/documents). */
export const SIMULATOR_SUPPORTED_DOCTYPES = [
  'VENTA',
  'DEVOLUCION_VENTA',
  'RECEPCION',
  'SERVICIO_RECIBIDO',
  'VALE_SALIDA',
  'AJUSTE_INVENTARIO',
  'COMISION',
  'NOMINA',
  'FLUJO_CAJA',
] as const;

/** Módulos del catálogo, en el orden institucional del menú. */
export const MODULE_ORDER = [
  'Ventas',
  'Inventario',
  'Servicios',
  'Recursos Humanos',
  'Caja',
  'Producción',
  'Sistema',
] as const;

/** Resumen legible de una condición (objeto o array AND). */
export function summarizeCondition(cond?: MovementCondition | MovementCondition[] | null): string {
  if (!cond) return '—';
  const list = Array.isArray(cond) ? cond : [cond];
  if (list.length === 0) return '—';
  const one = (c: MovementCondition) => {
    const valor = Array.isArray(c.valor) ? `[${c.valor.join(', ')}]` : c.valor;
    return `si ${c.campo} ${c.op} ${valor}`;
  };
  return list.map(one).join(' y ');
}
