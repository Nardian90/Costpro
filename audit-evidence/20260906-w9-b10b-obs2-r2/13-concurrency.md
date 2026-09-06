# W9.5 — B-10b-OBS-2-R2 · 13-concurrency.md
# GATE 13 — CONCURRENCIA · PASS (dos conexiones independientes reales)

Mecanismo: 2 peticiones HTTP paralelas a la Management API (= 2 conexiones Postgres independientes), arranque escalonado (`scripts/r2_race.js`, raw `r2_race*_conn{1,2}.json`). Ambas conexiones terminan en ROLLBACK → **0 residuo** (verificado post-races: 24/24 métricas idénticas).

Barreras de concurrencia del pipeline: `pg_advisory_xact_lock(hashtext(store_id))` (serializa TODAS las ventas de la tienda) + `FOR UPDATE` de la fila del producto (serializa stock+WAC) + `FOR UPDATE` de la fila de la transacción (serializa void/reverse).

## Race A — dos ventas concurrentes sobre el mismo producto (FA, stock 19; cada una pide 12)

```text
conn1 (t=0):   BEGIN; create_sale_v2(qty 12) → SUCCESS (in-tx stock 19−12=7); pg_sleep(6); ROLLBACK
conn2 (t≈1.3s): BEGIN; lock_timeout=2s; create_sale_v2(qty 12)
               → BLOQUEA en advisory lock de la tienda
               → RECHAZADA: "canceling statement due to lock timeout" (t≈2s < rollback de conn1)
resultado:     exactly ONE writer en la ventana · conn2 vio stock 19 (la venta no confirmada
               de conn1 es INVISIBLE — aislamiento correcto) · 0 mutación persistente      ✓
```

## Race A2 — serialización sin leak (conn2 espera en lugar de abortar)

```text
conn1 (t=0):   venta qty 2 (in-tx stock 17); pg_sleep(4); ROLLBACK
conn2 (t≈1.3s): lock_timeout 15s → espera el advisory lock → ejecuta tras rollback de conn1
               → SUCCESS; stock in-tx = 18 = 19 − 1 (SU venta de 1 unidad; la de conn1 desapareció)
resultado:     transición de estado SERIALIZADA · sin doble decremento · sin stock negativo ·
               sin corrupción WAC · 0 residuo                                          ✓
```

## Race B — venta + void concurrentes

```text
conn1: BEGIN; venta(qty 1); void(propi venta) [in-tx]; pg_sleep(3); ROLLBACK  → sale_ok, void_ok
conn2: void_transaction(<tx inexistente/invisible>) → EXCEPTION ERR_TX_NOT_FOUND
resultado: NO existe compensación de una venta no confirmada (phantom); el void requiere
           una fila committed y visible (SELECT … FOR UPDATE)                        ✓
```

## Race C — venta + reverse concurrentes

```text
conn1: idéntico a Race B → sale_ok, void_ok
conn2: reverse_transaction_v2(<tx inexistente/invisible>) → EXCEPTION ERR_TRANSACTION_NOT_FOUND
resultado: idem Race B para el path administrativo                                    ✓
```

## Nota de diseño honesta (alcance cero-residuo)

La exclusión estricta por stock ("exactly one valid mutation" por agotamiento de stock entre dos ventas concurrentes) requiere una venta **committed**; demostrarla de forma persistente dejaría residuo y viola el mandato. La evidencia equivalente combinada es: (a) Race A demuestra exclusión de escritura concurrente por lock; (b) Race A2 demuestra que tras el rollback no hay leak ni doble conteo; (c) P11 (GATE 14) demuestra el guard ERR_INSUFFICIENT_STOCK con 0 mutación; (d) las barreras FOR UPDATE/advisory están verificadas en las definiciones congeladas. R1 ya demostró el patrón equivalente para la idempotencia del batch (98/6427 final, nunca 196/12854).

## Veredicto GATE 13

```text
PASS — serialized state transition · no negative stock · no duplicate compensation ·
       no WAC corruption · 0 residuo
```
