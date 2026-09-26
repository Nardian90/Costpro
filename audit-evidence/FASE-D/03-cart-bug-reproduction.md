# FASE D — 03 CART BUG REPRODUCTION

El bug fue reproducido en **tres niveles independientes** (mandato §3: no basta inspección).

## Nivel 1 — Store (vitest, store real)

`src/__tests__/store/cart-stale-store-sync.test.ts` — ejecución PRE-fix:

```text
✗ RC1 mount sync con carrito vacío     → storeId quedó STALE (esperado: sincronizado)
✗ SÍNTOMA addItem tienda activa        → items: 0 (rechazo silencioso del guard)
✗ RC2 contrato honesto                 → addItem retornó undefined (void)
✓ PROTECCIÓN items>0 limpia+sync       → comportamiento preexistente correcto
✗ RPC store_id null hereda tienda      → accepted undefined
✗ D8 stock: qty>stock en ítem nuevo    → ACEPTADO (hueco de contrato)
Resultado PRE-fix: 5 failed / 1 passed
Resultado POST-fix: 6/6 PASS
```

## Nivel 2 — Componente real POSView (RTL + jsdom)

`src/__tests__/components/pos-cart-counter.test.tsx` — renderiza POSView real con
estado persistido envenenado (storeId de otra tienda) y clic real en la tarjeta:

```text
PRE-fix:  3/3 FAIL — el contador nunca pasa de "Caja (0)"
POST-fix: 3/3 PASS — "Caja (1)", "Caja (2)" con consolidación x2
```

## Nivel 3 — NAVEGADOR REAL (headless, sesión autenticada con fixture sintético)

Preparación (todo en MI tienda sandbox `241c47df…`):

1. localStorage `pos-cart-storage` envenenado: `{"items":[],"storeId":"11111111…" (Tienda Auditor, STALE),"lastUpdated":<ahora>}`
2. Reload → rehidratación zustand carga el storeId stale (verificado por lectura).
3. Vista Vender con tienda activa `241c47df` (FASE-D TEST).

**Ejecución PRE-fix** (fix stasheado con `git stash`, servidor dev sirviendo código viejo):

```text
Clic en "FASED Producto A" →
  toasts: ["FASED Producto A … añadido",            ← toast de ÉXITO (engañoso)
           "No puedes agregar productos de otra tienda al carrito actual"]  ← rechazo real
  CONTADOR: "Caja (0)"   items_en_store: 0   storeId: 11111111 (stale)
Captura: screenshots/01-PREFIX-bug-real-contador-0.png
```

**Ejecución POST-fix** (`git stash pop`, mismo escenario envenenado, recarga):

```text
Clic en "FASED Producto A" →
  toasts: ["FASED Producto A … añadido"]            ← solo el toast veraz
  CONTADOR: "Caja (1)"   items_en_store: 1   storeId: 241c47df (auto-sincronizado)
Captura: screenshots/02-POSTFIX-contador-1.png
```

Clasificación del bug (§4): **categoría A/B híbrida** — el producto NO entra al estado
(rechazo silencioso del guard por storeId stale) mientras la UI afirma lo contrario
(toast de éxito incondicional). Ambas capas corregidas.
