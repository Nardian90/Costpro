/**
 * Inventario Físico — tipos compartidos y metadatos de presentación.
 *
 * Espejo del esquema real `physical_inventories` / `physical_inventory_items`
 * (migración 20261023000000). Estados y transiciones validados por trigger
 * `fn_validate_pi_transition` en BD — esta tabla es SOLO presentación.
 */

export type PIStatus =
  | 'draft'
  | 'prepared'
  | 'in_progress'
  | 'counted'
  | 'in_reconciliation'
  | 'pending_authorization'
  | 'conciliated'
  | 'closed'
  | 'voided';

export const PI_STATUS_META: Record<PIStatus, { label: string; className: string; dot: string }> = {
  draft: { label: 'Borrador', className: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
  prepared: { label: 'Preparado', className: 'bg-info/10 text-info', dot: 'bg-info' },
  in_progress: { label: 'En conteo', className: 'bg-warning/10 text-warning', dot: 'bg-warning' },
  counted: { label: 'Conteo completado', className: 'bg-primary/10 text-primary', dot: 'bg-primary' },
  in_reconciliation: { label: 'En conciliación', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  pending_authorization: { label: 'Pendiente de autorización', className: 'bg-purple-500/10 text-purple-500', dot: 'bg-purple-500' },
  conciliated: { label: 'Conciliado', className: 'bg-success/10 text-success', dot: 'bg-success' },
  closed: { label: 'Cerrado', className: 'bg-success/15 text-success font-bold', dot: 'bg-success' },
  voided: { label: 'Anulado', className: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
};

export const PI_STATUS_FILTER_LABELS: Record<string, string> = {
  all: 'Todos',
  draft: 'Borradores',
  prepared: 'Preparados',
  in_progress: 'En conteo',
  counted: 'Contados',
  in_reconciliation: 'En conciliación',
  pending_authorization: 'Pend. autorización',
  conciliated: 'Conciliados',
  closed: 'Cerrados',
  voided: 'Anulados',
};

// ══════════════════════════════════════════════════════════════════════════
// CICLO DE VIDA (MISIÓN CICLO DE VIDA 2026-10-27)
//
// Cuatro estados principales presentados al usuario — etiquetas EXACTAS:
//   Borrador · En proceso · Terminado · Anulado
// El flujo interno de 9 estados (con reglas de negocio de conteo/conciliación
// /ajustes) se conserva; el ciclo de vida es la capa de presentación Y de
// política (la matriz de permisos por estado se valida en servidor):
//
//   Borrador   = draft, prepared                → editable, iniciable, ELIMINABLE
//   En proceso = in_progress … conciliated      → editable (conteo), terminable,
//                                                 anulable con trazabilidad
//   Terminado  = closed                         → inmutable e irreversible
//   Anulado    = voided                         → consulta + motivo, inmutable
// ══════════════════════════════════════════════════════════════════════════

export type PILifecycleStage = 'borrador' | 'en_proceso' | 'terminado' | 'anulado';

export interface PILifecycleMeta {
  /** Etiqueta EXACTA requerida por la misión §5. */
  label: 'Borrador' | 'En proceso' | 'Terminado' | 'Anulado';
  className: string;
  dot: string;
  statuses: PIStatus[];
}

export const PI_LIFECYCLE_META: Record<PILifecycleStage, PILifecycleMeta> = {
  borrador: {
    label: 'Borrador',
    className: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground',
    statuses: ['draft', 'prepared'],
  },
  en_proceso: {
    label: 'En proceso',
    className: 'bg-warning/10 text-warning',
    dot: 'bg-warning',
    statuses: ['in_progress', 'counted', 'in_reconciliation', 'pending_authorization', 'conciliated'],
  },
  terminado: {
    label: 'Terminado',
    className: 'bg-success/15 text-success font-bold',
    dot: 'bg-success',
    statuses: ['closed'],
  },
  anulado: {
    label: 'Anulado',
    className: 'bg-destructive/10 text-destructive',
    dot: 'bg-destructive',
    statuses: ['voided'],
  },
};

export const PI_LIFECYCLE_FILTER_LABELS: Record<'all' | PILifecycleStage, string> = {
  all: 'Todos',
  borrador: 'Borrador',
  en_proceso: 'En proceso',
  terminado: 'Terminado',
  anulado: 'Anulado',
};

/** Estado del ciclo de vida al que pertenece un estado interno. */
export function piLifecycleOf(status: PIStatus): PILifecycleStage {
  if (status === 'draft' || status === 'prepared') return 'borrador';
  if (status === 'closed') return 'terminado';
  if (status === 'voided') return 'anulado';
  return 'en_proceso';
}

/** Lista de estados internos de un ciclo de vida (para el filtro del listado). */
export function statusesOfLifecycle(stage: PILifecycleStage): PIStatus[] {
  return PI_LIFECYCLE_META[stage].statuses;
}

// ── Matriz de permisos por estado (misión §3 — espejo de las validaciones
//    del servidor; los botones solo REFLEJAN lo que el backend permite) ──

/** Editar datos/configuración (cabecera) — solo Borrador (RPC update_physical_inventory). */
export function canEditPI(status: PIStatus): boolean {
  return status === 'draft' || status === 'prepared';
}

/** Capturar/modificar cantidades — solo mientras el conteo está activo. */
export function canCountPI(status: PIStatus): boolean {
  return status === 'in_progress';
}

/** Iniciar inventario (Borrador → En proceso): preparar (draft) o iniciar conteo (prepared). */
export function canStartPI(status: PIStatus): boolean {
  return status === 'draft' || status === 'prepared';
}

/** Acción de ciclo de vida disponible (fases del flujo hacia Terminado). */
export function canWorkTowardsFinishPI(status: PIStatus): boolean {
  return ['in_progress', 'counted', 'in_reconciliation', 'pending_authorization', 'conciliated'].includes(status);
}

/** Anular — EXCLUSIVO de En proceso sin efectos generados (RPC void_physical_inventory). */
export function canVoidPI(status: PIStatus): boolean {
  return ['in_progress', 'counted', 'in_reconciliation', 'pending_authorization'].includes(status);
}

/** Eliminar definitivamente — EXCLUSIVO de Borrador (RPC delete_physical_inventory). */
export function canDeletePI(status: PIStatus): boolean {
  return status === 'draft' || status === 'prepared';
}

/** Modo consulta: Terminado y Anulado (la interfaz oculta/deshabilita acciones). */
export function isReadOnlyPI(status: PIStatus): boolean {
  return status === 'closed' || status === 'voided';
}

export type PIScopeType = 'full' | 'category' | 'selection';

export const PI_SCOPE_LABELS: Record<PIScopeType, string> = {
  full: 'Catálogo completo',
  category: 'Por categoría',
  selection: 'Selección de productos',
};

/** Cabecera del inventario físico (listado). */
export interface PIHeader {
  id: string;
  pi_number: string | null;
  status: PIStatus;
  cutoff_date: string;
  description: string | null;
  responsible_name: string | null;
  scope_type: PIScopeType;
  blind_mode: boolean;
  total_items: number;
  counted_items: number;
  pending_items: number;
  shortfall_items: number;
  surplus_items: number;
  created_at: string;
  observations?: string | null;
  snapshot_meta?: Record<string, unknown> | null;
  count_started_at?: string | null;
  count_completed_at?: string | null;
  submitted_at?: string | null;
  authorized_at?: string | null;
  closed_at?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  store?: { name: string } | null;
  creator?: { full_name: string } | null;
  adjustments?: PIAdjustmentLink[];
}

export interface PIAdjustmentLink {
  id: string;
  kind: 'shortfall' | 'surplus';
  items_count: number;
  adjustment_id: string;
  generated_at: string;
  adjustment?: {
    id: string;
    status: 'pending' | 'confirmed' | 'reversed' | 'voided';
    reason: string;
    notes: string | null;
    created_at: string;
    confirmed_at: string | null;
  } | null;
}

/** Línea de conteo (vista ciego-segura: sin theoretical si no autorizado). */
export interface PILine {
  id: string;
  line_number: number;
  product_id: string;
  sku: string | null;
  name: string;
  unit: string;
  counted_qty: number | null;
  status: 'pending' | 'counted' | 'review';
  updated_at: string;
  counted_at: string | null;
  theoretical_qty?: number;
  theoretical_source?: 'inventory' | 'ledger' | 'ledger_drift';
  difference?: number;
  review_notes?: string | null;
}

/** Línea de conciliación (con teóricas + movimientos post-corte). */
export interface PIReconciliationLine extends PILine {
  category: string | null;
  theoretical_qty: number;
  theoretical_source: 'inventory' | 'ledger' | 'ledger_drift';
  difference: number;
  theoretical_unit_cost: number;
  difference_value: number;
  review_notes: string | null;
  reviewed_by: string | null;
  counted_by: string | null;
  post_cutoff_movements: number;
  post_cutoff_net: number;
}

export interface PIReconciliation {
  pi: PIHeader;
  lines: PIReconciliationLine[];
  totals: {
    total_items: number;
    counted: number;
    pending: number;
    match: number;
    shortfall: number;
    surplus: number;
    drift: number;
    post_cutoff_affected: number;
  };
}

export interface PISheet {
  id: string;
  seq: number;
  mode: 'with_theoretical' | 'blind';
  total_lines: number;
  generated_at: string;
  generated_by: string;
}

export type CountSource = 'manual' | 'excel';
