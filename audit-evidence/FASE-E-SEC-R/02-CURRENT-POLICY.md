# FASE E-SEC-R — 02 CURRENT POLICY (FASE 1 — reconstrucción documental)

## Fecha / HEAD
2026-09-26 · dd1e6fb9. Método: lectura de código (archivo:línea) + evidencia E-SEC.
Ningún archivo modificado en esta etapa.

## Tabla de política actual

| Regla | Implementación actual | Fuente de verdad | Evidencia |
|---|---|---|---|
| **Precio canónico** | `products.price` (fila scoped por `store_id`, leída bajo `FOR UPDATE` en la TX) o `product_variants.price` si el ítem es variante (modalidad). Fallback legacy: producto sin tienda. Sin price en payload → catálogo. | DB en el instante de la venta (servidor) | `supabase/migrations/20260926000001_esec_price_integrity.sql:122-131,152-159,175-185` |
| **Descuento** | 2 canales que confluyen: (a) **por ítem**: UI negocia vía descuento por línea (`updateItemDiscount`, cart.ts:834) → payload envía `effectiveUnitPrice()` como `price_at_sale` (usePOSCheckout.ts:199, useSalesCatalog.ts:415,472) → server lo compara contra el canónico; (b) **global**: `p_discount_type/value` recalculado server-side. | Servidor (recalcula y valida todo; el cliente solo propone) | RPC `20260926000001:188-194,197-202`; `src/store/cart.ts:228-242` |
| **Umbral** | **15%**. Server: **AGREGADO** — `item_discount_pct = Σ max(0, ref−price)×qty / Σ ref×qty × 100` (todas las líneas juntas) OR `effective_discount_pct` (descuento global) `>= 15` → exige supervisor. Cliente (advisory): **POR LÍNEA** en SalesCatalogCard/Table (`referenceTotal` = subtotal del ítem) y sobre total del carrito en POSCartDiscountModal (`referenceTotal = getTotal()`). `DISCOUNT_SUPERVISOR_THRESHOLD = 15`. | Código (origen: commit bd5fdc72 V2.12.30, fix de seguridad — no documento comercial) | RPC `:228-241`; `useDiscountAuthorization.ts:23,60-67,76-89`; `SalesCatalogCard.tsx:93-112`; `POSCartDiscountModal.tsx:39-57` |
| **Supervisor** | `has_store_role_as(uid, store, ['admin','manager'])` en el RPC. Bajo `service_role` (route) además exige `supervisor_token` firmado verificado en el route; bajo `authenticated` directo solo se acepta `p_supervisor_user_id == auth.uid()` (RC-1). Global admin (profile.role admin/superadmin) pasa el check del route sin membership. | DB (membership) + JWT + token HMAC | RPC `:241-258`; route `src/app/api/pos/checkout/route.ts:116-135`; `supervisor-check/route.ts:73-103` |
| **Token** | HMAC-SHA256 (`NEXTAUTH_SECRET`), stateless, versionado v1, **TTL 300 s**, bound a (supervisor, operador, tienda). Sin registro de uso (jti generado pero jamás almacenado ni verificado contra historial) → **reutilizable dentro del TTL para el mismo binding** (diseño RC-1, residual P3 documentado en REM-INV-4A-R 03-rc1-design.md:119). UI lo consume tras 1 venta (`clearSupervisorAuth`). Emisión: `supervisor-check` valida credenciales server-side (rate 5/min). | Servidor (emisión y verificación) | `src/lib/supervisor-token.ts:36-48,98-130`; `supervisor-check/route.ts:110-125`; `usePOSCheckout.ts:228-229`; `supervisor-auth-store.ts:16-28` |
| **Snapshot** | Por línea: `price_at_sale`, `price_at_sale_cup`, `cost_at_sale`, `variant_id` + descuentos por método. Venta: `subtotal`, `discount_amount`, `tax_amount`, `total_amount`, moneda/tasa. Desvío vs catálogo: SOLO a nivel **agregado de la venta** en `audit_logs.metadata` (`catalog_subtotal`, `item_discount_total`, `item_discount_pct`) + `supervisor_id`. **NO existe** `catalog_price_at_sale` por línea ni auditoría de cambios de precio de producto (sin trigger). | DB (transactions / transaction_items / audit_logs append-only) | RPC `:336-367,425-445`; migraciones: `20260702000003:28-29` (price_at_sale_cup), `20260616000002_audit_logs_rls.sql` (RLS, sin UPDATE/DELETE) |
| **Redondeo** | **De facto, sin política explícita**: servidor opera numeric exacto (SIN redondeo; aceptó 490.999999 — A16); cliente redondea UNA vez a 2 decimales los agregados CUP (`toFixed(2)`); únicas tolerancias: 0.01 en `ERR_TOTAL_MISMATCH` y en invariante de pagos. | Servidor (tolerancia); cliente (presentación/payload) | RPC `:222-225,420-423`; `cart.ts:456,468,1156,1165,1176,1203,1211` |

## Flujo (resumen del circuito completo)
```text
UI (descuento por línea o global, gate advisory 15% por línea/total)
  → effectiveUnitPrice() pliega el descuento de línea en el precio
  → POST /api/pos/checkout (Zod: price ≥ 0 finito; RC-1: token requerido si hay supervisor)
  → verifySupervisorToken (sup+opr+st+exp+firma)
  → create_sale_v2 (service_role, p_user_id = sesión):
       lock por store → idempotencia → auth → precio canónico bajo FOR UPDATE
       → ERR_INVALID_PRICE (NaN/±Inf/negativo) → desvío agregado vs catálogo
       → recálculo subtotal/descuento/impuesto/total → ERR_TOTAL_MISMATCH (±0.01)
       → gate ≥15% (global_pct OR item_pct) → RC-1 + has_store_role_as
       → INSERT transactions/transaction_items/payment_transactions
       → audit_logs.metadata (agregado + supervisor_id) → UI: clearSupervisorAuth()
```

## Interpretación
La implementación E-SEC existente es coherente internamente y estable. Las 5
decisiones pendientes no son defectos de implementación sino espacios de POLÍTICA
comercial que nadie ha decidido. Cada una se analiza en 03–07 y se clasifica en 08.
