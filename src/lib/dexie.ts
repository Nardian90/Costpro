import Dexie, { type Table } from 'dexie';

// --- Interfaces ---

export interface BankTransaction {
  id: string;                  // UUID o hash fila
  fecha: string;               // YYYY-MM-DD
  referencia_corta: string;
  referencia_origen: string;   // UNIQUE
  observaciones: string;
  importe_cents: number;       // En Pesos (decimal)
  comision_cents?: number;     // Extraído de observaciones
  importe_venta_cents?: number; // importe_cents + comision_cents
  tipo: 'Cr' | 'Db';
  estado_conciliacion: 'PENDIENTE' | 'PARCIAL' | 'COMPLETO' | 'NO_PROCESAR';
  ipv_id?: string;             // FK ipv_reports.id
  excluido?: boolean;          // Excluir del matching
  created_at: string;
  updated_at?: string;
  ingestion_hash: string;      // HASH para idempotencia
  // Persistence for Transfer Report
  carnet?: string;
  nombre_cliente?: string;
  telefono_cliente?: string;
}

export interface Product {
  cod: string;
  descripcion: string;
  um: string;
  es_paquete: boolean;
  contenido_paquete: number;
  precio_cents: number;        // En Pesos (decimal) - PRECIO ACTUAL/AJUSTADO
  precio_base_cents?: number;  // Precio original de catálogo
  prioridad_algoritmo: number; // 1..5
  activo: boolean;
  stock_inicial_manual: number;
  created_at: string;
  updated_at?: string;
  // Inteligencia de precios
  categoria?: string;
  isWildcardCandidate?: boolean;
  priceEffectivenessScore?: number;
  suggestedPrice?: number;
  suggestionReason?: string;
  priorityMode?: 'manual' | 'auto' | 'hybrid';
  ventas_qty_historico?: number;
  ventas_valor_historico?: number;
}

export interface MatchingRule {
  id: string;
  tipo: 'HARD_REF' | 'EXACT_SUM' | 'TOLERANCE' | 'CASH_FILL' | 'PRICE_FLEX' | 'WILDCARDS' | 'GOAL_WITH_TOLERANCE' | 'STOCK_LIMIT';
  tolerancia_cents?: number;   // en pesos, aplicable a TOLERANCE
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
  precio_unitario_cents: number; // En Pesos
  importe_linea_cents: number;  // En Pesos
  cuadre_cents: number;         // En Pesos
  clasificacion: 'Transferencia' | 'Efectivo' | 'QR';
  origen_dato: 'AUTO_MATCH' | 'MANUAL_USER' | 'CASH_FILLER';
  reconciliation_hash: string; // hash(transaction_ref + detalle) -> idempotencia
  created_at: string;
}

export interface DailyIPVReport {
  id: string;
  fecha_reporte: string;
  total_ventas_cents: number;         // En Pesos
  resumen_efectivo_cents: number;      // En Pesos
  resumen_transferencia_cents: number; // En Pesos
  filas: {
    cod: string;
    descripcion: string;
    um: string;
    saldo_inicial_qty: number;
    entrada_qty: number;
    salida_qty: number;
    entrada_salida_qty: number;
    total_disponible_qty: number;
    venta_cantidad_qty: number;
    precio_unitario_cents: number;    // En Pesos
    importe_cents: number;            // En Pesos
    existencia_final_qty: number;
  }[];
  firmas: {
    realizado_por: string;
    fecha_generacion: string;
  };
  estado: 'BORRADOR' | 'CERRADO' | 'ANULADO';
  created_at: string;
  updated_at?: string;
}

export interface CashAdjustment {
  id: string;
  fecha: string;
  monto_cents: number; // En Pesos
  motivo: string;
  aprobado_por: string;
  created_at: string;
}

export interface IngestionError {
  id: string;
  fecha: string;
  referencia_corta: string;
  referencia_origen: string;
  observaciones: string;
  importe_cents: number; // En Pesos
  tipo: 'Cr' | 'Db';
  error_note: string;
  raw_data: any;
  created_at: string;
}

export interface DailyAggregate {
  fecha: string;
  total_cents: number; // En Pesos
  by_product: {
    cod: string;
    descripcion: string;
    cantidad: number;
    importe_cents: number; // En Pesos
  }[];
}

export interface MatchingCache {
  importe_cents: number; // En Pesos
  catalog_hash: string;
  results: {
    product_cod: string;
    cantidad: number;
  }[];
  updated_at: string;
}

export interface IPVSettings {
  id: string; // "current"
  entidad_nombre: string;
  entidad_codigo: string;
  persona_entrega: string;
  consecutivo_inicio: number;
  agrupacion_modo: 'GLOBAL' | 'DETALLADO';
  desglose_modo: 'DIA' | 'TRANSACCION';
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
  ingestion_errors!: Table<IngestionError>;
  ipv_settings!: Table<IPVSettings>;

  constructor() {
    super('IPVDB');
    this.version(9).stores({
      bank_statements: '&referencia_origen, fecha, importe_cents, ingestion_hash',
      products: '&cod, descripcion, precio_cents, prioridad_algoritmo, activo, stock_inicial_manual, isWildcardCandidate',
      matching_rules: '&id, tipo, prioridad',
      reconciliation_lines: '&id, transaction_ref, reconciliation_hash, fecha_operacion, clasificacion, origen_dato',
      ipv_reports: '&id, fecha_reporte, estado',
      cash_adjustments: '&id, fecha',
      daily_aggregates: '&fecha',
      matching_cache: '&importe_cents',
      ingestion_errors: 'id, fecha, referencia_origen',
      ipv_settings: 'id'
    });
  }
}

export const db = new IPVDatabase();
