import Decimal from 'decimal.js';

export type FormaCalculo = 'FIJO'|'IMPORTAR_ANEXO'|'PRORRATEO'|'COEFICIENTE'|'FORMULA';
export type BaseRef = { type: 'ANEXO'; anexoId: string } | { type: 'FILA'; classification: string };
export type RowSemanticType = 'COST' | 'MARGIN' | 'TAX' | 'TOTAL' | 'INFO';

export interface AuditEntry {
  ts: string;
  actor: string;
  note: string;
  type: 'INFO' | 'WARNING' | 'ERROR' | 'RULE_APPLIED' | 'CYCLE_DETECTED';
  rowId?: string;
  prev?: string; // Stored as string to preserve precision in audit
  now?: string;
}

export interface CalculationRule {
  id: string;
  name: string;
  description: string;
  version: string; // Semantic versioning for rules
  targetClassification?: string; // Apply to rows with this classification prefix/match
  targetType?: RowSemanticType; // Apply to rows of this semantic type
  condition?: string; // Expression to check if rule applies
  formulaOverride?: string; // Override formula or calculation method logic
  priority: number;
  enabled: boolean;
}

export interface CostRow {
  id: string;                       // uuid
  parentId?: string | null;
  classification: string;           // ej "1","1.1","3.2"
  type: RowSemanticType;            // Semantic classification
  label: string;
  valorHistorico?: number | null;   // input del usuario (acepta 0.01)
  formaCalculo: FormaCalculo;
  baseCalculo?: BaseRef | null;
  coeficiente?: number | null;      // decimal (ej 0.2)
  formula?: string | null;          // expresión segura para FORMULA
  fuente?: string;                  // texto explicativo
}

export interface CalculatedRow extends CostRow {
  total: number;
  baseTotal?: number;
  baseHist?: number;
  audit: AuditEntry[];
}

export interface AnexoRow { classification: string; importe: number; [key: string]: any; }
export interface Anexo { id: string; name?: string; rows: AnexoRow[]; }

export interface FichaJSON {
  meta: {
    id: string;
    name: string;
    currency: string;
    decimals: number;
    createdAt?: string;
    version?: string;
    settings?: {
      maxIter?: number;
      damping?: number;
      allowFormulas?: boolean; // FORMULA restricted by default
      autoSave?: boolean;
    };
  };
  rows: CostRow[];
  anexos: Anexo[];
  rules?: CalculationRule[];
}

export interface CalculationResult {
  fichaId: string;
  rows: CalculatedRow[];
  audits: AuditEntry[];
  summary: {
    totalCost: number;
    totalMargin: number;
    totalTax: number;
    grandTotal: number;
  };
  elapsedMs: number;
}
