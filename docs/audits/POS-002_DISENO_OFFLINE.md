# POS-002 — Diseño de sincronización offline: idempotencia, conflictos y reserva de inventario

**Misión:** CP-POS-002 · **Fecha:** 2026-11-08 · **Rama:** `fix/cp-pos-002-offline-conflictos`
**Alcance:** ventas POS (recepciones/transferencias/ajustes protegidos con pruebas de regresión, sin cambios de contrato).

---

## 1. Arquitectura actual (auditada) → arquitectura final

| Componente | Antes (auditado, con evidencia) | Después (esta misión) |
|---|---|---|
| Llave de idempotencia (online) | `sale-${crypto.randomUUID()}` **regenerada en cada intento** (`usePOSCheckout.ts:342`, `useSalesCatalog.ts:488`) — un reintento tras respuesta perdida creaba una **segunda venta real** | Llave estable por confirmación de carrito, persistida en outbox ANTES del envío; el reenvío ambiguo es replay idempotente certificado |
| Llave (offline) | Generada en `useSync.addToQueue` (`useSync.ts:152`), ya estable entre reintentos, pero el `p_idempotency_key` del payload se regeneraba por intento y **no viajaba como identidad de negocio consistente** | Identidad de cola = UUID del outbox; `p_idempotency_key` = llave de negocio estable |
| Persistencia previa al envío | Inexistente online; offline solo en el encolo | Outbox `saleOutbox` (localforage) en AMBOS caminos, antes del primer `fetch` |
| Doble envío | `isProcessingSale` (useState) + botón deshabilitado (solo visual) | Cerrojo síncrono `checkoutLockRef` (ref) activado antes del primer `await`, liberado en `finally` |
| Reserva de inventario | No existía: la disponibilidad offline era solo el snapshot (sin descontar pendientes) | Derivada de la cola: `MAX(0, stock_snapshot − Σ líneas no resueltas)`, granularidad tienda×producto×variante, normalizada a unidades base |
| Clasificación de errores | `errMsg.includes('Duplicate') \|\| code==='23505'` (case-sensitive); todo lo demás → `failed` reintentable 3 veces | Clasificación canónica server-side por operación (categorías A–F) con ~70 códigos ERR_* REALES catalogados; campos adicionales `category/conflictType/errorCode/retryable/message` |
| Conflictos | `useSync` marcaba `failed`; el modal ofrecía "Mantener Servidor" que **marcaba `synced` sin confirmación del servidor** (venta perdida silenciosamente) | Estado `conflict` conservando TODO; vista "Ventas por resolver" con 3 acciones; el botón sin confirmación fue ELIMINADO |
| Reintentos | `[1s, 5s, 15s]` fijos, máx 3, todo se reintentaba (incluidos errores deterministas) | Backoff exponencial con jitter completo (base 1 s, tope 60 s, máx 8 automáticos) SOLO para transitorios; al agotar → `retry_exhausted` (conservada, reintento manual) |
| 401 | Se reintentaba como cualquier error (consumía presupuesto) | `auth_required`: pausa el envío autenticado, conserva cola, reanuda con sesión válida; nunca conflicto |
| Concurrencia | `isSyncing` en memoria (sin protección entre pestañas); `'in-flight'` era un estado muerto | Lease en localStorage (propietario + TTL 30 s + renovación 15 s + liberación propia) + estado `in-flight` real escrito antes del primer `await` |
| Orden | Prioridad entidad + clientClock (ya correcto en storage) | Igual + `retry_wait` respeta `nextRetryAt`; un conflicto no bloquea independientes |

## 2. Flujos de checkout

### 2.1 Online (con outbox — D1)

```
confirmación del carrito (startCheckout/processCheckout)
  ├─ cerrojo síncrono checkoutLockRef (antes del primer await)
  ├─ llave estable: sale-<uuid>  (UNA por confirmación)
  ├─ congelar checkoutBody (JSON del POST completo)
  ├─ saleOutbox.create(llave, body)            ← PERSISTENCIA PREVIA AL ENVÍO
  ├─ fetch /api/pos/checkout (mismo body siempre)
  │    ├─ respuesta definitiva ok  → saleOutbox.resolve(llave)
  │    ├─ respuesta definitiva rechazo → resolve + error al usuario
  │    └─ respuesta AMBIGUA (red/caída/timeout)
  │         → la intención queda ABIERTA en el outbox
  │         → un reenvío con la MISMA llave es replay idempotente
  └─ finally: liberar cerrojo
```

### 2.2 Offline (D1+D2)

```
confirmación del carrito (sin conexión)
  ├─ llave estable + saleOutbox.create
  ├─ enqueueSaleWithReservation (SECCIÓN CRÍTICA: mutex de mutaciones)
  │    ├─ reservas = Σ líneas de ops en pending/in-flight/retry_wait/
  │    │            conflict/auth_required (¡el conflicto SIGUE reservando!)
  │    ├─ disponible = MAX(0, snapshot[tienda,producto] − reservas)
  │    ├─ sin snapshot de producto controlado → BLOQUEO con mensaje ES
  │    ├─ servicios (is_service) → sin límite de stock
  │    └─ excede disponible → BLOQUEO ERR_INSUFFICIENT_STOCK_LOCAL
  └─ op en cola (pending) con identidad UUID + p_idempotency_key estable
       → al reconectar: motor → /api/sync/batch → create_sale_v2
```

## 3. Diagrama de estados de la operación (D3/D6)

```
                    ┌──────────────┐  sesión válida (setToken)
                    │ auth_required│──────────────────────┐
        401         └──────────────┘                      │
      ┌────────────────▲──────────────────────────────────┘
      │                │ (reanuda como pending)
┌───────────┐   ┌───────────┐
│  pending  ├──►│ in-flight │  ← lease entre pestañas; se marca ANTES del primer await
└─────┬─────┘   └─────┬─────┘
      │               │ resultado
      │      ┌────────┼─────────────┬──────────────┬─────────────────┐
      │      ▼        ▼             ▼              ▼                 ▼
      │  ┌───────┐ ┌────────┐ ┌───────────┐ ┌───────────┐ ┌────────────────┐
      │  │synced │ │conflict│ │ retry_wait│ │retry_     │ │ auth_required  │
      │  └───┬───┘ └───┬────┘ └─────┬─────┘ │exhausted  │ └────────────────┘
      │      │purga    │            │vence  └─────┬─────┘
      │      ▼         │            ▼(nextRetryAt)│
      │  (eliminada)   │      [reenvío in-flight] │ reintento MANUAL (misma llave)
      │                │                          ▼
      │                │ reintento MANUAL ──► pending (llave+payload intactos)
      │                │ descarte AUDITADO ─► discarded (única salida humana)
      │                └─ NUNCA: → synced sin confirmación del servidor
      │                   NUNCA: liberar reserva sin resolución explícita
      └─ 'failed' LEGADO (builds anteriores, attempts>=3) ≡ retry_exhausted
```

**Transiciones válidas:** pending→in-flight→{synced|conflict|retry_wait|auth_required|retry_exhausted}; retry_wait→in-flight (vencido); auth_required→pending (sesión); conflict/retry_exhausted→pending (reintento manual); conflict→discarded (descarte auditado, servidor confirma auditoría).
**Transiciones prohibidas:** conflict→synced (sin confirmación del servidor — el botón legado fue eliminado); retry_exhausted→conflict (automático); cualquier→eliminación del payload.

## 4. Esquema de persistencia local

| Clave localforage | Contenido | Ciclo de vida |
|---|---|---|
| `sync_queue` | Operaciones (schema extendido: status `retry_wait/conflict/auth_required/retry_exhausted` + `nextRetryAt/conflictType/errorCode`) | synced se purga al final del ciclo; conflict/exhausted permanecen hasta resolución |
| `offline_snapshot` | `products_<storeId>` → `{data, timestamp}` (timestamp REAL para D5) | se refresca en cada hidratación online |
| `cp_pos_002_sale_intents` | Outbox: llave estable + payload congelado + `queueIdempotencyKey` + resolvedAt | prune 30 días |
| `cp_pos_002_sync_lease` (localStorage) | `{owner, expiresAt}` — lease de procesamiento entre pestañas | TTL 30 s, renovación 15 s |

## 5. Mecanismo de idempotencia del servidor (GATE — verificado)

**SÍ existe idempotencia REAL, por llave.** Evidencia (migraciones, solo lectura):

1. `create_sale_v2` vigente (20261105140000, línea 62): firma de 34+ params con `p_idempotency_key text DEFAULT NULL` (posición 19). El id de la venta lo genera el servidor (`v_tx_id := gen_random_uuid()`, línea 69).
2. `idempotency_registry` (creada en 20260810000012): `UNIQUE (idempotency_key, operation)`. La RPC hace `INSERT ... ON CONFLICT DO NOTHING` (líneas 237-240) y:
   - registro nuevo → ejecuta la venta y cierra con `{status:'success'}`;
   - registro previo con **mismo `param_hash`** (md5 determinista de store/actor/items/pagos/fecha/descuentos, líneas 192-235) → devuelve `{status:'idempotent', transaction_id}` **sin re-ejecutar efectos** (línea 261);
   - registro previo con **`param_hash` distinto** → `RAISE ERR_IDEMPOTENCY_KEY_REUSE` (línea 252) — fail-closed;
   - operación concurrente en curso → espera 100 ms y relee; si sigue sin aparecer → RAISE (nunca éxito falso).
3. Backstop atómico anti-TOCTOU: `transactions_idempotency_key_store_idx UNIQUE (idempotency_key, store_id) WHERE idempotency_key IS NOT NULL` (20260803000003).
4. Primera capa adicional en `/api/sync/batch`: prefetch de `sync_log` por llave (replay 'ok' sin re-ejecutar la RPC) + dedupe intra-batch.

**Garantía:** reintento con la MISMA llave y mismo contenido → UNA venta (respuesta idempotente). **Límite documentado:** la idempotencia es POR LLAVE, no por contenido — la llave estable del cliente (D1) es la que cierra esa brecha. **Restricción de la misión respetada:** no se modificó la RPC ni se crearon migraciones.

## 6. Clasificación canónica de errores (códigos REALES)

Categorías y semántica (implementación: `src/lib/sync/error-classification.ts`, catálogo completo con file:line en `audit-evidence/CP-POS-002/codigos-error-reales.md`):

| Categoría | Ejemplos de códigos reales | Estado resultante | Reintento |
|---|---|---|---|
| A. Éxito idempotente | RPC `{status:'idempotent'}` o sync_log 'ok' previo con la misma llave | `synced` | — |
| B. Conflicto de integridad | `ERR_IDEMPOTENCY_KEY_REUSE`; 23505 de `transactions_idempotency_key_store_idx`/`uq_idempotency_key_operation` | `conflict` (integrity) | No |
| C. Conflicto de negocio | `ERR_INSUFFICIENT_STOCK`, `ERR_PRODUCT_NOT_FOUND`, `ERR_INVALID_PRICE`, `ERR_FUTURE_OPERATION_DATE`, `ERR_F21_TASA_INVALIDA`, `ERR_SELLER_MISMATCH`, `ERR_INVOICE_DUPLICATE`, `ERR_SKU_EXISTS`, `ERR_SUPERVISOR_*`, `ERR_TOTAL_MISMATCH`, … (~60 más) | `conflict` (business) | No |
| D. Transitorio | red/timeout/5xx/408/425/429 | `retry_wait` → backoff 1s..60s, jitter completo, máx 8 | Sí |
| E. Sesión expirada | HTTP 401 | `auth_required` (pausa global) | Al reautenticar |
| F. Desconocido | 4xx no reconocido; ERR_ futuro; estructura rara | `conflict` (unknown_error) — se conserva | No (manual) |

Reglas críticas: un 23505 crudo NUNCA se asume éxito idempotente; `ERR_INVOICE_DUPLICATE`/`ERR_SKU_EXISTS` (mayúsculas) se mapean a negocio (antes caían a error reintentable — defecto del detector case-sensitive); 23505 de `idx_receipts_store_reference_doc` → `ERR_INVOICE_DUPLICATE` y de `products_sku_store_unique` → `ERR_SKU_EXISTS`.

**Fix real adicional** (detectado por los tests nuevos): el route hacía `String(err)` sobre el objeto plano `{message, code}` de PostgREST → `'[object Object]'`; en producción TODOS los errores RPC habrían clasificado como unknown. Corregido extrayendo `.message` con seguridad de tipos.

## 7. Política de reintentos (D6)

- Backoff exponencial **con jitter completo** (uniforme [0, delay)): base 1 s, tope 60 s.
- Máximo **8 intentos automáticos**; rng y reloj inyectables (tests deterministas).
- Al agotar: `retry_exhausted` — el payload y la llave se CONSERVAN para reintento manual (nunca se convierte en conflicto, nunca se elimina).
- `nextRetryAt` persistido (sobrevive recargas); `retry_wait` solo reingresa a la selección al vencer.

## 8. Gestión de lease y concurrencia (D6)

- **Cerrojo en memoria** (`isSyncing`): reentrada dentro de un contexto JS.
- **Lease en localStorage** (`cp_pos_002_sync_lease`): exclusión entre pestañas del mismo navegador. Adquisición 100 % síncrona (sin `await` entre check y claim), TTL 30 s, renovación cada 15 s mientras corre el lote, liberación solo del lease propio.
- **Recuperación:** pestaña muerta → lease expira → otra ejecución toma sus `in-flight` y las reenvía CON LA MISMA LLAVE (idempotencia del servidor convierte el reenvío en replay).
- **Alcance honesto:** el lease coordina pestañas del MISMO navegador. Dos navegadores/dispositivos no comparten localStorage — para eso rigen la idempotencia por llave del servidor y la detección de conflictos (§12).

## 9. Cálculo de reserva local (D2)

```
reservas[tienda, producto, variante] = Σ quantity×conversion_factor
    de ops con status ∈ {pending, in-flight, retry_wait, conflict, auth_required}
disponible = MAX(0, snapshot_stock[tienda, producto] − reservas)
```

- **No existe** contador de reserva independiente (derivación pura de la cola — verificado por test).
- Una venta en `conflict` **sigue reservando**: es una operación comercial pendiente; liberar stock silenciosamente permitiría sobrevender lo ya vendido.
- La validación al agregar al carrito y la revalidación al encolar usan la MISMA función; la del encolo ocurre dentro de una sección crítica (mutex de mutaciones localforage).
- Servicios (`is_service === true`): sin control de existencias — criterio REAL de la BD (`products.is_service`, respetado por `create_sale_v2` desde 20261017000000; el índice parcial y el guard del checkout ya lo eximían). Centralizado en el caller del snapshot (`useSalesCatalog` pasa stock ilimitado para servicios). No se usó `is_service` como criterio único sin verificar: la auditoría confirmó que es EL criterio del modelo vigente (no hay `stock_control` ni `item_type` adicionales en `products`).

## 10. Caducidad de snapshots (D5)

- `OFFLINE_SNAPSHOT_WARN_HOURS = 24`, calculado sobre el `timestamp` REAL que guarda `saveSnapshot` por clave `products_<storeId>` (antigüedad POR TIENDA — un snapshot reciente no disfraza a otro viejo).
- Timestamps inválidos/inexistentes/futuros → `unknown` (nunca "fresco").
- El aviso "Inventario local desactualizado (hace X h)" es visible (badge + modal) pero **no bloquea** la venta.
- No se crean timestamps ficticios.

## 11. Interfaz de resolución de ventas (D4/D7)

- **Insignia** "N por resolver" en `SyncStatusBadge` (abre la vista).
- **Vista** "Ventas por resolver" en `SyncConflictModal`: fecha, código, mensaje operativo en español, detalle plegable (payload local + respuesta del servidor), acciones:
  1. **Reintentar** — misma llave, mismo payload; si vuelve a fallar determinista, sigue en conflicto.
  2. **Resolver con ajuste** — enlaza al flujo EXISTENTE de Inventario → Ajustes (no se reimplementa); la venta sigue pendiente; al volver se reintenta con la misma llave.
  3. **Descartar** — solo supervisor/admin (§ abajo).
- Estados diferenciados: en línea / offline / sincronizando / pendientes / por resolver / sesión expirada / reintentos agotados / inventario desactualizado.

## 12. Limitación física: dos dispositivos desconectados (documentada)

Dos dispositivos offline pueden vender físicamente las mismas unidades. D2 NO elimina esto (la reserva es local por dispositivo). Al reconectar, el servidor rechaza la segunda venta con `ERR_INSUFFICIENT_STOCK` → clasifica como conflicto de negocio → aparece en "Ventas por resolver" → el operador ajusta inventario y reintenta o descarta con auditoría. La conciliación es el mecanismo de resolución, como exige la misión.

## 13. Autorización y auditoría del descarte (D4-acción 3)

`POST /api/sync/discard`:
1. **Rol verificado EN EL SERVIDOR** (`isAdminLevel(session.user.role)` — sesión autenticada; jamás un rol del body del cliente). Worker/cajero → 403.
2. **Motivo obligatorio** (10–500 caracteres, trim).
3. **Auditoría PRIMERO** en `audit_logs` (mecanismo EXISTENTE, acción `sync_sale_discarded`, mismo patrón que `sale_negative_rejected`): registra `operation_key`, entidad, `error_code`, motivo, rol autorizador — **SIN PII ni payload comercial**.
4. **Confirmación solo tras auditoría exitosa**: si el insert falla → 500 y la venta se conserva (fail-closed). El cliente marca `discarded` local SOLO con respuesta 200 y cierra la intención del outbox.

## 14. Riesgos residuales y decisiones para misiones futuras

1. **Idempotencia del path `/api/pos/checkout` por llave de cliente**: ya cubierta por D1 (llave estable + outbox), pero el endpoint acepta cualquier string como `idempotency_key` — una misión futura podría alinear su schema con el uuid estricto de la cola.
2. **Overselling entre navegadores/dispositivos**: inherente a la arquitectura local-first (§12). Conciliación por conflicto; posible evolución: reserva optimista server-side (requiere cambios de BD — fuera de alcance, EXCEPCIÓN C).
3. **Cierre de caja con ventas pendientes** (decisión del propietario): hoy el cierre no consulta la cola. Recomendación futura: advertir si existen ventas no resueltas al cerrar.
4. **Bloqueo duro por antigüedad del snapshot** (decisión del propietario): hoy solo aviso (D5 exige no bloquear); una política dura sería configurable.
5. **Política de stock negativo controlado**: hoy `ERR_INSUFFICIENT_STOCK` es fail-closed; una misión futura podría permitir venta con stock negativo documentado (requiere RPC — EXCEPCIÓN B).
6. **Lease compartido solo dentro del navegador** (§8): entre navegadores rige la idempotencia del servidor.
7. **`getPendingOperations` incluye `failed` legado** para no dejar colas viejas huérfanas; los builds antiguos con `attempts>=3` requieren reintento manual explícito.

## 15. Pruebas ejecutadas y pendientes

**Ejecutadas (verde local, 2026-11-08):** 6 baterías nuevas de Vitest (85 tests) + regresión completa de la cola compartida (offline-storage, sync-batch-pnotes, sync-batch-w4-roundtrips, rem-inv-2-dynamic-reachability, iteration-11-1, useSalesCatalog-notes) = **169/169**; `tsc --noEmit` limpio; `playwright --list` carga el spec nuevo. CI del PR: verificado en verde tras el push (ver PR).

**Pendientes (declaradas):**
- E2E `pos-offline.spec.ts`: NO verificado en CI — requiere 3 ejecuciones verdes consecutivas por `workflow_dispatch` contra CostproE2E con `CP_POS_002_RUN_OFFLINE_E2E=1`. Procedimiento: Actions → workflow `E2E Aislado` → Run workflow → target `project` → `spec_filter: pos-offline` (y añadir el secret/variable `CP_POS_002_RUN_OFFLINE_E2E=1` al entorno del workflow tras aprobación del propietario).
- Verificación en dispositivo real: checklist §16.

## 16. Checklist manual para el propietario (dispositivo real)

1. Abrir COSTPRO con conexión; verificar que el catálogo carga (snapshot fresco).
2. Activar modo avión; verificar la insignia "Offline".
3. Realizar una venta válida → verificar toast "guardada localmente" y contador de pendientes.
4. Intentar vender más unidades que las disponibles → verificar bloqueo con mensaje de stock local.
5. Desde otro entorno de pruebas (CostproE2E), reducir el stock del producto vendido.
6. Reconectar → esperar el ciclo de sync (≤30 s).
7. Verificar que la venta conflictiva aparece en "Ventas por resolver" con código `ERR_INSUFFICIENT_STOCK`.
8. Verificar que conserva llave y payload (detalle plegable).
9. Probar "Reintentar" (mantiene la llave) y "Resolver con ajuste".
10. Probar el descarte con usuario cajero (debe rechazar) y con supervisor+motivo (auditoría en `audit_logs`).
11. Verificar que NO existen dos ventas para la misma intención (tabla transactions, idempotency_key).
12. Abrir dos pestañas del POS con cola pendiente → verificar que solo una procesa (lease) y ninguna operación se envía dos veces.

---

*Estado: RESUELTA EN CÓDIGO — PENDIENTE DE VERIFICACIÓN EN DESPLIEGUE (no se declara verificada en producción).*
