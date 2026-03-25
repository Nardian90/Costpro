import Dexie, { type Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';

export interface BankTransaction {
  id: string;
  fecha: string;               // ISO Date
  referencia_corta: string;    // De la observación (ej: VB1234)
  referencia_origen: string;   // Unique ID from bank (e.g. "202301010001")
  observaciones: string;
  importe_cents: number;       // En Pesos * 100
  comision_cents?: number;
  importe_venta_cents?: number;
  tipo: 'Cr' | 'Db';
  estado_conciliacion: 'PENDIENTE' | 'PARCIAL' | 'COMPLETO';
  excluido?: boolean;
  motivo_exclusion?: string;
  nombre_cliente?: string;     // Meta-data persistida tras el parseo
  telefono_cliente?: string;
  tarjeta_cliente?: string;
  carnet?: string;             // Documento identidad extraido
  ingestion_hash: string;      // hash(ref + fecha + monto) para evitar duplicados
  created_at: string;
  updated_at: string;
}

export interface Product {
  cod: string;                 // PK
  descripcion: string;
  um: string;
  precio_cents: number;        // En Pesos * 100
  prioridad_algoritmo: number;
  activo: boolean;
  es_paquete: boolean;
  contenido_paquete: number;   // Cuántas unidades trae el paquete
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
  id_grupo?: string;           // Agrupador de variantes (ej: "BIG_BON")
  cod_hijo?: string;           // Código del producto inferior en la jerarquía
  unit_factor?: number;        // Factor de conversión (ej: 1000 para caja de 1000)
  unit_level?: 'BOX' | 'PACK' | 'UNIT'; // Nivel de empaque
  cuenta_contable?: string;
  costo_unitario_cents?: number;
}

export interface CostTrace {
  metodo: "PERCENTAGE" | "TARGET_PROFIT";
  parametro: number;
  timestamp: number;
  usuario_id: string;
}

export interface IntelligentReceipt {
  id: string;
  date: string;                // ISO Date
  product_id: string;          // FK -> Product.cod
  type: 'INTELLIGENT' | 'CORRECTIVE';
  level: 'BOX' | 'PACK' | 'UNIT';
  quantity: number;
  total_units: number;
  source: 'SALES' | 'ADJUSTMENT';
  mode: 'A' | 'B' | 'C';
  simulation_id?: string;
  applied: boolean | number;
  costo_unitario_cents?: number;
  costo_total_cents?: number;
  cost_trace?: CostTrace;
  created_at: string;
}

export interface ProductMovement {
  id: string;
  fecha: string;               // ISO Date
  producto_origen_cod: string;
  producto_destino_cod: string;
  cantidad_origen: number;
  cantidad_destino: number;
  tipo: 'DECOMPOSITION' | 'MANUAL' | 'IMPORT' | 'PRICE_ADJUSTMENT' | 'INTELLIGENT_RECEIPT';
  referencia_transaccion?: string; // Si viene de un matching automático
  valor_anterior?: string;
  valor_nuevo?: string;
  motivo?: string;
  costo_unitario_cents?: number;
  costo_total_cents?: number;
  usuario?: string;
  created_at: string;
}

export interface MatchingRule {
  id: string;
  tipo: 'HARD_REF' | 'EXACT_SUM' | 'TOLERANCE' | 'CASH_FILL' | 'PRICE_FLEX' | 'WILDCARDS' | 'GOAL_WITH_TOLERANCE' | 'STOCK_LIMIT';
  tolerancia_cents?: number;   // en pesos, aplicable a TOLERANCE
  prioridad: number;
  activo: boolean;
  meta?: Record<string, any>;
  descripcion?: string;
}

export interface MatchingLog {
  id: string; // UUID
  type?: "MATCHING" | "AUDIT";
  event_type?: string; // e.g. "OPENING_BALANCE_UPDATED"
  payload?: any;
  transaction_ref?: string; // Optional for non-matching events
  fecha_ejecucion?: string; // Optional for non-matching events
  resultado_estado?: "COMPLETO" | "PARCIAL" | "PENDIENTE";

  // Traceabilidad
  trace?: MatchingTrace[];
  applied_rules?: string[];
  matching_confidence?: number;

  // Detalles del fallo (si aplica)
  fail_reason?: string;

  // Líneas generadas
  reconciliation_lines_count?: number;

  // Metadatos
  duration_ms?: number;
  engine_version?: string;
  reglas_activas?: string[];

  created_at: string;
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
  observaciones?: string;      // Notas de trazabilidad (ej: Pago Mixto)
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
  id: string; // cache_key
  importe_cents: number; // En Pesos
  catalog_hash: string;
  rules_hash: string;
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
  almacen_nombre?: string;
  almacen_codigo?: string;
  persona_entrega: string;
  consecutivo_inicio: number;
  agrupacion_modo: 'GLOBAL' | 'DETALLADO';
  desglose_modo: 'DIA' | 'TRANSACCION';
  logo_url?: string;
  paper_size?: 'LETTER' | 'A4';
  copiloto_activo: boolean;
  updated_at: string;
}

export interface SC204Metadata {
  proveedor_nombre: string;
  proveedor_codigo: string;
  documento_tipo: string;
  documento_numero: string;
  transportador_nombre: string;
  transportador_ci: string;
  chapa: string;
  casilla?: string;
  guia_aerea?: string;
}

// --- Dexie Database ---


export interface ConsolidatedAccount {
  id?: number;
  accountId: string;
  period: string; // YYYY-MM
  openingBalance: number;
  bankStatementBalance?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PeriodClosure {
  id?: number;
  period: string; // YYYY-MM
  status: "OPEN" | "CLOSED";
  closedAt?: string;
}

export interface MonthlyGoal {
  month: string; // YYYY-MM
  goalAmount: number;
  strategy?: "MIN_STOCK" | "MAX_VALUE";
}

export interface YearlyGoals {
  year: number;
  months: MonthlyGoal[];
}

export interface Customer {
  ci: string; // Clave única
  nombre: string; // Nombre Normalizado
  normalized_name: string; // Para matching
  raw_names: string[]; // Alias detectados
  phone?: string;
  card_number?: string;
  status: "COMPLETO" | "PARCIAL" | "PENDIENTE";
  source: "MANUAL" | "AUTOMATICO";
  created_at: string;
  updated_at: string;
}

export interface IdentityAudit {
  id: string;
  transaction_ref: string;
  tipo: "CONFLICT" | "AUTO_CORRECTION" | "NEW_RECORD";
  detalle: string;
  timestamp: string;
}

export interface MappingRuleType {
    id: string;
    reportType: string;
    provider: string;
    sourceColumn: string;
    targetField: string;
    active: boolean;
    priority: number;
}

export interface MappingExecution {
    id: string;
    reportType: string;
    timestamp: string;
    successRate: number;
}

export interface MatchingTrace {
    step: string;
    timestamp: number;
    description: string;
}

export interface MVTTemplate {
    id: string;
    name: string;
}

export interface MVTSettings {
    id: string;
}

export interface MVTExportLog {
    id: string;
    exportNumber: number;
    templateId: string;
    timestamp: string;
}

export class IPVDatabase extends Dexie {
  customers!: Table<Customer>;
  identity_audit!: Table<IdentityAudit>;
  mapping_rules!: Table<MappingRuleType>;
  mapping_executions!: Table<MappingExecution>;

  bank_statements!: Table<BankTransaction>;
  products!: Table<Product>;
  matching_rules!: Table<MatchingRule>;
  reconciliation_lines!: Table<ReconciliationLine>;
  product_movements!: Table<ProductMovement>;
  ipv_reports!: Table<DailyIPVReport>;
  cash_adjustments!: Table<CashAdjustment>;
  daily_aggregates!: Table<DailyAggregate>;
  matching_cache!: Table<MatchingCache>;
  ingestion_errors!: Table<IngestionError>;
  ipv_settings!: Table<IPVSettings>;
    matching_logs!: Table<MatchingLog>;
  intelligent_receipts!: Table<IntelligentReceipt>;
  consolidated_accounts!: Table<ConsolidatedAccount>;
  period_closures!: Table<PeriodClosure>;
  yearly_goals!: Table<YearlyGoals>;
  mvt_templates!: Table<MVTTemplate>;
  mvt_settings!: Table<MVTSettings>;
  mvt_exports_log!: Table<MVTExportLog>;

  constructor() {
    super('IPVDB');
    this.version(22).stores({
      customers: "&ci, nombre, normalized_name, status",
      identity_audit: "&id, transaction_ref, tipo",
      bank_statements: '&referencia_origen, fecha, importe_cents, ingestion_hash',
      products: '&cod, descripcion, precio_cents, prioridad_algoritmo, activo, stock_inicial_manual, isWildcardCandidate, id_grupo, cod_hijo',
      matching_rules: '&id, tipo, prioridad, activo',
      reconciliation_lines: '&id, transaction_ref, reconciliation_hash, fecha_operacion, product_cod, clasificacion, origen_dato',
      product_movements: '&id, fecha, producto_origen_cod, producto_destino_cod, tipo, referencia_transaccion',
      ipv_reports: '&id, fecha_reporte, estado',
      cash_adjustments: '&id, fecha',
      daily_aggregates: '&fecha',
      matching_cache: '&id',
      ingestion_errors: 'id, fecha, referencia_origen',
      ipv_settings: 'id',
      matching_logs: '&id, transaction_ref, fecha_ejecucion, resultado_estado, type, event_type',
      intelligent_receipts: '&id, date, product_id, type, simulation_id, applied',
      consolidated_accounts: '++id, accountId, period',
      period_closures: '++id, period, status',
      yearly_goals: '&year',
      mapping_rules: "id, reportType, provider, sourceColumn, targetField, active, priority",
      mapping_executions: "id, reportType, timestamp, successRate"
    });

    this.version(23).stores({
      products: "&cod, descripcion, precio_cents, prioridad_algoritmo, activo, stock_inicial_manual, isWildcardCandidate, id_grupo, cod_hijo, cuenta_contable",
      mvt_templates: "&id, name",
      mvt_settings: "id",
      mvt_exports_log: "&id, exportNumber, templateId, timestamp"
    });

    this.version(24).stores({
      matching_cache: '&id',
      bank_statements: '&referencia_origen, fecha, importe_cents, ingestion_hash, carnet, nombre_cliente'
    });
  }
}

export const db = new IPVDatabase();
