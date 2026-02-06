export interface CostSheetHeader {
  code: string;
  name: string;
  date: string;
  quantity: number;
  currency: string;
  category: string;
  type: string;
  unit: string;
  [key: string]: any; // Allow for extra metadata
}

export interface CostSheetRow {
  id: string;
  label: string;
  valor_historico?: number;
  vh_formula?: string | null;
  value?: number;
  base_ref?: string | null;
  calculation_method?: 'Prorrateo' | 'ValorFijo' | 'FORMULA' | 'ANEXO';
  total_formula?: string | null;
  formula?: string;
  is_percent?: boolean;
  children?: CostSheetRow[];
  help_text?: string;
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
  valor_historico: number;
  calculated_vh: number;
  base_ref: string | null;
  base_total: number;
  base_valor_historico: number;
  coeficiente: number;
  total: number;
  fuente?: string;
  metadata?: Record<string, any>;
  audits?: any[];
  has_warnings?: boolean;
  validation_errors?: { message: string, type: 'CRITICAL' | 'WARNING' | 'INFO', code: string }[];
}
