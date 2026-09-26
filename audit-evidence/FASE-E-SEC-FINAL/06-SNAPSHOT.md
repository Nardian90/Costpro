# FASE E-SEC-FINAL — 06 SNAPSHOT (D4)

## Esquema (cambio mínimo)

```sql
ALTER TABLE public.transaction_items
  ADD COLUMN IF NOT EXISTS catalog_price_at_sale NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS item_discount_value   NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_discount_pct     NUMERIC(9,2)  NOT NULL DEFAULT 0;
```

- `catalog_price_at_sale` = `ROUND(v_reference_price, 2)` — el MISMO precio de referencia server-side contra el que se evalúa el desvío (única fuente; variante si hay, si no base).
- `item_discount_value` = `ROUND(GREATEST(0, ref − price) × qty, 2)`.
- `item_discount_pct` = desvío % de la línea.
- `price_at_sale` ya existía (ahora siempre 2dp por D5).
- `authorized_by`/`discount_reason`: según el modelo de auditoría EXISTENTE (`audit_logs.metadata` + `metadata.lines[]` por línea) — el mandato D4 los asigna "según el modelo de auditoría existente"; no se crean columnas extra (cambio mínimo).
- NO se construye historial de precios completo.

## Prueba del mandato (matriz SN1/SN2, LIVE)

```text
1. Venta: catálogo 500 → venta 450 (10%, sin supervisor)      → 200 (tx sn1)
2. UPDATE products SET price = 600 WHERE id = PA              (catálogo modificado)
3. Consulta de la línea histórica:
   {"catalog_price_at_sale": 500.0, "price_at_sale": 450.0,
    "item_discount_value": 50.0,  "item_discount_pct": 10.0}
```

**Resultado**: la venta histórica conserva `catalog_price_at_sale=500` y `price_at_sale=450` tras modificar el catálogo a 600. `venta histórica ≠ precio actual del producto` — reconstruible por SQL directo sobre la fila, sin depender del catálogo vigente ni de sistemas paralelos.

## Prueba browser (B3, 09)

Venta autorizada 500→425: línea persistida `{catalog_price_at_sale: 500.0, price_at_sale: 425.0, item_discount_value: 75.0, item_discount_pct: 15.0}` — la reconstrucción comercial completa (catálogo, vendido, descuento, %) vive en la fila.

## Compatibilidad

Columnas nullable/default: las filas históricas (previas a la migración) quedan con NULL/0 — ninguna venta antigua se altera (verificado: counts de `transaction_items` sin cambios; migración solo ADD COLUMN).
