# FASE E-SEC — 02 PRICE FLOW (GATE E0/E4 — mapa con archivo·línea)

## Fecha / HEAD
2026-09-26 · 6ac52feb (pre-fix). Flujo completo del precio, sin supuestos.

## Flujo mapeado

```text
products.price / product_variants.price          (catálogo — fuente de verdad)
   ↓  addItem (cart.ts:676-697: price = product.price / variant.price)
Carrito useCartStore (src/store/cart.ts)
   item.price (crudo) + item.discount_type/value (descuento por ítem, campo SEPARADO)
   getExpectedTotalCup() = Σ getItemSubtotalCup(item)   ← incluye descuento por ítem
   ↓  usePOSCheckout.ts (POSView) / useSalesCatalog.ts (Tabla de Venta)
Payload V2 → POST /api/pos/checkout
   items[].price  (price_at_sale)  ← controlado por el cliente
   total_amount / discount_value (global) / supervisor_user_id + supervisor_token
   ↓  Zod checkoutSchema (route.ts:31-81): price: min(0)  [pre-fix; sin finite()]
   ↓  RC-1: verifySupervisorToken (route.ts:109-132) si supervisor_user_id
RPC create_sale_v2 (SECURITY DEFINER, EXECUTE PUBLIC)
   price_at_sale del JSONB → v_price (1ª pasada, líneas 145-152 de la migración RC-1)
   v_calculated_subtotal = Σ v_price × v_qty
   v_discount_amount    = LEAST(p_discount_value, subtotal)      ← SOLO global
   v_calculated_total   = subtotal − descuento + tax
   ERR_TOTAL_MISMATCH: |calculado − cliente| > 0.01               ← auto-referencial
   Gate supervisor: v_effective_discount_pct >= 15                 ← SOLO global
   INSERT transactions / transaction_items (price_at_sale) / register_stock_movement
   INSERT audit_logs (metadata: totales, discount_pct, supervisor_id, item_count)
   ↓
sale_items (transaction_items) → movimientos → totales → ticket/reportes
```

## Actores y confianza
| Campo | Origen | ¿Confiable? |
|---|---|---|
| `store_id` | payload | validado server-side (`has_store_access_as(v_uid, store)`) |
| usuario operador | JWT de sesión (`auth.uid()`) | SÍ — derivado del token firmado |
| rol supervisor | `/api/auth/supervisor-check` → token firmado bound (RC-1) | SÍ |
| **`price_at_sale`** | **payload del navegador** | **NO — sin validación de referencia** |
| `cost_at_sale` | server (WAC bajo lock, DF-02) | SÍ (claves del cliente IGNORADAS) |
| `p_total_amount` | payload | comparado contra el cálculo que USA el precio del cliente |

## Interpretación
E4 (principio server-side) se cumple en identidad/rol/tienda/costo y NO en el precio:
el único dato económico que define la venta (`price_at_sale`) entra del navegador y el
servidor solo verifica aritmética interna auto-referencial. El gate ≥15% (política
existente) queda acotado al descuento global, de modo que expresar la misma diferencia
comercial como precio por ítem la hace invisible para el servidor.
