export interface CostSheetHeader {
  code: string;
  name: string;
  date: string;
  quantity: number | string;
  currency: string;
  category: string;
  type: string;
  unit: string;
  client?: string;
  elaboratedBy?: string;
  revisedBy?: string;
  approvedBy?: string;
  signature?: string;
  [key: string]: string | number | boolean | undefined;
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
  /** @deprecated Use isPercent instead. Kept for backward compatibility with existing data. */
  is_percent?: boolean;
  children?: CostSheetRow[];
  helpText?: string;
  note?: string;
  fuente?: string;
  unit?: string;
  metadata?: Record<string, unknown>;
  classification?: string;
  type?: string;
  coeficiente?: number;
  um?: string;
  [key: string]: string | number | boolean | undefined | null | CostSheetRow[] | Record<string, unknown>;
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
  isAdjustmentActive?: boolean;
  columns: CostSheetColumn[];
  data: any[];
}

export interface CostSheetSignature {
  prepared_by: string;
  approved_by: string;
}

export interface IndirectConfig {
  mode?: 'coefficient' | 'fixed';
  selectedSections: string[];
  baseSection: string;
  coefficient: number;
  fixedAmount?: number;
  isSimulation?: boolean;
}

export interface CostSheetData {
  id?: string;
  name?: string;
  version?: string;
  metadata?: Record<string, unknown>;
  header: CostSheetHeader;
  sections: CostSheetSection[];
  annexes: CostSheetAnnex[];
  signature: CostSheetSignature;
  indirectConfig?: IndirectConfig;
  footer?: string;
  [key: string]: string | number | boolean | undefined | null | CostSheetHeader | CostSheetSection[] | CostSheetAnnex[] | CostSheetSignature | IndirectConfig | Record<string, unknown>;
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
