# FASE E-SEC-R — 05 SNAPSHOT ANALYSIS (FASE 4 — snapshot del precio)

## Fecha / HEAD
2026-09-26 · dd1e6fb9 · READ-ONLY.

## ¿Qué conserva hoy una venta?

**Por línea (transaction_items — persistido en el momento de la venta):**
- `price_at_sale` (precio unitario realmente cobrado, tras el descuento de línea)
- `price_at_sale_cup` (× tasa de la venta), `price_currency`
- `cost_at_sale` (WAC server-side bajo lock), `variant_id`, `quantity`
- descuentos por método de pago (cash/transfer/zelle type/value/currency)
→ `20260926000001:336-367`; columnas de moneda: `20260702000003:28-29`

**Por venta (transactions):** `subtotal`, `discount_type/value (monto)`,
`tax_amount`, `applied_taxes`, `total_amount`, moneda y tasa, pagos.
→ `20260926000001:275-289`

**Desvío vs catálogo (audit_logs.metadata — agregado de la venta, append-only):**
`catalog_subtotal`, `item_discount_total`, `item_discount_pct`, `discount_pct`,
`supervisor_id`. → `20260926000001:425-445`; RLS sin UPDATE/DELETE
(`20260616000002_audit_logs_rls.sql`) → inmutable en la práctica.

**NO existe:** columna `catalog_price_at_sale` (0 hits en src/ y supabase/) ni
auditoría de cambios de `products.price` (ningún trigger de audit sobre products;
verificados `20260320_fix_audit_v2_hallazgos.sql`, triggers vigentes solo para
cash_closures / fiscal_closing / etc.).

## Regla fundamental — ¿la venta histórica depende del precio actual del catálogo?

| Capacidad | ¿Garantizada? | Base |
|---|---|---|
| Total/subtotal/impuesto de la venta histórica | **SÍ** | todo se calcula y persiste en la TX (`v_calculated_*`), nunca se relee del catálogo |
| Precio cobrado por línea | **SÍ** | `price_at_sale` persistido; devoluciones/reportes lo leen, no recalculan |
| Costo histórico (margen) | **SÍ** | `cost_at_sale` server-side (DF-02) |
| Desvío comercial AGREGADO de la venta | **SÍ** | snapshot en `audit_logs.metadata` escrito al momento de la venta |
| Desvío vs catálogo POR LÍNEA (reconstrucción posterior) | **NO** | sin columna y sin historial de precios de producto: si `products.price` cambia, el `ref` original de esa línea se pierde |
| Identidad del autorizador | **SÍ** | `supervisor_id` por venta (agregado) |

## Impacto por caso de uso
- **Auditoría**: el desvío de la venta es auditable HOY (agregado); el desvío de UNA
  línea concreta solo es reconstruible si el precio del producto no cambió desde then.
- **Reportes/finanzas**: usan montos persistidos → inmunes a cambios de catálogo.
- **Devoluciones**: operan sobre `price_at_sale` → correctas aunque el catálogo cambie.
- **Reconstrucción histórica de la negociación por línea**: NO garantizada (gap).
- **Variantes / precios por tienda / promociones**: las variantes persisten vía
  `variant_id`; el precio por tienda es la propia fila `products` scoped; no hay
  promociones en checkout (verificado) → sin superficie adicional.

## Conclusión
La implementación actual **GARANTIZA** que la venta histórica no depende del precio
actual del catálogo en TODO lo monetario. El único gap es la reconstrucción del
precio de catálogo por línea a posteriori — exactamente la decisión pendiente #4 de
E-SEC (13-final-verdict) y E-SEC 07-E3.

## Cambio mínimo propuesto (NO implementado — requiere decisión)
Si el propietario decide conservar la referencia por línea:
```sql
ALTER TABLE public.transaction_items
  ADD COLUMN catalog_price_at_sale numeric;           -- referencia leída bajo lock
-- en create_sale_v2, 1ª pasada: reutilizar v_reference_price ya calculado
-- (20260926000001:179-185) y añadir la columna al INSERT (:336-367)
```
~2 anclas + 1 columna, sin sistema paralelo. **Detenido aquí por la regla de la
fase (FASE 8): sin decisión explícita no se implementa.**
