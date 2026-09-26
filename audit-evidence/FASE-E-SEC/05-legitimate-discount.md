# FASE E-SEC — 05 LEGITIMATE DISCOUNT (objetivo real de la fase)

## Fecha
2026-09-26 · pre-fix 6ac52feb / post-fix (ver 13-final-verdict).

## Hallazgo adicional PRE-fix (RC-ESEC-2): el flujo legítimo estaba ROTO
El mandato exige que 500→490 siga siendo posible. Evidencia PRE-fix (matriz A4,
payload EXACTO que la UI construía con un descuento por ítem):

```text
A4: price=500 (catálogo crudo) + total_amount=490 (total UI con descuento por ítem)
    → HTTP 422 "Descuadre detectado. Recarga la página e intenta de nuevo."
    (ERR_TOTAL_MISMATCH: server recalcula Σ price×qty = 500 ≠ 490)
```

Causa: la UI descuenta por LÍNEA en el total (`getItemSubtotalCup`, `calcSubtotal`)
pero enviaba el `price` CRUDO y el descuento por ítem NO viajaba al RPC ⇒
**toda venta online con descuento por ítem (Tabla de Venta) fallaba 422**.
(Adicionalmente RC-ES2: el fetch del catálogo no enviaba `Authorization` → toda venta
online del catálogo fallaba 401 ANTES aún — misma clase que RC4 de FASE D, corregida
solo en usePOSCheckout. Demostrado en red real del navegador, doc 10.)

## Corrección del flujo legítimo (quirúrgica)
| Archivo | Cambio |
|---|---|
| `src/store/cart.ts` | nuevo helper exportado `effectiveUnitPrice(price, qty, type, value)` — precio unitario realmente cobrado, semántica por línea (alineada con `getItemSubtotalCup`) |
| `src/components/views/terminal/views/pos/usePOSCheckout.ts` | payload V2: `price: effectiveUnitPrice(...)` en lugar del precio crudo |
| `src/components/views/terminal/views/pos/useSalesCatalog.ts` | ídem (paths online V2 y offline queue) + forward de `supervisor_user_id`/`supervisor_token` (capturados por SupervisorAuthModal) + `clearSupervisorAuth()` tras la venta (1 autorización = 1 venta, igual que POS) |
| `src/components/views/terminal/views/pos/useSalesCatalog.ts` | **RC-ES2**: header `Authorization: Bearer <token>` en el fetch del checkout (patrón FIX-FASE-D de usePOSCheckout) |

## Resultado POST-fix (misma operación legítima)
```text
UI real (navegador): Producto A $500 → descuento fijo 10 → VALOR VENTA $490.00
  → Confirmar → "Venta completada — 1f849f7d…" (HTTP 200)
DB: transactions (subtotal 490, total 490, completed)
    transaction_items (price_at_sale 490)
    audit_logs.metadata: catalog_subtotal=500, item_discount_total=10,
                         item_discount_pct=2.0   ← desvío AUDITABLE
Matriz A3 (precio negociado directo 490): 200 ✓
Matriz A2 (descuento global 10): 200 ✓
Matriz B10 (sin price → fallback catálogo): 200 ✓  (compatibilidad)
Matriz A10 (450 = 10% < umbral): 200 ✓   ·   A16 (490.999999): 200 ✓
Matriz A9 (600 = sobrecarga): 200 ✓
A25 (40% CON supervisor real admin/manager): 200 ✓  ← autorización funciona
```

## Interpretación
El objetivo real del mandato queda satisfecho SIN la camisa de fuerza prohibida:
el precio negociado sigue funcionando (por descuento por ítem, por descuento global
y por payload directo) y ahora llega COHERENTE al servidor, que puede auditarlo y
autorizarlo según la política existente.
