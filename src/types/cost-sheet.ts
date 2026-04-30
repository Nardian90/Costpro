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
  product_code?: string;
  production_level?: number | string;
  capacity_utilization?: number | string;
  sale_price?: number | string;
  [key: string]: any;
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
  calculationMethod?: 'Prorrateo' | 'ValorFijo' | 'FORMULA' | 'ANEXO' | 'ANEXO_REF' | 'FIJO' | 'MANUAL';
  totalFormula?: string | null;
  formula?: string;
  isPercent?: boolean;
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
  total?: number;
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

export type ScenarioId = 'v1' | 'v2' | 'v3';
export type ScenarioColor = 'blue' | 'violet' | 'amber';

export interface ScenarioRowValues {
  valorHistorico?: number;
  totalFormula?: string;
  vhFormula?: string;
  coeficiente?: number;
  baseDeCalculoRef?: string;
}

export type ScenarioValues = Record<string, ScenarioRowValues>;

export interface CostSheetScenario {
  id: ScenarioId;
  label: string;
  color: ScenarioColor;
  createdAt: number;
  values: ScenarioValues;
  header?: Partial<CostSheetHeader>;
}

export interface ScenarioConfig {
  primaryScenarioId: ScenarioId;
  comparisonBaseId: ScenarioId;
}

export interface CostSheetData {
  id?: string;
  name?: string;
  version?: string;
  metadata?: Record<string, any>;
  header: CostSheetHeader;
  sections: CostSheetSection[];
  annexes: CostSheetAnnex[];
  signature: CostSheetSignature;
  indirectConfig?: IndirectConfig;
  footer?: string;
  scenarioConfig?: ScenarioConfig;
  scenarios?: CostSheetScenario[];
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

export interface ExportOptions {
  includeFC?: boolean;
  includeAudit?: boolean;
  includeAnnexes?: string[];
  consolidated?: boolean;
  exportMode?: 'comparison' | 'standard';
}
