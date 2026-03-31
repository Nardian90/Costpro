export interface CostSheetHeader {
  code: string;
  name: string;
  date: string;
  quantity: number | string;
  currency: string;
  category: string;
  type: string;
  unit: string;
  [key: string]: any; // Allow for extra metadata
}

export interface CostSheetRow {
  id: string;
  label: string;
  valorHistorico?: number;
  vhFormula?: string | null;
  value?: number;
  baseDeCalculoRef?: string | null;
  baseRef?: string | null;
  base_ref?: string | null;
  calculationMethod?: 'Prorrateo' | 'ValorFijo' | 'FORMULA' | 'ANEXO';
  totalFormula?: string | null;
  formula?: string;
  isPercent?: boolean;
  is_percent?: boolean;
  children?: CostSheetRow[];
  helpText?: string;
  [key: string]: any;
}

export interface CostSheetSection {
  id: string;
  label?: string;
  rows: CostSheetRow[];
}

export interface CostSheetColumn {
  key: string;
  label?: string;
  title?: string;
  formula?: string;
  type?: 'number' | 'string' | 'formula' | 'text';
}

export interface CostSheetAnnex {
  id: string;
  title: string;
  coefficient?: number;
  adjustmentColumn?: string;
  columns: CostSheetColumn[];
  data: any[]; // Data rows can have dynamic keys based on columns
}

export interface CostSheetSignature {
  prepared_by: string;
  approved_by: string;
}

export interface CostSheetData {
  id?: string;
  name?: string;
  version?: string;
  metadata?: any;
  header: CostSheetHeader;
  sections: CostSheetSection[];
  annexes: CostSheetAnnex[];
  signature: CostSheetSignature;
  footer?: string;
  [key: string]: any;
}

export interface CalculatedRowValue {
  valorHistorico: number;
  calculatedVH: number;
  baseDeCalculoRef: string | null;
  baseTotal: number;
  baseValorHistorico: number;
  coeficiente: number;
  total: number;
  fuente?: string;
  metadata?: Record<string, any>;
  audits?: any[];
  hasWarnings?: boolean;
  validationErrors?: { message: string, type: 'CRITICAL' | 'WARNING' | 'INFO', code: string }[];
}
