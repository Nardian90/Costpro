import Dexie, { Table } from 'dexie';

export interface BankTransaction {
  id: string;
  fecha: string;
  referencia_corta: string;
  referencia_origen: string; // ID único real
  observaciones: string;
  importe_cents: number;
  comision_cents?: number;
  importe_venta_cents?: number;
  tipo: 'Cr' | 'Db';
  estado_conciliacion: 'PENDIENTE' | 'CONCILIADO' | 'PARCIAL';
  created_at: string;
  ingestion_hash: string;
  excluido?: boolean;
  fail_reason?: string;
  ipv_id?: string;
  updated_at?: string;
  carnet?: string;
  nombre_cliente?: string;
  nit?: string;
  impuesto?: number;
}

export interface Product {
  cod: string;
  descripcion: string;
  precio_cents: number;
  um?: string;
  prioridad_algoritmo: number;
  activo: boolean;
  stock_inicial_manual: number;
  isWildcardCandidate: boolean;
  id_grupo?: string;
  cod_hijo?: string;
  contenido_paquete?: number;
  cuenta_contable?: string;
  isEligibleForCashFill?: boolean;
}

export interface MatchingRule {
  id: string;
  tipo: 'STOCK_LIMIT' | 'HARD_REF' | 'EXACT_SUM' | 'CASH_FILL' | 'WILDCARDS' | 'TOLERANCE' | 'AUTO_SUPPLY' | 'PRICE_FLEX';
  prioridad: number;
  activo: boolean;
  meta?: any;
  descripcion?: string;
}

export interface ReconciliationLine {
  id: string;
  transaction_ref: string;
  fecha_operacion: string;
  transfer_amount_cents: number;
  cash_amount_cents: number;
  total_amount_cents: number;
  status: 'VALID' | 'INVALID_ORPHAN';
  payment_status: 'MATCHED' | 'PARTIAL' | 'OVERPAYMENT';
  product_cod: string;
  product_name: string;
  product_um: string;
  cantidad: number;
  precio_unitario_cents: number;
  origen_dato: 'AUTO_MATCH' | 'MANUAL_USER';
  parent_transaction_id?: string;
  source_type?: 'BANK_TRANSFER' | 'REAL_CASH_GOAL';
  observaciones?: string;
  reconciliation_hash: string;
  purchase_order_id?: number;
  adjustment_type?: "REBAJA" | "PROPINA";
  is_price_change?: boolean;
  purchase_order_id?: number;
  adjustment_type?: "REBAJA" | "PROPINA";
  is_price_change?: boolean;
  created_at: string;
}

export interface ProductMovement {
  id: string;
  fecha: string;
  producto_origen_cod: string;
  producto_destino_cod: string;
  cantidad_origen: number;
  cantidad_destino: number;
  tipo: 'MANUAL' | 'DECOMPOSITION' | 'RECONCILIATION';
  referencia_transaccion?: string;
  created_at: string;
}

export interface MatchingLog {
  id: string;
  transaction_ref: string;
  fecha_ejecucion: string;
  resultado_estado: string;
  matching_confidence: number;
  applied_rules: string[];
  trace: MatchingTrace[];
  logs: string[];
}

export interface MatchingTrace {
  timestamp: number;
  rule_id: string;
  rule_type: string;
  status: 'SUCCESS' | 'FAIL' | 'SKIPPED';
  detail: string;
  meta?: any;
}

export interface DailyIPVReport {
  id: string;
  fecha_reporte: string;
  total_transferencia_cents: number;
  total_efectivo_cents: number;
  total_general_cents: number;
  lineas: ReconciliationLine[];
  meta: {
    generado_por: string;
    fecha_generacion: string;
  };
  estado: 'BORRADOR' | 'CERRADO' | 'ANULADO';
  created_at: string;
}

export interface ProductPriceChange {
  id: string;
  product_cod: string;
  old_price_cents: number;
  new_price_cents: number;
  fecha: string;
  transaction_ref?: string;
  created_at: string;
}

export interface ProductPriceChange {
  id: string;
  product_cod: string;
  old_price_cents: number;
  new_price_cents: number;
  fecha: string;
  transaction_ref?: string;
  created_at: string;
}

export class IPVDatabase extends Dexie {
  bank_statements!: Table<BankTransaction>;
  products!: Table<Product>;
  matching_rules!: Table<MatchingRule>;
  reconciliation_lines!: Table<ReconciliationLine>;
  product_movements!: Table<ProductMovement>;
  ipv_reports!: Table<DailyIPVReport>;
  matching_logs!: Table<MatchingLog>;
  product_price_changes!: Table<ProductPriceChange>;

  constructor() {
    super('IPVDB');
    this.version(32).stores({
      bank_statements: '&referencia_origen, fecha, importe_cents, ingestion_hash, carnet, nombre_cliente, nit, impuesto',
      products: '&cod, descripcion, precio_cents, prioridad_algoritmo, activo, id_grupo, cod_hijo, isEligibleForCashFill',
      matching_rules: '&id, tipo, prioridad, activo',
      reconciliation_lines: '&id, transaction_ref, reconciliation_hash, fecha_operacion, product_cod, parent_transaction_id, source_type, status, payment_status, purchase_order_id',
      product_movements: '&id, fecha, producto_origen_cod, producto_destino_cod, tipo, referencia_transaccion',
      ipv_reports: '&id, fecha_reporte, estado',
      matching_logs: '&id, transaction_ref, fecha_ejecucion, resultado_estado, matching_confidence, *applied_rules',
      product_price_changes: "&id, product_cod, fecha"
    });
  }
}

export const db = new IPVDatabase();
