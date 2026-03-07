import Dexie, { type Table } from 'dexie';

export interface BankTransaction {
  id?: number;
  fecha: string;
  referencia: string;
  descripcion: string;
  importe: number;
  tipo: 'ENTRADA' | 'SALIDA';
  categoria?: string;
  subcategoria?: string;
  match_id?: string;
  store_id?: string;
}

export interface MatchingRule {
  id?: number;
  pattern: string;
  category: string;
  subcategory: string;
  priority: number;
}

export interface Product {
  id?: number;
  cod: string;
  nombre: string;
  precio_venta: number;
  costo: number;
  stock_inicial_manual?: number;
}

export interface ReconciliationLine {
  id?: number;
  transaction_ref: string;
  product_cod: string;
  cantidad: number;
  importe_linea_cents: number;
  clasificacion: 'Efectivo' | 'Transferencia' | 'QR';
  vendedor_id?: string;
  fecha_conciliacion: string;
}

export interface IngestionError {
  id?: number;
  fecha: string;
  filename: string;
  error_message: string;
  raw_line: string;
}

export interface IPVSettings {
  id: string;
  logo_url?: string;
  paper_size?: 'LETTER' | 'A4';
  entidad_nombre?: string;
  entidad_codigo?: string;
  updated_at: string;
}

export class CostProDatabase extends Dexie {
  bank_statements!: Table<BankTransaction>;
  matching_rules!: Table<MatchingRule>;
  products!: Table<Product>;
  reconciliation_lines!: Table<ReconciliationLine>;
  ingestion_errors!: Table<IngestionError>;
  ipv_settings!: Table<IPVSettings>;

  constructor() {
    super('CostProIPV');
    this.version(4).stores({
      bank_statements: '++id, fecha, referencia, match_id',
      matching_rules: '++id, pattern, priority',
      products: '++id, cod, nombre',
      reconciliation_lines: '++id, transaction_ref, product_cod, clasificacion',
      ingestion_errors: '++id, fecha, filename',
      ipv_settings: 'id'
    });
  }
}

export const db = new CostProDatabase();
