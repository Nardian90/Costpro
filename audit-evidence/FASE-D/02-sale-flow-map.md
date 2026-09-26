# FASE D — 02 SALE FLOW MAP (arquitectura del flujo de Venta)

```text
Inicio (dashboard)
  ↓ sidebar/hub OPERACIÓN
  ↓ botón "Vender" (navigation-definition.ts:118 — id 'pos', label 'Vender')
  ↓ POSView (src/components/views/terminal/views/pos/POSView.tsx)
      ├─ productos: useProducts(activeStoreId) → RPC Supabase get_products_for_pos
      │   (el stock del RPC se deriva de stock_movements, NO de products.stock_current)
      ├─ búsqueda: usePOSServerSearch (paginado + SKU-prefix "123*")
      ├─ agregar: onAddToCart/handleAddItem → useCartStore.addItem (src/store/cart.ts)
      │   guards: cross-store (storeId), stock (maxVariantQty), id ausente
      ├─ carrito: POSCart (sidebar/portal móvil) + StickyCartSummary (móvil)
      │   contadores: header "Caja (N)", SpeedDial, badge sticky, aria-live —
      │   todos derivan del MISMO store (single source of truth; sin dual-state)
      ├─ persistencia: zustand persist "pos-cart-storage" (localStorage, TTL 8h,
      │   partialize sin customerId; migrate + onRehydrateStorage)
      ├─ checkout: usePOSCheckout.startCheckout → validaciones (descuadres, tasas)
      │   → POST /api/pos/checkout (withAuth fail-closed, CSRF, rate-limit, Zod)
      │   → RPC create_sale_v2 (recalculo server-side, supervisor ≥15%, idempotencia)
      ├─ turno: cash_closures status 'pendiente' — exigido por el checkout
      └─ éxito: POSCartSuccessView (ID venta + QR + recibo PDF)
```

## Contrato de CartItem (real, src/store/cart.ts)

```text
Obligatorios: product_id, variant_id|null, quantity, product, price, base_price_cup,
              cost, subtotal, payments[] (PaymentRow), cash/transfer/zelle_*,
              currency, exchange_rate, payment_manual_override
Derivados:    subtotal = calculateItemSubtotal(item); syncLegacyFields recalcula
              cash_paid etc. desde payments[]
Persistidos:  items, discount, appliedTaxes, sessionUserId, storeId, lastUpdated,
              selectedPayment, operationType, productionOrderId, valeNotes
Al backend:   product_id, variant_id, quantity, price→price_at_sale, cost→cost_at_sale,
              cash/transfer/zelle_paid, currency, exchange_rate, descuentos por método
```

## Superficies de agregado (todas usan el mismo store)

1. POSView `onAddToCart` (grid/tabla/autocomplete/escáner/SKU*) — flujo reportado.
2. POSView `handleAddItem` (modal de variantes/precios).
3. useSalesCatalog `confirmCheckout` (catálogo de venta) → re-agrega y usa checkout V2.
4. useDuplicateDocumentV2 (Duplicar venta) → addItem + forceOpenCart.

## Matriz de diagnóstico (mandato §3 A–H)

```text
A selección:        ProductCard onClick → product completo del RPC (id/price/stock)  OK
B handler:          onAddToCart → addItem(...) sí se ejecuta (toast visible)         OK
C estado:           zustand set(produce) — items[] mutado inmutablemente             OK
D mismo store:      contadores = getItemCount() del ÚNICO useCartStore               OK (sin dual-store)
E duplicación:      persist localStorage única ("pos-cart-storage")                  OK
F hidratación:      persist síncrono (localStorage); TTL 8h + migrate sanean         OK
G identidad:        product_id del RPC = id esperado por el carrito                  OK
H tienda activa:    POSView effect sincroniza cart.storeId con user.activeStoreId
                    → AQUÍ ESTABA EL BUG (RC1): sync NO-OP con carrito vacío         BUG (ver 03/04)
```
