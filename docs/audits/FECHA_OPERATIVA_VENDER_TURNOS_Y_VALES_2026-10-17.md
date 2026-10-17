# FECHA OPERATIVA SELECCIONABLE EN VENDER — TURNOS DE CAJA Y VALES DE SALIDA

**Proyecto:** COSTPRO 4 Multitienda (`Nardian90/Costpro`)
**Fecha:** 2026-10-17
**Vista:** Inicio → OPERACIÓN → Ventas → Vender (`POSView`, incluidos Vale de Salida del carrito y Modo Express)
**Tipo:** Análisis técnico + implementación + pruebas + documentación
**Estado:** COMPLETADA (implementación y pruebas verificadas en BD real; sin despliegue)

---

## 1. Diagnóstico del flujo de fechas anterior

**Cómo funcionaba ANTES de esta misión (verificado en código y BD):**

1. **La vista Vender no mostraba ni permitía elegir ninguna fecha.** El checkout del carrito (`usePOSCheckout` → `POST /api/pos/checkout` → RPC `create_sale_v2`) construía un payload **sin `operation_date`** (ni `sale_notes`), de modo que el RPC resolvía `v_eff := COALESCE(p_operation_date, NOW())` con `p_operation_date = NULL` → **la fecha económica de toda venta del POS era el instante real del servidor**. Lo mismo ocurría con el Vale de Salida del carrito (`useValeSalidaCheckout` → `POST /api/vale-salida` → RPC `create_vale_salida`): el endpoint y el RPC ya aceptaban `operation_date` (paridad ENERVIDA, migración `20261004120000`), pero el hook del carrito nunca la enviaba.

2. **El backend ya tenía soporte completo y no usado.** `create_sale_v2` (26 parámetros, migración vigente `20261017000000`) acepta `p_operation_date` (parámetro 20) y lo propaga a: `transactions.created_at` y `completed_at`, `transaction_items.created_at`, `payment_transactions.payment_date` y `register_stock_movement(p_operation_date := v_eff)` (→ `stock_movements.movement_date` + `created_at`). `create_vale_salida` (7 parámetros, `20261004120000`) hace lo propio con `issue_slips.created_at`, `issue_slip_items.created_at` y sus movimientos. Quien sí lo usaba era la venta por **Catálogo** (`SalesCatalogCheckoutModal` con `OperationDatePicker`), recepciones, ajustes y transferencias — el POS era el único flujo mayor que quedaba fuera.

3. **Validaciones de fecha vigentes (no se alteran):**
   - **BD (gate canónico):** `validate_operation_date(p_new_date, p_store_id)` (migración `20260817000003`): compara **fechas de negocio date-only en `America/Havana`**; mínimo = hoy − 6 meses (`ERR_BACKDATED_DOCUMENT`), máximo = hoy + 1 día (`ERR_FUTURE_DATED_DOCUMENT`). Se invoca dentro del RPC, dentro de la transacción con `pg_advisory_xact_lock(hashtext(p_store_id))`.
   - **Cliente (convención forward-only per-store):** `OperationDatePicker` + `useGlobalOperationDate` → RPC `get_global_max_operation_date(p_store_id)` sobre la vista `v_global_operation_dates` (MAX de ventas, transferencias, ajustes, OCs, recepciones, cierres y movimientos de caja, sesiones, stock_movements y ofertas **de esa tienda**). Usado por Catálogo, transferencias y ajustes; **el carrito del POS no aplicaba ninguna validación de fecha**.

4. **Turnos de caja:** no existe entidad `cash_shifts` ni `shift_id` en ninguna migración. El "turno" es la última fila de `cash_closures` con `status='pendiente'` (`useActiveShift`); su única marca temporal es `created_at` (apertura, reloj de pared) y `closed_at`. **No hay foreign key venta↔turno y no existe ninguna validación que impida vender sin turno o compare la fecha de la venta con la del turno.** El banner `NoShiftBanner` documenta explícitamente que la venta sin turno es posible ("un admin podría querer vender sin turno en emergencias"). El arqueo (`close_cash_shift` / `get_cash_shift_expected`) suma ventas por **ventana temporal** `created_at > apertura del turno AND created_at <= NOW()`.

5. **Consecuencia operativa del estado anterior:** registrar hoy una venta o un vale con fecha económica de un día anterior era **imposible desde Vender** (la fecha quedaba clavada al `NOW()` del servidor), aunque el resto del sistema (Catálogo, almacén) sí lo permitía. Era la misma incidencia ya resuelta para comisiones en la misión 2026-10-16 (pago con fecha elegible) y para el catálogo ENERVIDA (recepción retro-fechada), pero pendiente en la vista de mayor uso.

## 2. Decisión de diseño respecto a los turnos de caja

La auditoría (fase 2 de la misión) confirmó que **la fecha de la venta NO está vinculada al turno**: no hay `shift_id`, no hay campo de "fecha económica del turno" ni de "jornada", y el sistema **permite vender sin turno abierto** por diseño. Por tanto:

- **No se introduce ninguna dependencia obligatoria del turno.** El selector de fecha está disponible **con y sin turno abierto**, exactamente con los mismos límites (misión §2: "No introduzcas una dependencia obligatoria de un turno de caja si el sistema actualmente permite ventas sin turno"). No se crean turnos artificiales, no se reabren turnos cerrados y no se alteran sus fechas.
- **La "fecha del último turno" en este esquema es la `created_at` de apertura** (reloj de pared). No se usó como límite de validación porque no es una fecha económica ni existe regla de negocio que la imponga; usarla como mínimo habría **bloqueado el backdating legítimo** (p. ej. registrar hoy las ventas de ayer) que es el propósito central de la misión y que el resto del sistema ya permite (Catálogo de Ventas, recepciones).
- **Conflicto real identificado y resuelto con aviso explícito (misión §4.2):** una venta/vale con fecha económica **anterior a la apertura del turno activo** queda **fuera de la ventana del arqueo** de ese turno (el arqueo suma por `created_at > apertura`). Este comportamiento ya existe para todo documento retro-fechado del sistema (Catálogo incluido) — no es nuevo. Se resolvió **sin guardar fechas contradictorias**: la sección de fecha muestra un **aviso amber no bloqueante** («La fecha elegida (X) es anterior a la apertura del turno activo (Y). La operación se registrará con la fecha económica elegida y NO entrará en el arqueo de este turno.») y el estado del turno siempre visible («Turno activo desde DD/MM/AAAA HH:MM · día de apertura YYYY-MM-DD» / «Sin turno abierto · la venta no requiere turno»). Así el cajero toma la decisión informada y el arqueo del turno sigue midiendo lo realmente cobrado en él.
- El turn-o no se toca: `cash_closures`, `close_cash_shift`, Z-reports e inmutabilidad de cierres quedan intactos.

## 3. Regla exacta para la fecha mínima

**Regla (idéntica en cliente y coherente con el gate de BD):**

> **Mínimo = fecha de operación máxima vigente de LA TIENDA ACTIVA** — `get_global_max_operation_date(p_active_store_id)` (RPC per-store sobre `v_global_operation_dates`). Es la "última venta/documento de la secuencia operativa correspondiente" **con alcance de TIENDA** (no de caja, no de usuario, no de jornada): es el alcance que ya usa el sistema en todos los flujos con fecha (`SalesCatalogCheckoutModal`, transferencias, ajustes) y el que evita mezclar datos de otras tiendas (misión §4.1).

- Si la tienda **no tiene documentos previos**, el RPC retorna `NULL` → sin mínimo de secuencia (y el gate de BD sigue aplicando su piso absoluto de 6 meses).
- **Piso absoluto adicional en servidor (no se modifica):** `validate_operation_date` rechaza fechas con más de **6 meses** de antigüedad de negocio (`ERR_BACKDATED_DOCUMENT`) — el límite histórico real del sistema, confirmado en la auditoría.
- Refresco cada **30 s** (`refetchInterval` de `useGlobalOperationDate`) → si otra operación concurrente avanza el mínimo, la selección queda inválida, se informa en línea y se deshabilita el botón de confirmación (misión §4.4).

## 4. Regla exacta para la fecha máxima

> **Máximo = HOY como día de negocio en `America/Havana`** (`todayBusinessDay()` de `src/lib/cash-report/period-attribution.ts`, el criterio canónico del proyecto). **No se permite ninguna fecha futura** en el flujo de Vender (misión §4: "no permitas fechas futuras").

Aplicado en las tres capas, sin confiar en el `max` del navegador:

1. **UI:** `OperationDatePicker` ahora acepta `max` (atributo del input) y `useOperationDateValidation(value, storeId, max)` valida el tope con mensaje explícito («La fecha seleccionada no puede ser futura. La fecha máxima permitida es X.»). La zona horaria de la comparación es la de negocio (Habana), no la del navegador.
2. **Cliente (guard pre-vuelo):** `checkNotFutureOperationDate()` en `processCheckout` y `processValeCheckout` aborta con mensaje claro **sin tocar el carrito**.
3. **Servidor (revalidación real):** las rutas `POST /api/pos/checkout` y `POST /api/vale-salida` revalidan `operation_date` con `checkNotFutureOperationDate()` (día de negocio Habana) → **HTTP 422** si es futura; el RPC además corre `validate_operation_date` dentro de la transacción (piso 6 meses / hoy+1 para todo el sistema, que no se altera).

Cálculo de zona horaria: `businessDayOf()/todayBusinessDay()` usan `Intl` con `America/Havana` de forma determinista en cliente y servidor (misma librería `src/lib/cash-report/period-attribution.ts`), sin conversiones UTC que corran el día (misión §4.3).

## 5. Archivos y componentes modificados

**Nuevos (4):**

| Archivo | Contenido |
|---|---|
| `src/lib/pos/operation-date.ts` | Lógica pura compartida: `resolvePosOperationDate` (convención de envío), `checkNotFutureOperationDate` (tope hoy Habana, usada por cliente y rutas), `isBusinessDayBefore` (semántica del aviso de turno). Testeada al 100 % de sus casos de uso. |
| `src/components/views/terminal/views/pos/POSOperationDateSection.tsx` | Sección «Fecha de venta» reutilizable: selector + estado del turno + aviso de arqueo + error siempre visible. Hooks: `usePosSaleDate()` (valor, validación, setters). |
| `src/__tests__/lib/pos-operation-date.test.ts` | 13 tests unitarios de la lógica pura. |
| `src/__tests__/store/cart-saleDate.test.ts` + `src/__tests__/components/POSOperationDateSection.test.tsx` | 7 + 6 tests (contrato del store y smoke del componente). |

**Modificados (11):**

| Archivo | Cambio |
|---|---|
| `src/store/cart.ts` | Nuevo estado `saleDate: string \| null` (persistido en `pos-cart-storage`), `setSaleDate()`, reinicio a `null` (hoy) en `clearCart()` y en el TTL de 8 h; el toggle Venta↔Vale lo preserva. |
| `src/components/views/terminal/views/pos/usePOSCheckout.ts` | Guard de fecha + `operation_date` en el payload (solo si ≠ hoy) + mensajes `ERR_BACKDATED_DOCUMENT`/`ERR_FUTURE_DATED_DOCUMENT` accionables. Cubre carrito normal **y Modo Express** (mismo hook). |
| `src/components/views/terminal/views/pos/useValeSalidaCheckout.ts` | Igual para el vale: guard + `operation_date` + mensajes. |
| `src/components/views/terminal/views/pos/POSCartCheckoutPanel.tsx` | Sección de fecha junto a la información operativa (entre Total/Método y los pagos), fecha visible en el modal «Confirmar Venta», botón Confirmar deshabilitado si la fecha es inválida. |
| `src/components/views/terminal/views/pos/ValeSalidaPanel.tsx` | Misma sección (encima del selector de OT), validación visible, botón «Emitir Vale» deshabilitado si la fecha es inválida. |
| `src/components/views/terminal/views/pos/POSExpressMode.tsx` | Selector en el modal de confirmación Express + gate del botón Confirmar. |
| `src/components/ui/OperationDatePicker.tsx` | Props opcionales `max` e `inputId` (retro-compatibles; los 4 consumidores previos no cambian). |
| `src/hooks/api/useGlobalOperationDate.ts` | `validateOperationDate()` acepta `maxAllowedDate` opcional (valida el tope independientemente del mínimo). Retro-compatible. |
| `src/app/api/pos/checkout/route.ts` | Revalidación server-side (422 fecha futura) + mensajes de error de fecha actualizados al gate real (6 meses + secuencia) + mapeo `ERR_FUTURE_DATED_DOCUMENT`. |
| `src/app/api/vale-salida/route.ts` | Revalidación server-side + mapeos `ERR_BACKDATED_DOCUMENT`/`ERR_FUTURE_DATED_DOCUMENT` → **422 con mensaje accionable** (antes caían a 500 con texto crudo). |
| `src/__tests__/hooks/useGlobalOperationDate-validate.test.ts` | 5 tests nuevos del tope superior (`maxAllowedDate`). |

## 6. Cambios en servicios, RPC, triggers y esquema

**Esquema de BD: sin cambios. No hay migración.** Se verificó que las columnas existentes bastan (misión §7: «No agregues una segunda columna de fecha sin demostrar por qué los campos actuales no son suficientes»): `transactions.created_at/completed_at`, `issue_slips.created_at`, `stock_movements.movement_date/created_at`, `payment_transactions.payment_date` ya son la fuente de verdad y los RPCs ya las estampan con `v_eff`.

- **RPCs:** `create_sale_v2` y `create_vale_salida` **no se modifican** — ya aceptaban `p_operation_date` y lo propagaban. Ahora reciben el valor desde el POS.
- **Triggers:** ninguno alterado. `trigger_audit_product_changes`, `trg_ensure_product_barcode`, `auto_kardex_on_stock_movement`, inmutabilidad de `cash_closures`: intactos.
- **RLS/permisos:** sin cambios; los permisos por tienda/usuario siguen aplicando en las mismas capas (JWT en rutas, `p_user_id` del actor en RPCs, acceso de tienda en `has_store_access_as`).
- **Rutas API:** validación **aditiva** (422 de fecha futura) y mejoras de mensaje; cero cambios de contrato de salida.
- **Idempotencia:** sin cambios estructurales; el hash del `idempotency_registry` ya incluye la fecha por epoch — probado: misma clave con distinta fecha → `ERR_IDEMPOTENCY_KEY_REUSE` (no se muta la fecha de una venta ya registrada).
- **Reversión:** trivial — revertir el commit de esta rama restaura el comportamiento anterior (no hay DDL que revertir). Todos los cambios de código son aditivos y los props nuevos son opcionales.

## 7. Propagación de la fecha desde Vender

Cadena completa (misión §5/§6/§7):

```
Selector «Fecha de venta» (cart store saleDate, persistido, visible en carrito y modal)
  → guard cliente (checkNotFutureOperationDate; aborta sin tocar el carrito)
  → payload {operation_date?: ISO-mediodía} (solo si ≠ hoy Habana)
  → POST /api/pos/checkout | /api/vale-salida  (revalidación server-side 422)
  → RPC create_sale_v2 | create_vale_salida    (validate_operation_date + advisory lock, en transacción)
      ├─ transactions.created_at = completed_at = v_eff        → listado y detalle de ventas
      ├─ transaction_items.created_at = v_eff
      ├─ payment_transactions.payment_date = v_eff             → comisiones/Reporte Entrega (por día de pago)
      ├─ issue_slips.created_at = v_eff (+ items)              → Vales de Salida (listado/detalle/estados intactos)
      ├─ stock_movements.movement_date = created_at = v_eff    → Inventario e IPV (movement_date)
      └─ Kardex (get_product_stock_ledger_paginated) → created_at = v_eff → día económico correcto
  → Informes: /api/sales/summary (completed_at), IPV (movement_date + completed_at), batch_store_kpis, PDF/Excel — leen los campos anteriores, cero cambios necesarios.
```

- **`created_at`/timestamps técnicos:** la fecha económica se persiste en los campos de fecha operativa (created_at/completed_at/movement_date de los documentos, que es el campo que el sistema usa como fecha económica — misma semántica que Catálogo/recepciones desde siempre); **la auditoría (`audit_logs.created_at`) y `wac_change_log` conservan el momento REAL de ejecución** (patrón oficial del proyecto: «documentos retro-fechados, auditoría en tiempo real»). La hora real de registro del usuario queda además en los logs del servidor.
- **Regla de envío «hoy → NOW()»:** cuando la fecha seleccionada es HOY (Habana) el cliente **no envía** `operation_date` y el servidor estampa `NOW()` exactamente como siempre → las ventas del día conservan timestamps reales al segundo (orden del ledger, ventana del arqueo del turno y duplicados quedan como antes: **cero regresión** en el flujo mayoritario). Probado (P3).
- **Sin doble descuento:** una confirmación del carrito produce **una** operación: venta (modo Venta) **o** vale (modo Vale de Salida) — el toggle limpia el estado incompatible; `create_sale_v2` no crea vales (verificado por auditoría de código del RPC) y `create_vale_salida` no crea ventas (probado: P5 `no_sale_created = true`). La atomicidad venta+inventario sigue garantizada por la transacción única del RPC con advisory lock por tienda.
- **Offline:** el camino offline de ventas (`useSalesCatalog` → `/api/sync/batch`) ya reenvía `p_operation_date` del payload encolado (línea 220 de la ruta) — sin cambios necesarios.

## 8. Matriz de pruebas y resultados reales

**Ejecutadas automáticamente el 2026-10-17.**

### 8.1 Unitarias (vitest) — 35/35 PASS

| # Misión | Escenario | Test | Resultado |
|---|---|---|---|
| A.1/A.3 | Selector visible, etiqueta «Fecha de venta», min/max en el input | `POSOperationDateSection.test.tsx` (2 tests) | PASS |
| A.2 | Fecha inicial = hoy Habana (`todayBusinessDay`) | ídem + `cart-saleDate.test.ts` | PASS |
| A.4 | Rechazo de fecha anterior al límite inferior | `useGlobalOperationDate-validate.test.ts` (min) + componente | PASS |
| A.5 | Rechazo de fecha futura (tope independiente del mínimo) | `useGlobalOperationDate-validate.test.ts` (max) | PASS |
| A.7 | Sin ventas previas → sin mínimo de secuencia | test existente «sin mínimo → válido» | PASS |
| B.9/B.10 | Estado del turno visible (sin turno / activo), no bloqueante | `POSOperationDateSection.test.tsx` | PASS |
| B.11 | Aviso no bloqueante cuando fecha < apertura del turno | `POSOperationDateSection.test.tsx` | PASS |
| B.14 | Límites per-store (sin contaminación entre tiendas) | diseño RPC per-store + `storeId` en toda la cadena | PASS (código) |
| C.16/C.17 | `setSaleDate`, persistencia, toggle preserva, clearCart reinicia | `cart-saleDate.test.ts` (7 tests) | PASS |
| A.6/A.8 | `checkNotFutureOperationDate` (Havana, date-only e ISO, mensaje con ambas fechas) + `resolvePosOperationDate` + `isBusinessDayBefore` | `pos-operation-date.test.ts` (13 tests) | PASS |

### 8.2 Integración en BD real (Management API, cada bloque en `BEGIN…ROLLBACK`, cero persistencia) — 10/10 PASS
Evidencia completa: `/home/z/my-project/scripts/mision_fecha_operativa_db.json` (fuera del repo; sin secretos).

| # Misión | Escenario | Resultado (evidencia real) |
|---|---|---|
| C.15 | **P1** — Venta con fecha seleccionada (2026-10-15 12:00 HV): `transactions.created_at = completed_at = 2026-10-15T16:00Z`, día de negocio Havana `2026-10-15`, `transaction_items.created_at` igual, `payment_transactions.payment_date` igual, `stock_movements.movement_date = created_at = 2026-10-15T16:00Z` (qty −1, type sale) y el **Kardex** (`get_product_stock_ledger_paginated`) muestra el movimiento en el día económico | PASS |
| C.16 | **P2** — Dos ventas consecutivas con fechas distintas (10-14 y 10-15): cada una conserva su propia fecha (`a_date=2026-10-14`, `b_date=2026-10-15`), 2 transacciones | PASS |
| C.34 | **P3** — Venta SIN `operation_date` (hoy implícito): `created_at = NOW()` (segundos de diferencia), día de negocio 2026-10-17 → conducta canónica intacta | PASS |
| C.18 | **P4** — Reintento con misma clave + misma fecha: 2.ª llamada retorna `status=idempotent` con el MISMO `transaction_id`; exactamente 1 transacción | PASS |
| A.8 | **N1** — Venta con fecha futura (hoy+2): rechazada con `ERR_FUTURE_DATED_DOCUMENT` | PASS |
| A.4 | **N2** — Venta con fecha > 6 meses: rechazada con `ERR_BACKDATED_DOCUMENT` | PASS |
| §4.4 | **N3** — Misma clave con FECHA distinta: `ERR_IDEMPOTENCY_KEY_REUSE` (no se muta la fecha de una venta registrada; sin ventas parciales) | PASS |
| D.22 | **P5** — Vale de salida desde el carrito con la fecha seleccionada: `issue_slips.created_at = items.created_at = 2026-10-15T16:00Z` (día de negocio 10-15), movimiento `issue_slip_out` con `movement_date` igual, **sin venta asociada** | PASS |
| A.5/D | **N4** — Vale con fecha futura: rechazado con `ERR_FUTURE_DATED_DOCUMENT` | PASS |
| §10 | **R** — Residuos: 0 transacciones, 0 vales, 0 movimientos, 0 registros de idempotencia con las claves de prueba; stock del SKU de prueba intacto (2 uds) | PASS |

### 8.3 Regresión (misión §9-E) — suite completa

| # Misión | Escenario | Resultado |
|---|---|---|
| 27–30, 32 | Reporte diario, IPV, PDF/Excel, auditoría, cantidades fraccionarias | **Suite completa: 181 archivos, 3127 tests PASSED, 0 fallos** (los reportes leen `completed_at`/`movement_date`, que ahora llevan la fecha elegida; los cálculos de `create_sale_v2` no se tocaron) |
| 33 | Ventas históricas sin modificación | Sin UPDATE/DELETE/migración de datos en la misión; solo INSERTs de prueba en transacciones revertidas (R: 0 residuos) |
| 31 | Operaciones de tiendas diferentes | Límites per-store por diseño (`p_store_id` en ambos gates); suite PASS |
| 34 | Flujos habituales sin fecha manual | `operation_date` sigue siendo opcional; P3 demuestra NOW() intacto; 3127 tests PASS |

**No ejecutadas (honestidad de la matriz):** pruebas E2E de navegador (requieren entorno staging con sesión real; el CI del PR ejecuta la suite unitaria/integración y build) y la simulación de condición de carrera real (N13 se cubre por diseño: advisory lock `pg_advisory_xact_lock(hashtext(store_id))` + revalidación dentro de la transacción + refetch de 30 s + revalidación en ruta y RPC).

## 9. Evidencia de que no se modificaron fechas históricas

1. **Cero DDL sobre datos y cero UPDATE/DELETE:** la implementación no incluye migración ni script de datos; los RPCs y triggers quedaron intactos.
2. **Las pruebas de BD corrieron con `BEGIN…ROLLBACK`** y la verificación final (R) demuestra 0 residuos: 0 transacciones, 0 vales, 0 movimientos y 0 registros de idempotencia con las claves `mision-fecha-op-%`; el stock del producto de prueba quedó exactamente igual (2 uds).
3. Verificación puntual adicional post-pruebas (query de conteo sobre `transactions`/`issue_slips` con las claves de prueba) — 0 filas.
4. El único cambio persistente en BD durante la misión es **ninguno**; el estado pre-misión de la tienda ENERVIDA (incluida la recepción del 16/10 y las 20 operaciones de esa fecha) queda intacto.

## 10. Riesgos y limitaciones

1. **Venta retro-fechada fuera del arqueo del turno activo** (comportamiento preexistente de todo el sistema, ahora **avisado en la UI**): una operación fechada antes de la apertura del turno no entra en el arqueo de ese turno. Documentado en la sección 2; no se consideró correcto bloquearlo (impediría el registro retroactivo legítimo que la propia misión ordena).
2. **Divergencia cliente/servidor heredada:** el cliente aplica forward-only per-store (mínimo = MAX de la tienda) mientras el gate de BD permite hasta 6 meses atrás. Se mantiene la convención del proyecto (más estricta en UI) — el mensaje del servidor ya describe el gate real. No se cambió el gate canónico porque gobierna todos los flujos (recepciones, ajustes, transferencias).
3. **Gate de BD permite hoy+1** (política temporal del sistema para todos los módulos); el flujo de Vender es más estricto: la ruta revalida y rechaza con 422 cualquier fecha > hoy Habana. Un documento fechado «mañana» solo podría entrar por vías ajenas a Vender (fuera de alcance).
4. **`kardex_entries` (tabla de cierre fiscal):** el trigger `auto_kardex_on_stock_movement` estampa `created_at` de pared (no lee `NEW.movement_date`) — divergencia **preexistente** que afecta a todos los flujos; la tabla no se consume por la UI del Kardex (que lee `stock_movements` vía RPC) ni por IPV (el Excel declara explícitamente que usa `stock_movements.movement_date`). No se tocó para no alterar el cierre fiscal; queda documentada como mejora futura.
5. **`close_service_order_as_sale`** (OT→venta) sigue estampando `NOW()` sin soporte de fecha operativa — camino secundario, fuera de la vista Vender.
6. **Inconsistencia de agrupación heredada** (`batch_store_kpis` y libros fiscales por `transactions.created_at` vs `/api/sales/summary` por `completed_at`): irrelevante para esta feature porque `create_sale_v2` escribe ambas columnas con el mismo `v_eff`; ya era así para ventas con fecha.
7. **Reloj del navegador adelantado:** si el usuario elige «hoy» de su navegador y es futuro respecto a Habana, el guard/ruta lo rechazan con mensaje claro y el carrito se conserva (comportamiento deseado, misión §4.3).
8. **Cambio de fecha y límite concurrente:** si el mínimo de la tienda avanza mientras el carrito está abierto, la validación (refetch 30 s) marca la fecha inválida, se informa en línea y el botón de confirmación se deshabilita hasta nueva selección; el servidor revalida de todos modos (defensa en profundidad).

## 11. Commit y PR

- **Rama:** `feat/fecha-operativa-vender` (desde `origin/main` `9ebdada5b`).
- **Commits:** `7a31f5a6c` (implementación + informe) + commit de actualización de esta sección.
- **PR:** **#1419** — https://github.com/Nardian90/Costpro/pull/1419 (base `main`, head `feat/fecha-operativa-vender`).
- **Despliegue:** NO realizado (ver sección 12). Sin fusiones.

## 12. Estado del despliegue

**No se ha desplegado nada a producción.** No hubo merge, no hubo `deploy`, no hubo ejecución de migraciones (no las hay). El código vive únicamente en la rama `feat/fecha-operativa-vender` y en el PR correspondiente (sección 11), pendiente de revisión y fusión por el propietario. Los RPCs de producción ya soportan la feature desde antes (migraciones `20261004120000`/`20261017000000` previamente aplicadas), por lo que **la activación completa ocurre al fusionar y desplegar la app** por el procedimiento autorizado del proyecto (Vercel/CI).
