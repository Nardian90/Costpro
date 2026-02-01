import Dexie, { type Table } from 'dexie';

// --- Interfaces ---

export interface BankTransaction {
  id: string;                  // UUID o hash fila
  fecha: string;               // YYYY-MM-DD
  referencia_corta: string;
  referencia_origen: string;   // UNIQUE
  observaciones: string;
  importe_cents: number;       // EN CENTAVOS (integer)
  tipo: 'Cr' | 'Db';
  estado_conciliacion: 'PENDIENTE' | 'PARCIAL' | 'COMPLETO';
  ipv_id?: string;             // FK ipv_reports.id
  created_at: string;
  updated_at?: string;
  ingestion_hash: string;      // HASH para idempotencia
}

export interface Product {
  cod: string;
  descripcion: string;
  um: string;
  es_paquete: boolean;
  contenido_paquete: number;
  precio_cents: number;        // EN CENTAVOS
  prioridad_algoritmo: number; // 1..5
  activo: boolean;
  created_at: string;
  updated_at?: string;
}

export interface MatchingRule {
  id: string;
  tipo: 'HARD_REF' | 'EXACT_SUM' | 'TOLERANCE' | 'CASH_FILL';
  tolerancia_cents?: number;   // en centavos, aplicable a TOLERANCE
  prioridad: number;
  activo: boolean;
  meta?: Record<string, any>;
}

export interface ReconciliationLine {
  id: string;
  transaction_ref: string;     // FK -> BankTransaction.referencia_origen
  fecha_operacion: string;
  ingreso_banco_cents: number;
  venta_real_calculada_cents: number;
  comision_banco_cents: number;
  product_cod: string;
  product_um: string;
  cantidad: number;
  precio_unitario_cents: number;
  importe_linea_cents: number;
  cuadre_cents: number;
  clasificacion: 'Transferencia' | 'Efectivo' | 'QR';
  origen_dato: 'AUTO_MATCH' | 'MANUAL_USER' | 'CASH_FILLER';
  reconciliation_hash: string; // hash(transaction_ref + detalle) -> idempotencia
  created_at: string;
}

export interface DailyIPVReport {
  id: string;
  fecha_reporte: string;
  total_ventas_cents: number;
  resumen_efectivo_cents: number;
  resumen_transferencia_cents: number;
  filas: {
    cod: string;
    descripcion: string;
    um: string;
    saldo_inicial_qty: number;
    entrada_salida_qty: number;
    total_disponible_qty: number;
    venta_cantidad_qty: number;
    precio_unitario_cents: number;
    importe_cents: number;
    existencia_final_qty: number;
  }[];
  firmas: {
    realizado_por: string;
    fecha_generacion: string;
  };
  estado: 'BORRADOR' | 'CERRADO' | 'ANULADO';
  created_at: string;
}

export interface CashAdjustment {
  id: string;
  fecha: string;
  monto_cents: number;
  motivo: string;
  aprobado_por: string;
  created_at: string;
}

export interface DailyAggregate {
  fecha: string;
  total_cents: number;
  by_product: {
    cod: string;
    descripcion: string;
    cantidad: number;
    importe_cents: number;
  }[];
}

export interface MatchingCache {
  importe_cents: number;
  catalog_hash: string;
  results: {
    product_cod: string;
    cantidad: number;
  }[];
  updated_at: string;
}

// --- Dexie Database ---

export class IPVDatabase extends Dexie {
  bank_statements!: Table<BankTransaction>;
  products!: Table<Product>;
  matching_rules!: Table<MatchingRule>;
  reconciliation_lines!: Table<ReconciliationLine>;
  ipv_reports!: Table<DailyIPVReport>;
  cash_adjustments!: Table<CashAdjustment>;
  daily_aggregates!: Table<DailyAggregate>;
  matching_cache!: Table<MatchingCache>;

  constructor() {
    super('IPVDB');
    this.version(2).stores({
      bank_statements: '&referencia_origen, fecha, importe_cents, ingestion_hash',
      products: '&cod, descripcion, precio_cents, prioridad_algoritmo, activo',
      matching_rules: '&id, tipo, prioridad',
      reconciliation_lines: '&id, transaction_ref, reconciliation_hash, fecha_operacion',
      ipv_reports: '&id, fecha_reporte, estado',
      cash_adjustments: '&id, fecha',
      daily_aggregates: '&fecha',
      matching_cache: '&importe_cents'
    });
  }
}

export const db = new IPVDatabase();
