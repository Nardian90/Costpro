# FASE D — 06 CHECKOUT E2E (extremo a extremo, entorno aislado)

## Aislamiento (§0-opción4 + §32)

Fixture sintético creado con IDs capturados (`~/scripts/fase-d-fixtures.json`):

```text
auth user : 7d5760a3-806c-4fe6-9eb1-f6e906fb17b5  (fase-d-e2e-0925233117@costpro-test.local)
tienda    : 241c47df-8abf-41e3-956e-4905642e3c69  ("FASE-D TEST FASED0925233117")
membership: auto por trigger → PATCH admin/active
productos : f7c107a4 "FASED Producto A" (100.00, costo 40)
            cbcd90f1 "FASED Producto B" (50.50, costo 20)
stock     : via RPC sancionado register_stock_movement (purchase 10 y 4) + fn_recalc_wac
            (escritor único del WAC — UPDATE directo bloqueado por trigger, evidencia de
             gobernanza ERR_WAC_SINGLE_WRITER_VIOLATION)
turno     : cash_closures a126ea74… status 'pendiente' (apertura vía UI, fondo 1000)
```

Login real por UI (signInWithPassword) → flujo Inicio → OPERACIÓN → Vender.

## Ejecución (navegador headless real, interacción total)

```text
1. Agregar A → "Caja (1)"; Agregar B → "Caja (2)"            ✓ (capturas 01-02)
2. F5 → carrito persiste "Caja (2)" (D11)                    ✓ (captura 03)
3. Navegación ida/vuelta → "Caja (2)" (D12)                  ✓
4. Abrir carrito → 2 líneas, subtotal/total $150.50, aria-live ✓ (captura 04)
5. Primer intento de Cobrar → "NO TIENES TURNO ABIERTO"
   (el flujo canónico EXIGE turno — captura 05) → apertura vía UI ✓ (captura 06)
6. Cobrar → pestaña PAGO $150.50 → modal CONFIRMAR VENTA
   → CONFIRMAR → POST /api/pos/checkout → HTTP 200
   → "¡VENTA COMPLETADA! LA TRANSACCIÓN HA SIDO REGISTRADA
      EXITOSAMENTE — ID: A38FFA6A" + QR + recibo PDF          ✓ (captura 08)
7. Carrito auto-vaciado (items: 0)                            ✓
```

Bugs bloqueantes encontrados y corregidos DURANTE el E2E: RC4 (401 auth) y RC5
(400 walk-in) — ver documento 04. Sin ellos, el checkout V2 era imposible para
cualquier tienda con el flag activo.

## Conciliación de datos (§27, GET-only post-venta)

```text
transactions a38ffa6a…: subtotal 150.5, status 'completed', payment 'cash'
  → UI total $150.50 == persistido 150.5                    ✓
transaction_items (2):
  cbcd90f1 qty 1.0 price 50.5 | f7c107a4 qty 1.0 price 100  ✓
stock: A 20 → 19 (−1) | B 8 → 7 (−1)                        ✓ (vendido == descontado)
stock_movements: ('sale', −1.0, balance 19.0, A) y ('sale', −1.0, balance 7.0, B) ✓
```

## Idempotencia (§10)

```text
misma idempotency_key 2 veces (API real):
  envío1 → HTTP 200 transaction_id 8bb3643f…
  envío2 → HTTP 200 transaction_id 8bb3643f…  (MISMO id, sin duplicado)  ✓ PASS
El cliente además genera key nueva por intento (`sale-${crypto.randomUUID()}`)
y el doble-click de confirmación pasa por un modal (AlertDialog) — doble vía.
```

## Concurrencia / oversell (§12)

```text
checkout qty 27 con stock 17 → HTTP 409
  "ERR_INSUFFICIENT_STOCK: product f7c107a4…, stock 17.0000, requested 27"
stock inmutable tras el intento (17)                                       ✓ PASS
(el recálculo de stock vive en create_sale_v2 server-side — garantía única)
```
