# CP-POS-002 — Revalidación de premisas (T1)

Fecha: 2026-11-08 · Base: `origin/main` = 4928b36fc (merge PR #1571) · Auditoría sobre el árbol real, citas `archivo:línea` del momento de la auditoría.

| # | Premisa (documento de misión) | Veredicto | Evidencia real |
|---|---|---|---|
| 1 | La llave tiene formato `sale-${crypto.randomUUID()}` y se regenera en cada intento | **CONFIRMADA** (con matiz) | Online: `usePOSCheckout.ts:342` y `useSalesCatalog.ts:488` generan `sale-${crypto.randomUUID()}` DENTRO del constructor del body de cada intento — se regenera por reintento. Offline: la llave de COLA la genera `useSync.ts:152` (`uuidv4()` en `addToQueue`) y se reutiliza entre reintentos; el `p_idempotency_key` del payload (`useSalesCatalog.ts:438`) también se regeneraba por intento y no coincidía con ninguna identidad persistente. |
| 2 | El motor identifica conflictos principalmente por `Duplicate` o código 23505 | **CONFIRMADA** | `sync-engine.ts:163-165` (throw 'Conflict: …') y `route.ts:340` original: `errMsg.includes('Duplicate') \|\| code==='23505'` — case-sensitive; `ERR_INVOICE_DUPLICATE`/`ERR_SKU_EXISTS` (mayúsculas, P0001) NO matcheaban. |
| 3 | La cola utiliza estados que pueden permitir envíos concurrentes | **CONFIRMADA** | `schemas.ts:1072-1074`: enum con `'in-flight'` que NUNCA se escribía (estado muerto — diseñado para un lease no implementado). Sin lock persistente: solo `isSyncing` en memoria (`sync-engine.ts:8,57`) y el guard de `processQueue` (`useSync.ts:49`). Dos loops independientes (engine 30 s + evento online + useSync) sin coordinación. |
| 4 | El snapshot conserva timestamps, pero no implementa caducidad efectiva | **CONFIRMADA** | `offline-storage.ts:140-165`: `saveSnapshot` guarda `{data, timestamp}` pero NADIE leía el timestamp (grep: cero consumidores). Sin TTL ni aviso. |
| 5 | La reserva local de inventario no descuenta las ventas pendientes | **CONFIRMADA** | No existía ninguna reserva: la disponibilidad offline era el snapshot crudo; `getPendingOperations` no alimentaba ningún cálculo de stock. |
| 6 | Los servicios no descuentan inventario | **CONFIRMADA** | `products.is_service` (types `index.ts:285`, comentario "la BD lo respeta desde 20260810000070"); `create_sale_v2` 20261105140000:365 y :995 exime `is_service=true` del guard de stock; `usePOSCheckout.ts:565-576` y `useSalesCatalog` (filtro `in_stock`) ya eximían servicios. |
| 7 | Existen productos que no controlan stock por otras condiciones además de `is_service` | **REFUTADA** | No existe `stock_control`, `tracks_inventory` ni `item_type` en la tabla `products` (grep de migraciones + type `Product`): `is_service` es EL único criterio del modelo vigente. Documentado en POS-002_DISENO_OFFLINE.md §9. |
| 8 | Las rutas de sincronización atienden otras entidades además de ventas | **CONFIRMADA** | `/api/sync/batch` atiende `sale` (create_sale_v2), `reception` (register_reception), `adjustment` (perform_inventory_adjustment), `transfer` (create_transfer). El mapa de prioridades de `offline-storage.ts:13-23` declara 9 entidades (legacy: `payment`, `checkout`, etc.) pero solo 4 tienen callers reales y soporte del batch. |

## Hallazgos adicionales (fuera de premisas)

- **`SyncConflictModal` "Mantener Servidor" marcaba `synced` SIN confirmación del servidor** (`SyncConflictModal.tsx:33-34` original): una venta desaparecía silenciosamente de la cola sin registrarse — violación directa del principio rector de la misión. Eliminado en esta misión.
- **`String(err)` sobre el error plano de PostgREST** (`route.ts:336` original): `throw result.error` lanza `{message, code}`; `String()` → `'[object Object]'` → en producción TODOS los errores RPC habrían clasificado como desconocidos. Corregido.
- **Preflight idempotente ya existente en el batch**: prefetch de `sync_log` por clave + dedupe intra-batch (`route.ts:92-140`) — reutilizado y complementado con `idempotencyOutcome`.

## Mapa técnico (archivos tocados por esta misión)

| Archivo | Rol | Cambio |
|---|---|---|
| `src/lib/sync/error-classification.ts` | NUEVO | Clasificación canónica isomorfa (categorías A–F) |
| `src/lib/sync/offline-storage.ts` | Outbox + cola + snapshots | `saleOutbox`, `enqueueSaleWithReservation`, reserva derivada, `getSnapshotTimestamp`, mutex de mutaciones, `getUnresolvedSales` |
| `src/lib/sync/sync-engine.ts` | Motor | Clasificación→estados, backoff+jitter, lease, 401 pausa, FIFO, `retry_exhausted` |
| `src/lib/sync/sync-lease.ts` | NUEVO | Lease localStorage (TTL 30 s, renovación 15 s) |
| `src/app/api/sync/batch/route.ts` | API sync | Clasificación server-side + campos canónicos + fix `String(err)` |
| `src/app/api/sync/discard/route.ts` | NUEVO | Descarte auditado (rol server-side + audit_logs fail-closed) |
| `src/validation/schemas.ts` | Contratos | Estados extendidos + campos opcionales (compatibles) |
| `src/components/views/terminal/views/pos/usePOSCheckout.ts` | Checkout POS | Llave estable + cerrojo + outbox |
| `src/components/views/terminal/views/pos/useSalesCatalog.ts` | Catálogo | Llave estable + outbox + encolo con reserva |
| `src/hooks/useSync.ts` | (sin cambios de contrato) | Se mantiene; el engine aporta la clasificación |
| `src/hooks/useUnresolvedSales.ts` | NUEVO | Ventas por resolver + antigüedad snapshot (D4/D5) |
| `src/components/modals/SyncConflictModal.tsx` | UI conflictos | Sección "Ventas por resolver"; eliminado botón sin confirmación |
| `src/components/ui/SyncStatusBadge.tsx` | UI estado | Insignia "N por resolver" + aviso 24 h |
| `e2e/pos-offline.spec.ts` | NUEVO | E2E @offline manual (opt-in) |
