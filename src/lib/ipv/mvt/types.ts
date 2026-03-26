export type FieldSource = 'static' | 'dynamic' | 'expression' | 'template';

export interface FieldConfig {
  key: string;
  source: FieldSource;
  value: string;
  _id?: string; // Internal stable ID for UI reordering
}

export interface MVTSection {
  title: string;
  fields: FieldConfig[];
  type: 'single' | 'repeatable';
  renderMode?: 'key_value' | 'pipe_separated';
  dataSource?: 'products' | 'movements';
  hideTitle?: boolean;
  footer?: string; // For things like { ... } or closing tags
  showHeader?: boolean; // For [Ubicacion] specific headers
  _id?: string; // Internal stable ID for UI reordering
}

export interface MVTTemplate {
  id: string;
  name: string;
  description?: string;
  sections: MVTSection[];
  isDefault?: boolean;
  version: number;
  fileExtension?: 'mvt' | 'cyp';
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
