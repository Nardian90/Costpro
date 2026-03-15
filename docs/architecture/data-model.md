# Documentación del Modelo de Datos

## 1. Persistencia Local (IndexedDB via Dexie.js)
El sistema utiliza Dexie.js para la gestión de datos locales, permitiendo capacidades offline y alto rendimiento en el cliente.

### Tabla: `bank_statements`
**Índices:** `&referencia_origen, fecha, importe_cents, ingestion_hash`

```typescript
// Interface: BankTransaction
interface BankTransaction {
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
  fail_reason?: string;
  ipv_id?: string;             // FK ipv_reports.id
  excluido?: boolean;          // Excluir del matching
  created_at: string;
  updated_at?: string;
  ingestion_hash: string;      // HASH para idempotencia
  // Persistence for Transfer Report
  carnet?: string;
  nombre_cliente?: string;
  telefono_cliente?: string;
  // Matching Engine traceability
  matching_trace?: MatchingTrace[];
  applied_rules?: string[];
  matching_confidence?: number;
}
```

### Tabla: `products`
**Índices:** `&cod, descripcion, precio_cents, prioridad_algoritmo, activo, stock_inicial_manual, isWildcardCandidate, id_grupo, cod_hijo`

```typescript
// Interface: Product
interface Product {
  cod: string;
  descripcion: string;
  um: string;
  es_paquete: boolean;
  contenido_paquete: number;
  precio_cents: number;        // En Pesos (decimal) - PRECIO ACTUAL/AJUSTADO
  precio_base_cents?: number;  // Precio original de catálogo
  variacion_permisible_percent?: number; // ±% permitido para ajuste automático
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
  id_grupo?: string;           // Agrupador de variantes (ej: "BIG_BON")
  cod_hijo?: string;           // Código del producto inferior en la jerarquía
}
```

### Tabla: `matching_rules`
**Índices:** `&id, tipo, prioridad`

```typescript
// Interface: MatchingRule
interface MatchingRule {
  id: string;
  tipo: 'HARD_REF' | 'EXACT_SUM' | 'TOLERANCE' | 'CASH_FILL' | 'PRICE_FLEX' | 'WILDCARDS' | 'GOAL_WITH_TOLERANCE' | 'STOCK_LIMIT';
  tolerancia_cents?: number;   // en pesos, aplicable a TOLERANCE
  prioridad: number;
  activo: boolean;
  meta?: Record<string, any>;
  descripcion?: string;
}
```

### Tabla: `reconciliation_lines`
**Índices:** `&id, transaction_ref, reconciliation_hash, fecha_operacion, clasificacion, origen_dato`

```typescript
// Interface: ReconciliationLine
interface ReconciliationLine {
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
```

### Tabla: `product_movements`
**Índices:** `&id, fecha, producto_origen_cod, producto_destino_cod, tipo, referencia_transaccion`

```typescript
// Interface: ProductMovement
interface ProductMovement {
  id: string;
  fecha: string;               // ISO Date
  producto_origen_cod: string;
  producto_destino_cod: string;
  cantidad_origen: number;
  cantidad_destino: number;
  tipo: 'DECOMPOSITION' | 'MANUAL' | 'IMPORT' | 'PRICE_ADJUSTMENT';
  referencia_transaccion?: string; // Si viene de un matching automático
  valor_anterior?: string;
  valor_nuevo?: string;
  motivo?: string;
  usuario?: string;
  created_at: string;
}
```

### Tabla: `ipv_reports`
**Índices:** `&id, fecha_reporte, estado`

```typescript
// Interface: DailyIPVReport
interface DailyIPVReport {
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
```

### Tabla: `cash_adjustments`
**Índices:** `&id, fecha`

```typescript
// Interface: CashAdjustment
interface CashAdjustment {
  id: string;
  fecha: string;
  monto_cents: number; // En Pesos
  motivo: string;
  aprobado_por: string;
  created_at: string;
}
```

### Tabla: `daily_aggregates`
**Índices:** `&fecha`

```typescript
// Interface: DailyAggregate
interface DailyAggregate {
  fecha: string;
  total_cents: number; // En Pesos
  by_product: {
    cod: string;
    descripcion: string;
    cantidad: number;
    importe_cents: number; // En Pesos
  }[];
}
```

### Tabla: `matching_cache`
**Índices:** `&importe_cents`

```typescript
// Interface: MatchingCache
interface MatchingCache {
  importe_cents: number; // En Pesos
  catalog_hash: string;
  results: {
    product_cod: string;
    cantidad: number;
  }[];
  updated_at: string;
}
```

### Tabla: `ingestion_errors`
**Índices:** `id, fecha, referencia_origen`

```typescript
// Interface: IngestionError
interface IngestionError {
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
```

### Tabla: `ipv_settings`
**Índices:** `id`

```typescript
// Interface: IPVSettings
interface IPVSettings {
  id: string; // "current"
  entidad_nombre: string;
  entidad_codigo: string;
  persona_entrega: string;
  consecutivo_inicio: number;
  agrupacion_modo: 'GLOBAL' | 'DETALLADO';
  desglose_modo: 'DIA' | 'TRANSACCION';
  logo_url?: string;
  paper_size?: 'LETTER' | 'A4';
  updated_at: string;
}
```

### Tabla: `matching_logs`
**Índices:** `&id, transaction_ref, fecha_ejecucion, resultado_estado`

```typescript
// Interface: MatchingLog
interface MatchingLog {
  id: string; // UUID
  transaction_ref: string; // FK -> BankTransaction.referencia_origen
  fecha_ejecucion: string; // ISO date
  resultado_estado: "COMPLETO" | "PARCIAL" | "PENDIENTE";

  // Traceabilidad
  trace: MatchingTrace[];
  applied_rules: string[];
  matching_confidence: number;

  // Detalles del fallo (si aplica)
  fail_reason?: string;

  // Líneas generadas
  reconciliation_lines_count: number;

  // Metadatos
  duration_ms: number;
  engine_version: string;
  reglas_activas: string[];

  created_at: string;
}
```

## 2. Persistencia Remota (PostgreSQL via Prisma/Supabase)
La persistencia global y sincronizada se maneja a través de Supabase con Prisma ORM.

### Modelo: `User`

```prisma
model User {
  id    String @id @default(cuid())
  email String @unique
  name  String?
}
```
