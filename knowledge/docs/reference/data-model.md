# IPV Data Model (v32)

### Tabla: `bank_statements`
**Índices:** `&referencia_origen, fecha, importe_cents, ingestion_hash`

### Tabla: `products`
**Índices:** `&cod, descripcion, precio_cents, activo`

### Tabla: `matching_rules`
**Índices:** `&id, tipo, prioridad`

```typescript
interface MatchingRule {
  id: string;
  tipo: 'STOCK_LIMIT' | 'HARD_REF' | 'EXACT_SUM' | 'CASH_FILL' | 'TOLERANCE' | 'PRICE_FLEX';
  prioridad: number;
  activo: boolean;
  meta?: any;
  descripcion?: string;
}
```

### Tabla: `reconciliation_lines`
**Índices:** `&id, transaction_ref, reconciliation_hash, fecha_operacion, product_cod, parent_transaction_id, status, payment_status`

```typescript
interface ReconciliationLine {
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
  purchase_order_id?: number;
  adjustment_type?: "REBAJA" | "PROPINA";
  is_price_change?: boolean;
  reconciliation_hash: string;
  created_at: string;
}
```

### Tabla: `product_price_changes` (New v32)
**Índices:** `&id, product_cod, fecha`

```typescript
interface ProductPriceChange {
  id: string;
  product_cod: string;
  old_price_cents: number;
  new_price_cents: number;
  fecha: string;
  transaction_ref?: string;
  created_at: string;
}
```
