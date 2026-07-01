export type ReportType = 'TRANSFER' | 'QR';

export type TargetField =
  | 'amount'
  | 'date'
  | 'reference'
  | 'transaction_id'
  | 'account'
  | 'counterparty'
  | 'customer_name'
  | 'customer_id'     // carnet
  | 'currency'
  | 'channel'         // TRANSFER / QR
  | 'status'
  | 'description'
  | 'bank'
  | 'branch';

export type TransformType =
  | 'trim'
  | 'toUpperCase'
  | 'toLowerCase'
  | 'toNumber'
  | 'parseDate'
  | 'removeSymbols'
  | 'extractDigits'
  | 'currencyNormalize';

export type MappingRule = {
  id: string;
  reportType: ReportType;
  provider?: string;        // Opcional: banco u origen específico
  sourceColumn: string;     // nombre columna entrada
  targetField: TargetField; // campo interno
  transform?: TransformType;
  active: boolean;
  priority: number;
  createdAt: number;
  updatedAt: number;
};

export type MappingStats = {
  totalRows: number;
  mappedRows: number;
  failedRows: number;
  successRate: number; // %
  unmappedColumns: string[];
  errors: string[];
};

export type MappingExecution = {
  id: string;
  reportType: ReportType;
  timestamp: number;
  totalRows: number;
  successRate: number;
};
