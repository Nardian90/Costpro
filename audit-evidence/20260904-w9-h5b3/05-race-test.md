# W9.4.9 — H5-B3 — GATE 6: PRUEBA CONCURRENTE CONTROLADA (RACE TEST REAL)

Fecha: 2026-09-04 23:13–23:30 UTC (hora sistema) | Datos: 100% sintéticos
Método: cada llamada RPC vía PostgREST (`/rest/v1/rpc/...`) con service_role = UNA sesión
PostgreSQL independiente — idéntico al camino de producción (`/api/reverse` usa
supabase-admin = service_role). El script completo es reproducible:
`scripts/w9h5b3_race.mjs` (salida cruda: `scripts/w9h5b3_race_output.txt`).

## Fixture

- Store sintético `a1b2c3d4-…-0001` (nombre W9H5B3-TEST-STORE), producto `…-0003`
  (stock_current=0, cost_average=400), inventory=0, 6 transacciones `…-0101..0106`
  status='completed', cada una con 1 item de cantidad 5, cost_at_sale=400.
- Usuario real existente con membership activa (seller); segundo usuario real sin
  membership (para tests de seguridad). IDs reales no publicados (PII-safe).

## TEST A — Carrera natural: DOS sesiones simultáneas, mismo id (…0101)

Dos fetch() disparados en el mismo instante (Promise.all):

| sesión | HTTP | duración | respuesta |
|---|---|---|---|
| A-session-1 | 200 | 943 ms | `{"status":"idempotent","transaction_id":"…0101"}` |
| A-session-2 | 200 | 913 ms | `{"status":"success","transaction_id":"…0101","units_restored":5.0}` |

**Resultado: 1 WINNER + 1 RECHAZO IDEMPOTENTE. CERO doble reversión.**

Estado final verificado de …0101:
- status = `voided`
- stock_movements = **1** (sale_reverse, quantity_change=+5) — NO 2
- audit_logs = 2 filas (REVERSE_TRANSACTION_V2 + UPDATE_STATUS del trigger) — 1 evento de reversión
- payment_transactions = 0

## TEST B/B2 — Overlap forzado: lock holder + RPC real

### B (primer diseño, tx …0106): el RPC ganó el lock antes del holder
El RPC completó su reversión (298 ms) ANTES de que el holder adquiriera el lock; luego el
holder ejecutó su UPDATE sobre la fila ya `voided` (transición old==new: permitida como
no-op por `trg_validate_tx_transition`) y sobrescribió `void_reason`. Efectos dobles: NINGUNO
(movements=1, audit=2). Lección: no hubo contención real → se rediseñó el test.

### B2 (determinista, tx …0102 — scripts/w9h5b3_race_b2.mjs)
1. Holder (sesión Management API): `BEGIN; SELECT…FOR UPDATE (…0102); DO pg_sleep(8); COMMIT;`
2. Poll confirma al holder CON el lock (su pg_sleep activo ⇒ su FOR UPDATE ya ejecutó):
   pid 2153252 confirmado en el poll 1.
3. Se dispara el RPC real (PostgREST) a la MISMA fila.
4. **Observador en vivo (t+2 s) captura la sesión RPC BLOQUEADA:**
   ```json
   {"pid":2153254,"state":"active","wait_event_type":"Lock",
    "wait_event":"transactionid",
    "query_head":"WITH pgrst_source AS (SELECT pgrst_call.pgrst_scalar …"}
   ```
   wait_event=`transactionid` = esperando el row-lock de la transacción que sostiene el holder.
5. Resultado: RPC devolvió tras **4229 ms** (línea base del RPC: ~250–350 ms → ~14× más lento
   = tiempo bloqueado), respuesta `{"status":"idempotent"}`.
6. Estado post: `status='voided'`, **movements=0, fresh_audit=0** → el perdedor produjo
   CERO efectos.

**Conclusión GATE 6/7: el bloqueo por `FOR UPDATE` es REAL, OBSERVADO y EFECTIVO. La segunda
sesión no re-valida contra datos viejos: re-lee la fila commitida bajo lock y sale por el
camino idempotente sin tocar stock, audit ni pagos.**

## TEST C — Secuencial V2 → V2 → void_transaction (tx …0103)

| paso | resultado |
|---|---|
| 1ª V2 | 200 `success, units_restored:5` |
| 2ª V2 | 200 `idempotent` |
| void_transaction | 400 `ERR_ALREADY_VOIDED` (mapea a HTTP 409 en /api/reverse) |

1 movimiento, 1 audit de reversión. **No hay doble impacto en reversión secuencial repetida.**

## TEST D — Cross-route: void_transaction primero → V2 (tx …0104)

| paso | resultado |
|---|---|
| void_transaction | 200 `success` |
| V2 después | 200 `idempotent` |

1 movimiento sale_void (vía register_stock_movement). La ruta legacy y la V2 serializan
correctamente entre sí: **el perdedor ve `voided` y rechaza sin efectos.**

Nota de observación: el movimiento de void_transaction queda con `reference_id=NULL`
(la función pasa el id por `p_notes`, no por `p_sale_id`) — traza inconsistente pero
SIN impacto de concurrencia. Registrado como BACKLOG B-7 (no corregido aquí).
