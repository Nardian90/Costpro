/**
 * Tipos del Centro de Análisis Dinámico.
 * Reutilizables para cualquier módulo (costos, ventas, inventario, etc.).
 */

export type AggregationFunction =
  | 'sum' | 'avg' | 'count' | 'max' | 'min' | 'median'
  | 'var' | 'stddev' | 'pct_total' | 'pct_group' | 'cumulative'
  | 'cost_avg' | 'cost_weighted' | 'cost_unit' | 'cost_total'
  | 'margin' | 'profitability' | 'var_abs' | 'var_pct';

export type DateGrouping = 'day' | 'week' | 'month' | 'quarter' | 'semester' | 'year';

export type SortDirection = 'asc' | 'desc';

export interface AnalyticsField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  groupable: boolean;
  aggregatable: boolean;
  format?: 'currency' | 'percent' | 'number' | 'date';
  currency?: string;
}

export interface AnalyticsDropZone {
  id: 'rows' | 'columns' | 'values' | 'filters';
  label: string;
  items: AnalyticsZoneItem[];
}

export interface AnalyticsZoneItem {
  fieldKey: string;
  label: string;
  aggregation?: AggregationFunction;
  sortDirection?: SortDirection;
  dateGrouping?: DateGrouping;
}

export interface AnalyticsFilter {
  fieldKey: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'between';
  value: unknown;
}

export interface AnalyticsViewConfig {
  rows: AnalyticsZoneItem[];
  columns: AnalyticsZoneItem[];
  values: AnalyticsZoneItem[];
  filters: AnalyticsFilter[];
  columnWidths: Record<string, number>;
  hiddenColumns: string[];
  sortConfig: { fieldKey: string; direction: SortDirection }[];
}

export interface SavedAnalyticsView {
  id: string;
  user_id: string;
  store_id: string | null;
  name: string;
  description: string | null;
  module: string;
  config: AnalyticsViewConfig;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsDataSet<T = Record<string, unknown>> {
  fields: AnalyticsField[];
  data: T[];
  totalRecords: number;
}

export interface AnalyticsProps {
  /** Conjunto de datos a analizar */
  dataSet: AnalyticsDataSet;
  /** Módulo al que pertenece (costs, sales, inventory, etc.) */
  module: string;
  /** Store ID para filtrar por tienda */
  storeId?: string;
  /** Título de la vista */
  title: string;
  /** Descripción opcional */
  description?: string;
  /** Callback cuando se guarda una vista */
  onSaveView?: (view: Partial<SavedAnalyticsView>) => Promise<void>;
  /** Callback para cargar vistas guardadas */
  onLoadViews?: () => Promise<SavedAnalyticsView[]>;
  /** Callback para eliminar vista */
  onDeleteView?: (viewId: string) => Promise<void>;
  /** ClassName adicional */
  className?: string;
  /** Configuración inicial controlada (para plantillas) */
  initialConfig?: AnalyticsViewConfig | null;
  /** Callback cuando la configuración cambia (para que el parent sepa) */
  onConfigChange?: (config: AnalyticsViewConfig) => void;
}

// ── Helpers de agregación ──

export const AGGREGATION_LABELS: Record<AggregationFunction, string> = {
  sum: 'Suma',
  avg: 'Promedio',
  count: 'Conteo',
  max: 'Máximo',
  min: 'Mínimo',
  median: 'Mediana',
  var: 'Varianza',
  stddev: 'Desv. Est.',
  pct_total: '% del Total',
  pct_group: '% del Grupo',
  cumulative: 'Acumulado',
  cost_avg: 'Costo Prom.',
  cost_weighted: 'Costo Ponderado',
  cost_unit: 'Costo Unit.',
  cost_total: 'Costo Total',
  margin: 'Margen',
  profitability: 'Rentabilidad',
  var_abs: 'Var. Absoluta',
  var_pct: 'Var. Porcentual',
};

export const DATE_GROUPING_LABELS: Record<DateGrouping, string> = {
  day: 'Día',
  week: 'Semana',
  month: 'Mes',
  quarter: 'Trimestre',
  semester: 'Semestre',
  year: 'Año',
};

export function aggregate(
  values: number[],
  fn: AggregationFunction,
  groupTotal?: number,
  grandTotal?: number
): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);

  switch (fn) {
    case 'sum': return values.reduce((a, b) => a + b, 0);
    case 'avg': return values.reduce((a, b) => a + b, 0) / values.length;
    case 'count': return values.length;
    case 'max': return Math.max(...values);
    case 'min': return Math.min(...values);
    case 'median':
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    case 'var':
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    case 'stddev':
      const v = aggregate(values, 'var');
      return Math.sqrt(v);
    case 'pct_total':
      return grandTotal ? (values.reduce((a, b) => a + b, 0) / grandTotal) * 100 : 0;
    case 'pct_group':
      return groupTotal ? (values.reduce((a, b) => a + b, 0) / groupTotal) * 100 : 0;
    case 'cumulative':
      return values.reduce((a, b) => a + b, 0);
    case 'cost_avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'cost_weighted':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'cost_unit':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'cost_total':
      return values.reduce((a, b) => a + b, 0);
    case 'margin':
      return values.reduce((a, b) => a + b, 0);
    case 'profitability':
      return values.reduce((a, b) => a + b, 0);
    case 'var_abs':
      return values.reduce((a, b) => a + b, 0);
    case 'var_pct':
      return values.reduce((a, b) => a + b, 0);
    default: return 0;
  }
}

export function formatDateGroup(date: Date, grouping: DateGrouping): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  const semester = month < 6 ? 1 : 2;
  const week = Math.ceil((date.getDate() + new Date(year, month, 1).getDay()) / 7);

  switch (grouping) {
    case 'day': return date.toISOString().split('T')[0];
    case 'week': return `${year}-S${String(week).padStart(2, '0')}`;
    case 'month': return `${year}-${String(month + 1).padStart(2, '0')}`;
    case 'quarter': return `${year}-T${quarter}`;
    case 'semester': return `${year}-H${semester}`;
    case 'year': return String(year);
    default: return date.toISOString().split('T')[0];
  }
}
