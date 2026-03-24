export type FieldSource = 'static' | 'dynamic' | 'expression' | 'template';

export interface FieldConfig {
  key: string;
  source: FieldSource;
  value: string;
}

export interface MVTSection {
  title: string;
  fields: FieldConfig[];
  type: 'single' | 'repeatable';
  dataSource?: 'products' | 'movements';
}

export interface MVTTemplate {
  id: string;
  name: string;
  description?: string;
  sections: MVTSection[];
  isDefault?: boolean;
  version: number;
}

export interface MVTSettings {
  id: string; // 'current'
  lastExportNumber: number;
  defaultTemplateId: string;
  globalUM: string;
  globalCuenta?: string;
  almacen: string;
  centro: string;
  concepto: string;
}

export interface MVTExportLog {
  id: string;
  templateId: string;
  exportNumber: number;
  fileName: string;
  dateRange: { start: string; end: string };
  timestamp: string;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
}
