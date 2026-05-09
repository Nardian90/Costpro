import Decimal from 'decimal.js';

export type FormaCalculo = 'FIJO'|'IMPORTAR_ANEXO'|'PRORRATEO'|'COEFICIENTE'|'FORMULA'|'ANEXO'|'PORCENTAJE'|'DISTRIBUCION';
export type BaseRef = { type: 'ANEXO'; anexoId: string } | { type: 'FILA'; classification: string };
export type RowSemanticType = 'COST' | 'MARGIN' | 'TAX' | 'TOTAL' | 'INFO';

export interface AuditEntry {
  ts: string;
  actor: string;
  note: string;
  type: 'INFO' | 'WARNING' | 'ERROR' | 'RULE_APPLIED' | 'CYCLE_DETECTED';
  rowId?: string;
  prev?: string;
  now?: string;
}

export interface CalculationRule {
  id: string;
  name: string;
  description: string;
  version: string;
  targetClassification?: string;
  targetType?: RowSemanticType;
  condition?: string;
  formulaOverride?: string;
  priority: number;
  enabled: boolean;
}

export interface CostRow {
  id: string;
  parentId?: string | null;
  classification: string;
  type: RowSemanticType;
  label: string;
  um?: string | null;
  valorHistorico?: number | null;
  vhFormula?: string | null;
  formaCalculo: FormaCalculo;
  baseCalculo?: BaseRef | null;
  coeficiente?: number | null;
  formula?: string | null;
  totalFormula?: string | null;
  fuente?: string;
  metadata?: Record<string, any>;
}

export interface CalculatedRow extends CostRow {
  total: number;
  calculatedVH: number;
  baseTotal?: number;
  baseHist?: number;
  audit: AuditEntry[];
}

export interface AnexoRow {
  classification: string;
  importe: number;
  description?: string;
  um?: string;
  label?: string;
  no?: number;
  norm?: number;
  consumption_norm?: number;
  price?: number;
  price_unit?: number;
  total?: number;
  amount?: number;
  time_norm?: number;
  hourly_rate?: number;
  worker_count?: number;
  quantity?: number;
  qty?: number;
  cantidad?: number;
  rate?: number;
  value?: number;
  cost?: number;
  costo_unitario?: number;
  precio?: number;
  depreciation_cost?: number;
  [key: string]: string | number | boolean | undefined;
}
export interface Anexo { id: string; name?: string; rows: AnexoRow[]; }

export interface FichaMeta {
  id: string;
  name: string;
  currency: string;
  decimals: number;
  quantity?: number | string;
  createdAt?: string;
  version?: string;
  category?: string;
  type?: string;
  unit?: string;
  date?: string;
  code?: string;
  settings?: {
    maxIter?: number;
    damping?: number;
    allowFormulas?: boolean;
    autoSave?: boolean;
    maxAuditEntries?: number;
  };
}

export interface FichaJSON {
  meta: FichaMeta;
  rows: CostRow[];
  anexos: Anexo[];
  rules?: CalculationRule[];
}

export interface ValidationError {
  rowId: string;
  message: string;
  type: 'CRITICAL' | 'WARNING' | 'INFO';
  code: 'CYCLE' | 'MISSING_REF' | 'SEMANTIC_DISCREPANCY' | 'INVALID_FORMULA' | 'HARD_RULE_VIOLATION' | 'TRIVIAL_FORMULA' | 'HIERARCHY' | 'EXTERNAL_LINK' | 'RESERVED_NAME';
}

export interface CalculationResult {
  fichaId: string;
  fichaName?: string;
  metadata?: any;
  rows: CalculatedRow[];
  anexos: Anexo[];
  audits: AuditEntry[];
  validationErrors?: string[];
  deepValidationErrors?: ValidationError[];
  summary: {
    totalCost: number;
    totalMargin: number;
    totalTax: number;
    grandTotal: number;
  };
  elapsedMs: number;
}
