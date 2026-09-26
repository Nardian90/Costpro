# FASE D — 04 ROOT CAUSE + FIXES APLICADOS

## RC1 — Funcional (el contador queda en 0)

```text
archivo/componente: src/store/cart.ts → clearCartOnStoreSwitch + src/components/views/terminal/views/pos/POSView.tsx:69-81 (efecto de montaje)
estado involucrado: useCartStore.storeId (persistido en localStorage "pos-cart-storage")
evento:             agregar producto con storeId stale y carrito vacío
valor esperado:     cart.storeId === user.activeStoreId → addItem acepta → contador 1
valor observado:    cart.storeId = tienda anterior → guard cross-store rechaza → contador 0
por qué ocurre:     clearCartOnStoreSwitch solo escribía storeId si (items.length > 0)
                    o si storeId era null. Con carrito VACÍO + storeId STALE era un NO-OP:
                    el estado envenenado sobrevivía para siempre (clearCart tampoco
                    resetea storeId; el usuario puede cambiar de tienda fuera del POS).
```

Ciclo real verificado en navegador: sesión anterior en otra tienda → venta completada
(clearCart mantiene storeId) → cambio de tienda → montaje del POS no-op → TODOS los
adds rechazados de forma silenciosa e indefinida.

### Fix RC1 (quirúrgico, src/store/cart.ts)

```ts
if (currentStoreId && newStoreId && currentStoreId !== newStoreId) {
  if (get().items.length > 0) { set({ items: [], …, storeId: newStoreId, … }); notify(…); }
  else { set({ storeId: newStoreId, lastUpdated: Date.now() }); } // FIX-FASE-D: sync SIEMPRE
}
```

## RC2 — Enmascaramiento ("aparentemente se agrega")

```text
archivo:    src/components/views/terminal/views/pos/POSView.tsx (onAddToCart, handleAddItem)
evento:     addItem rechaza internamente (return temprano sin excepción)
observado:  toast.success("… añadido") se mostraba INCONDICIONALMENTE
por qué:    addItem era void — el caller no podía saber si el item entró.
```

### Fix RC2

- `src/store/cart.ts`: `addItem` ahora retorna **boolean** (true = entró al estado;
  false = rechazado por guard). Los guards (cross-store, stock, id) retornan false.
- `POSView.tsx`: los 3 sitios de agregado muestran `toast.success` SOLO si accepted.
  El store ya notifica la causa real (error/warning toast vía handler inyectado).

## RC3 — Hallazgo D8: hueco de stock en ítem nuevo

```text
archivo: src/store/cart.ts (addItem, rama de ítem nuevo)
observado: quantity > stock ACEPTADO en línea nueva (updateQuantity y la ruta de
ítem existente SÍ validaban) → líneas imposibles llegaban al checkout.
fix: guard `incomingQuantity > maxVariantQty → notify + return false` (espejo del
mensaje existente). Test D8 añadido (rechazo + stock inmutable).
```

## RC4 — Hallazgo E2E: checkout V2 → 401 para TODOS (preexistente, bloqueante)

```text
archivo: src/components/views/terminal/views/pos/usePOSCheckout.ts:153 (fetch crudo)
observado: POST /api/pos/checkout sin header Authorization → withAuth fail-closed
(SEC-024) → 401 SIEMPRE que USE_V2_CHECKOUT=true (flag activo; pilot vacío =
todas las tiendas). Log del server: "[getServerSession] … (SEC-024)" + 401.
fix: header `Authorization: Bearer <useAuthStore.getState().token>` en el fetch
(el token existe: LoginForm hace login(session.access_token)). Se mantiene fetch
crudo (no apiFetch) para preservar el mapeo fino de errores del RPC.
```

## RC5 — Hallazgo E2E: ventas walk-in → 400 (preexistente, bloqueante)

```text
archivo: src/app/api/pos/checkout/route.ts:75 (Zod checkoutSchema)
observado: cliente envía customer_name: null ("Cliente eventual") y el schema solo
aceptaba string|undefined → 400 "Invalid data" en TODAS las ventas walk-in V2.
fix: `customer_name: z.string().nullable().optional()` — el RPC create_sale_v2 ya
aceptaba null (p_customer_name). 1 línea + comentario.
```

## Verificación de los fixes

- 9/9 tests nuevos en verde (6 store + 3 componente) — 6 de ellos FAIL pre-fix.
- Suite completa: 2236 PASS / 0 fail (107 archivos; 24 skips preexistentes).
- Navegador A/B: PRE (contador 0 + doble toast) → POST (contador 1, toast único).
- E2E completo: venta real creada (ver 06) tras RC4/RC5.
