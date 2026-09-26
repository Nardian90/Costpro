# FASE D — 05 CART TESTS (batería D1–D12)

Entorno: vitest + jsdom (store real, componentes reales) + navegador headless real.
Archivo principal: `src/__tests__/store/cart-stale-store-sync.test.ts` (6 tests) y
`src/__tests__/components/pos-cart-counter.test.tsx` (3 tests). Suite: 2236 PASS.

| # | Caso | Mecanismo de verificación | Resultado |
|---|------|---------------------------|-----------|
| D1 | Alta de producto (0→1) | Test componente: clic tarjeta → `Caja (1)`; store test: items=1, count=1, accepted=true | **PASS** |
| D2 | Segundo producto distinto | Componente: `Caja (2)`; store: 2 líneas ids [pos-prod-1, pos-prod-2] | **PASS** |
| D3 | Mismo producto (consolidación) | Componente: `Caja (2)`, 1 línea con quantity 2 | **PASS** |
| D4 | Cambio de cantidad x1→x2→x5→x1 | Store: `updateQuantity` clampa a stock y recalcula subtotal + payments (código verificado; existing logic intacta, 0 regresiones en 2236 tests) | **PASS** |
| D5 | Eliminar línea | UI real: botón "Eliminar … del carrito" presente; store `removeItem` filtra por (product_id, variant_id) — contrato intacto | **PASS** |
| D6 | Vaciar carrito | Store `clearCart` → items [], total 0; UI "Anular Carrito" con guard count>0 | **PASS** |
| D7 | Precio correcto / no stale | El carrito usa `product.price` del RPC del turno actual; el total REAL se recalcula server-side en create_sale_v2 (ERR_TOTAL_MISMATCH en el contrato); conciliación §27 UI=.persistido | **PASS** |
| D8 | quantity > stock | PRE: hueco en ítem nuevo (aceptaba). FIX: rechazo con aviso, accepted=false, stock inmutable. Test dedicado | **PASS** (post-fix) |
| D9 | Producto inválido (sin id) | addItem → `if (!productId) return` → accepted=false, sin línea | **PASS** |
| D10 | Cambio de tienda | Con items: limpia + sincroniza + avisa (test). Sin items: sincroniza (FIX RC1). Producto de otra tienda: rechazado (guard intacto, test RC2) | **PASS** |
| D11 | Refresh | Navegador real: 2 items → F5 → "Caja (2)", items 2 (persist + TTL 8h). Captura 03 | **PASS** |
| D12 | Navegación ida/vuelta | Navegador real: Vender → otra vista → Vender → "Caja (2)" intacto (store singleton) | **PASS** |

## Comportamiento offline (§11)

El agregado al carrito es 100% client-side (zustand + persist) → funciona offline por
diseño. El checkout requiere red (POST /api/pos/checkout). El POS ya integra
OfflineStatusIndicator (cola de sync). NO se modificó la arquitectura offline (§38).
