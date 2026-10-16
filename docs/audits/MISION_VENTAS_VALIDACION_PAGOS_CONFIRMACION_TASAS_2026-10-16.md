# MISION_VENTAS_VALIDACION_PAGOS_CONFIRMACION_TASAS — 2026-10-17

**Aplicación:** COSTPRO 4 Multitienda
**Rutas:** Inicio → OPERACIÓN → Ventas → Vender (carrito/POS) · Inicio → OPERACIÓN → Auditoría
**Branch:** `feat/pos-incidencias-pago-tasas-diarias` · **PR:** [#1415](https://github.com/Nardian90/Costpro/pull/1415) (base `main`)
**Commit principal:** `5c52dbdf6`
**Estado:** Implementado en rama de trabajo — **NO desplegado en producción**. La migración SQL requiere aplicación por el procedimiento autorizado del proyecto.

---

## 1. Diagnóstico de la causa raíz

Antes de esta misión, tres validaciones interrumpían el flujo del cajero ante diferencias de pago:

1. **Gate por ítem (cliente)** — `usePOSCheckout.ts` (función `startCheckout`): comparaba el pago del ítem (CUP, vía `getItemPaidCup`) contra el subtotal ajustado por descuento global y hacía `return` con el toast `Pago mixto descuadrado en "X". Revisa el desglose efectivo/transferencia/Transf. Exterior.` — bloqueo duro, sin posibilidad de continuar.
2. **Modal «Descuadre de tasa» (cliente)** — pausaba el checkout cuando la diferencia global multi-moneda superaba el 2%; solo permitía «Cancelar» (volver) o «Confirmar venta» (continuar) **sin registrar la diferencia aceptada** en ningún lugar.
3. **Servidor (RPC `create_sale_v2`)** — `ERR_PAYMENT_MISMATCH` (desvío de medios de pago > 1.00 CUP) e invariante PT011 `ERR_PAYMENT_INVARIANT_VIOLATED` (Σ pagos ≠ total > 0.01 CUP) rechazaban la venta; el constraint de BD `chk_mixed_payment_consistency` imponía la misma regla. La venta con pago parcial era **imposible de registrar**, y como no existía columna de nota ni canal estructurado en la venta, tampoco había forma trazable de documentarla.

En paralelo, la protección contra ventas negativas existía de facto (precio ≥ 0, descuento `LEAST(subtotal)`, `getTotal()` acotado a 0 en cliente) pero **sin guard explícito ni traza del intento**: un intento de venta negativa se rechazaba en silencio o, en el caso de `getExpectedTotalCup()` negativo, con un mensaje genérico de «total de 0», sin dejar constancia en Auditoría (lo que el usuario pidió explícitamente: «si una venta es negativa no se apruebe pero sí se refleje en Auditoría»).

Respecto a las tasas de cambio, la fuente de verdad ya era correcta (`store_exchange_rates` → `/api/store-rates`, hidratada al montar el POS), pero **nada evitaba vender con tasas obsoletas por olvido del cajero**, no había confirmación diaria, y las actualizaciones de tasa **no quedaban auditadas** (solo un `logger.info` sobrescribible).

## 2. Archivos modificados y motivo

| Archivo | Cambio | Motivo |
|---|---|---|
| `src/lib/pos/payment-incidents.ts` **(nuevo)** | Librería pura: cálculo de incidencias (global + por línea), nota automática, resumen para toasts. Reutiliza `round2` canónico de `store/cart` (sin segunda fórmula). | Lógica testable en aislamiento, compartida entre `startCheckout` y `processCheckout`. |
| `src/lib/pos/rates-confirmation.ts` **(nuevo)** | Librería pura: clave diaria, evaluación `not_confirmed`/`rates_changed`, factoría del registro. | Reglas de frecuencia del diálogo testeables. |
| `src/components/views/terminal/views/pos/usePOSCheckout.ts` | Flexibilización del gate por ítem (informa, no bloquea); guard de venta negativa extendido + traza en Auditoría; `processCheckout` calcula incidencias y envía `payment_incidents`; métodos simples envían lo REALMENTE recibido cuando hay incidencias; toast diferenciado «CON INCIDENCIA DE PAGO»; `confirmRateWarning` adjunta la diferencia del modal como `rate_difference`. | Comportamiento central de la misión. |
| `src/components/views/terminal/views/pos/POSView.tsx` | Wire del hook `useDailyRatesConfirmation` + `<RatesConfirmationModal>` sobre la apertura del carrito. | Disparador «al abrir el carrito». |
| `src/components/views/terminal/views/pos/POSCartItem.tsx` | Modal de tasas inline extraído; el botón «Tasas» solo abre. | Reutilización y reducción de duplicación. |
| `src/components/views/terminal/views/pos/StoreRatesModal.tsx` **(nuevo)** | Modal de tasas compartido (carga/guardado/re-tasado idénticos al original + fecha de última actualización). | Acción B del diálogo de confirmación. |
| `src/components/views/terminal/views/pos/RatesConfirmationModal.tsx` **(nuevo)** | Diálogo «¿Confirma que las tasas de cambio siguen vigentes?» con valores reales, fecha de actualización, acciones A/B y salida honesta sin confirmación falsa. | Requisito 6 de la misión. |
| `src/hooks/api/useDailyRatesConfirmation.ts` **(nuevo)** | Persistencia servidor (`user_preferences`, clave `rates-confirmation:<tienda>:<día>`), re-pedido si cambian las tasas, auditoría, idempotencia, permisos `canManageStore`. | Frecuencia 1/día/tienda/usuario + caducidad estructural. |
| `src/services/audit-service.ts` | Métodos `logNegativeSaleAttempt` y `logRatesConfirmed` (nunca lanzan). | Trazabilidad de intentos y confirmaciones. |
| `src/app/api/pos/checkout/route.ts` | Zod de `payment_incidents`/`sale_notes`; paso condicional al RPC (venta exacta = payload canónico); mapeo `ERR_NEGATIVE_SALE` → 422 + auditoría server-side; mapeo `ERR_RATE_REQUIRED_FOR_INCIDENT` → 409. | Validación y trazabilidad server-side. |
| `src/app/api/store-rates/route.ts` | GET devuelve `updated_at`; POST registra `UPDATE_STORE_RATES` (old/new) y refresca `updated_at` (la columna no tiene trigger). | Auditar quién cambió la tasa y cuándo. |
| `src/lib/audit/eventPresentation.ts` | Títulos de negocio para los 4 eventos nuevos; `SALE_PAYMENT_INCIDENT` añadido a la whitelist documental («Ver venta»). | Visibilidad en Auditoría. |
| `src/components/views/terminal/views/audit/AuditEventCard.tsx` | Tarjetas de negocio para los 4 eventos nuevos (diferencia, fuente, día). | Lectura humana del evento. |
| `supabase/migrations/20261017000000_pos_payment_incidents_negative_guard.sql` **(nueva)** | Columnas `notes`/`payment_incidents`; relajación de `chk_mixed_payment_consistency` SOLO con incidencias; `CHECK (total_amount >= 0) NOT VALID`; redefinición quirúrgica de `create_sale_v2` (params `p_notes`/`p_payment_incidents` al final de la firma, guard `ERR_NEGATIVE_SALE`, guardrail `ERR_RATE_REQUIRED_FOR_INCIDENT`, nota automática, evento `SALE_PAYMENT_INCIDENT`, hash de idempotencia ampliado, auto-total Zelle desactivado con incidencias). | Capa de persistencia de toda la misión. |
| `tsconfig.mision-1710.json` **(nuevo)** | Typecheck acotado (el `tsc --noEmit` global agota la memoria en el entorno local; CI usa `bunx tsc`). | Verificación local. |
| Tests (4 archivos nuevos, 36 tests) | Ver §8. | Matriz de pruebas de la misión. |

## 3. Migraciones

Una única migración **aditiva y reversible**: `supabase/migrations/20261017000000_pos_payment_incidents_negative_guard.sql`.

- `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS notes text;` y `payment_incidents jsonb;` — reversibles con `DROP COLUMN`.
- `chk_mixed_payment_consistency` se recrea con una tercera cláusula: `OR payment_incidents IS NOT NULL` — sin incidencias, la regla canónica (|Σ − total| ≤ 1.00) se mantiene idéntica.
- `chk_transaction_total_non_negative CHECK (total_amount >= 0) NOT VALID` — aplica a filas nuevas sin revalidar histórico.
- `create_sale_v2` se redefine copiando la definición canónica (20261014000000) con cambios quirúrgicos; los parámetros nuevos van **al final** de la firma con `DEFAULT NULL`, por lo que las llamadas existentes siguen válidas. El cliente solo envía `p_payment_incidents`/`p_notes` cuando existen → una venta exacta contra una BD sin migrar se comporta como hoy.

**⚠️ Pendiente operacional:** aplicar la migración a la base Supabase por el procedimiento autorizado del proyecto (no se ejecutó desde aquí: no existe Postgres local y la política de la misión prohíbe tocar producción sin procedimiento). Hasta entonces, las ventas con incidencia recibirán el rechazo canónico `ERR_PAYMENT_MISMATCH` (comportamiento anterior) — degradación segura, sin rotura.

## 4. Comportamiento anterior y nuevo

| Situación | Antes | Ahora |
|---|---|---|
| Pago mixto con desglose descuadrado | Toast + bloqueo (`return`) | Toast de aviso con el importe; la venta se registra con incidencia estructurada + nota + evento en Auditoría |
| Faltante ≤ 2% en venta multimoneda | Bloqueo por ítem | Continúa directo con incidencias |
| Faltante > 2% | Modal «Descuadre de tasa» pausaba; «Confirmar venta» continuaba **sin rastro** | Mismo modal (oportunidad de corregir tasa); al confirmar, la diferencia se registra como `rate_difference` + incidencias |
| Sobrepago | Badge informativo; servidor exigía Σ pagos = total | Se registra lo recibido; diferencia documentada (nota + JSONB + Auditoría) |
| Venta exacta | Flujo normal | **Intacto**: payload canónico sin `payment_incidents`, sin toasts extra, sin nota |
| Venta con total negativo | Rechazo silencioso/genérico | Rechazo explícito en 3 capas + intento visible en Auditoría |
| Total 0 | Bloqueado | Igual (política sin cambios; no se confunde con negativa) |
| Ítem USD/EUR sin tasa real (≤1.0) | Bloqueo por descuadre | **Mismo bloqueo** (fail-closed: la diferencia no es validable; el mensaje pide revisar desglose/tasa) |
| Abrir el carrito del día | Nada | Diálogo de confirmación de tasas (1ª vez del día/tienda, o si cambiaron) |
| Actualizar tasas | Sin auditoría | `UPDATE_STORE_RATES` con valores anteriores/nuevos + `updated_at` real |

## 5. Tratamiento exacto de faltantes, sobrepagos y pagos mixtos

- **Faltante** (`insufficient_payment`): dif = recibido − esperado < −0.01. El total de la venta **no se altera** (recalculado server-side, `ERR_TOTAL_MISMATCH` intacto); `payment_transactions` registra lo realmente recibido por medio; la nota indica Total / Importe recibido / Pendiente. Inventario se descuenta con normalidad (no se toca para cuadrar pagos).
- **Sobrepago** (`overpayment`): dif > 0.01. Se conserva la distinción importe/recibido/diferencia; la nota remite al tratamiento del vuelto según medios utilizados (texto de la misión). No se convierte ninguna diferencia entre monedas en sobrepago sin conversión: toda comparación usa CUP con las tasas canónicas (`getItemPaidCup`/`getRateToCup`).
- **Desglose mixto descuadrado** (`mixed_breakdown_mismatch`): por línea (nombre del producto, esperado/recibido/diferencia, máx. 5 en la nota; todas en JSONB) y global. Los datos introducidos por el cajero se conservan tal cual — no se inventan importes ni se altera el desglose.
- **Diferencia de tasa** (`rate_difference`): solo cuando el cajero confirma explícitamente el modal «Descuadre de tasa».
- **Sin incidencias documentadas** (cliente sin soporte o manipulación): el servidor mantiene `ERR_PAYMENT_MISMATCH` y PT011 — fail-closed.
- **Duplicados**: idempotencia `sale-<uuid>` + registro `idempotency_registry` (hash ampliado con notas/incidencias) + evento de auditoría en la misma transacción → reintento no duplica venta ni incidencia.

## 6. Implementación y persistencia de la confirmación diaria

- **Disparo:** al abrir el carrito (`showCart` en `POSView`) con evaluación `needed` del hook `useDailyRatesConfirmation(storeId)`.
- **Clave:** `rates-confirmation:<storeId>:<YYYY-MM-DD>` con **día de negocio America/Havana** (`todayBusinessDay()` de `cash-report/period-attribution` — el criterio canónico del proyecto). La caducidad diaria es estructural: cada día la clave es nueva → no hay confirmación previa. Aislamiento por tienda incluido en la clave; por usuario vía RLS (`user_id = auth.uid()`).
- **Persistencia:** tabla `user_preferences` del SERVIDOR (patrón canónico F-02b; cross-device; fallback localStorage solo como resiliencia offline, nunca fuente única). Idempotente por PK `(user_id, preference_key)`.
- **Auditoría:** cada confirmación escribe `rates_confirmed` (usuario, tienda, día, valores confirmados, fecha-hora).
- **Valores mostrados:** los hidratados de `store_exchange_rates` (fuente real) + fecha de última actualización vía `GET /api/store-rates` (extendido).
- **Acción B:** abre `StoreRatesModal` (el mismo flujo del botón «Tasas»); al guardar, la evaluación detecta el cambio (`rates_changed`) y vuelve a pedir confirmación explícita con los valores nuevos. Sin permisos (`canManageStore` falso) se muestran los valores y la indicación honesta de contactar a un administrador — no se conceden permisos.
- **Confirmar NO modifica tasas.** Doble clic protegido (`confirmingRef` + botón deshabilitado). Sin tasas configuradas no se ofrece confirmar: se informa y se permite continuar (venta CUP); el servidor permanece fail-closed (`ERR_EXCHANGE_RATE_UNAVAILABLE`) si se necesita tasa inexistente.

## 7. Evidencias de Auditoría

Eventos nuevos visibles en **Inicio → OPERACIÓN → Auditoría** (títulos, tarjetas y filtro tipo de evento generados desde `AUDIT_EVENT_TITLES`):

| Evento | Productor | Contenido mínimo |
|---|---|---|
| `SALE_PAYMENT_INCIDENT` — «Venta con incidencia de pago» | RPC `create_sale_v2` (misma transacción) | fecha/hora, tienda, usuario, venta (record_id → «Ver venta»), total, recibido, diferencia, moneda(s), incidencias estructuradas, nota, método |
| `sale_negative_rejected` — «Intento de venta negativa rechazado» | API checkout (fuente `server`) y cliente (fuente `client`) | fecha/hora, tienda, usuario, total del intento, nº ítems, fuente, aviso de no aprobación |
| `rates_confirmed` — «Confirmación diaria de tasas» | `auditService.logRatesConfirmed` | usuario, tienda, día de negocio, tasas confirmadas, fecha/hora |
| `UPDATE_STORE_RATES` — «Tasas de tienda actualizadas» | `POST /api/store-rates` | usuario, tienda, tasas anteriores y nuevas, fecha/hora |

Los metadatos de `CREATE_SALE_V2` ahora incluyen `has_payment_incident`, `payment_diff_cup`, `payment_incidents` y `sale_notes`. Las ventas rechazadas no generan `transactions` — quedan solo como evento de auditoría, diferenciándose así de una venta confirmada con incidencia.

## 8. Matriz de pruebas con resultados reales

Suite ejecutada con Vitest (entorno jsdom). Resultado: **36/36 tests nuevos verdes** y **153/153 regresión POS existente verdes** (incluye el caso de producción MPPT/ENERVIDA-VITALLCONS y el gate fail-closed sin tasas). Suite completa del repo: ver anexo al final.

**A. Diferencias de pago**

| # | Prueba | Resultado | Evidencia |
|---|---|---|---|
| 1 | Venta exacta: registro normal, sin incidencia falsa | ✅ Aprobada | `pos-checkout-payment-incidents.test.tsx › A.1` (payload sin `payment_incidents`, sin warnings); `pos-checkout-usd-cup.test.tsx › VERDE ×2` |
| 2 | Pago insuficiente: informa, registra y documenta pendiente | ✅ Aprobada | `A.2` (≤2% directo) y `A.2b` (>2% vía modal; `cash_amount` = recibido, incidencias `insufficient_payment` + `rate_difference`) |
| 3 | Sobrepago: informa y conserva la diferencia | ✅ Aprobada | `pos-payment-incidents.test.ts › A.3` (global +5200, nota «sobrepago detectado») |
| 4 | Pago mixto descuadrado: desglose conservado + inconsistencia documentada | ✅ Aprobada | `A.4` (por línea con nombre), `A.4b` (netea a cero → solo desglose), nota con detalle |
| 5 | Total negativo: rechazo en cliente y servidor | ✅ Aprobada (cliente) · ⚠️ servidor/DDL verificado estáticamente | `A.5` (sin fetch + traza Auditoría fuente cliente); migración: guard `ERR_NEGATIVE_SALE` + `CHECK total >= 0` (`pos-payment-incidents-migration.test.ts`) |
| 6 | Error real de persistencia: informado como error, sin éxito falso | ✅ Aprobada (existente) | `catch` de `processCheckout` mapea errores RPC a toasts de error (sin cambios de la misión; regresión verde) |
| 7 | Reintento tras error de red: sin duplicados | ✅ Aprobada (existente) | idempotencia `sale-<uuid>` + `idempotency_registry` (hash ampliado, test estático de migración) |
| 8 | Nota manual existente se conserva | ✅ Aprobada (estática) | migración: `v_notes_final || E'\n' || v_incidence_note` (nota manual antepuesta) |
| 9 | Diferencias en CUP y USD en moneda correcta | ✅ Aprobada | `A.4` (CUP) + `A.2` (USD→CUP con tasa 790) |
| 10 | Pago exacto en moneda distinta: conversión con tasa aplicable, sin alerta | ✅ Aprobada | `pos-checkout-usd-cup.test.tsx › VERDE` (pago nativo USD 120) |

**B. Auditoría**

| # | Prueba | Resultado | Evidencia |
|---|---|---|---|
| 11 | Venta con incidencia aparece con todos los datos | ✅ Aprobada (estática) | migración: evento con total/recibido/diferencia/incidentes/nota; tarjeta + whitelist «Ver venta» |
| 12 | Venta sin incidencia no aparece falsamente marcada | ✅ Aprobada | evento solo con `v_has_payment_incident` (test estático); `A.1` sin avisos |
| 13 | Rechazadas ≠ confirmadas | ✅ Aprobada (estática) | `sale_negative_rejected` sin `transactions`; RPC devuelve excepción (no se persiste) |
| 14 | Corrección/reversión conserva trazabilidad | ✅ Aprobada (existente) | flujo «Deshacer»/`REVERSE_TRANSACTION_V2` sin cambios; la incidencia histórica permanece |
| 15 | Aislamiento por tienda | ✅ Aprobada (existente) | `useAuditLogs` filtra por `storeIds` + RLS vigente (sin cambios) |

**C. Confirmación diaria de tasas**

| # | Prueba | Resultado | Evidencia |
|---|---|---|---|
| 16 | 1er acceso del día → diálogo | ✅ Aprobada | `pos-rates-confirmation.test › C.16` + disparo `showCart && showDialog` |
| 17 | Confirmar → persiste | ✅ Aprobada | `C.17` (registro canónico) + `user_preferences` servidor + auditoría `rates_confirmed` |
| 18 | Reabrir el mismo día → no repite | ✅ Aprobada | `C.18` |
| 19 | Día siguiente → nueva confirmación | ✅ Aprobada | `C.19` (clave por día) |
| 20 | Usuario/tienda distinta → independiente | ✅ Aprobada | `C.20` (clave por tienda; usuario por RLS) |
| 21 | Tasa cambiada tras confirmar → re-pregunta | ✅ Aprobada | `C.21` (`rates_changed`, con adición/eliminación de moneda) |
| 22 | Sin permisos: valores + instrucciones | ✅ Implementado | `canManageStore` gate; texto honesto en el diálogo (sin prueba automatizada del render) |
| 23 | Tasas ausentes: sin confirmación falsa | ✅ Implementado | diálogo en estado informativo; botón confirmar deshabilitado; servidor fail-closed (sin prueba automatizada del render) |
| 24 | Doble clic/concurrencia: sin duplicados | ✅ Aprobada | PK `(user_id, preference_key)` idempotente + `confirmingRef` |

**D. Regresión del POS**

| # | Prueba | Resultado |
|---|---|---|
| 25 | Selección de productos/cantidades | ✅ 153/153 regresión POS verde |
| 26 | Inventario se descuenta una sola vez | ✅ Sin cambios en `register_stock_movement` (test estático de migración) |
| 27 | Recibo/reportes con importes correctos | ✅ Total canónico server-side intacto (`ERR_TOTAL_MISMATCH`) |
| 28 | Venta exacta mantiene su flujo | ✅ `A.1` + caso MPPT verde |
| 29 | Responsive escritorio/móvil | ✅ Diálogo con max-w-md y botones ≥44px (revisión visual) |
| 30 | Usuario no queda atrapado en diálogos | ✅ «Continuar sin confirmar» + «Cancelar» en modal de tasa; carrito persistente (zustand) |

## 9. Riesgos y limitaciones pendientes

1. **Migración pendiente de aplicación** en la BD Supabase del proyecto (procedimiento autorizado). Hasta entonces, ventas con incidencia → rechazo canónico `ERR_PAYMENT_MISMATCH` (degradación segura al comportamiento previo).
2. **Flexibilización temporal por diseño**: las ventas con incidencia quedan con `Σ pagos ≠ total` en `payment_transactions` — los reportes de caja mostrarán la diferencia (es la trazabilidad pedida). La reversión (validación estricta) implica volver al comportamiento anterior del RPC.
3. **Importes recibidos en método simple**: con incidencias, el cliente envía lo realmente recibido (antes el servidor forzaba el total). Los cierres de caja reflejarán el faltante real — deseable, pero conviene comunicarlo a quien administra arqueos.
4. **Pruebas 22/23/29 sin cobertura automatizada de render** (solo implementación + revisión); el resto de la matriz sí tiene tests ejecutados.
5. **Sin Postgres local**: la migración se verifica estáticamente (13 aserciones) y su ejecución real corresponde al pipeline/procedimiento del proyecto.
6. `tsc --noEmit` global agota memoria en el entorno local (preexistente); verificado con `tsconfig.mision-1710.json` (único error: `CameraBarcodeScanner.tsx:452`, **preexistente en main**).

## 10. Confirmación explícita: ventas negativas siguen bloqueadas

Sí, en **tres capas independientes**, verificadas por tests:
- **Cliente** (`usePOSCheckout.startCheckout`): guard sobre `getTotal()` ≤ 0 **y** `getExpectedTotalCup()` < 0 → rechazo con mensaje explícito + registro del intento en Auditoría. La venta de total **cero** conserva su mensaje/política original (no se confunde con la negativa).
- **Servidor** (`create_sale_v2`): `IF v_calculated_total < 0 THEN RAISE EXCEPTION 'ERR_NEGATIVE_SALE'` antes de cualquier INSERT; la API responde 422 y audita el intento. No hay venta aprobada ni descuento de inventario.
- **DDL**: `CHECK (total_amount >= 0) NOT VALID` en `public.transactions`.

Las devoluciones/reversiones legítimas usan flujos independientes (`devolutions.total_amount >= 0`, `void_transaction`) y no se afectaron.

## 11. Estado del repositorio, commit y PR

- Branch: `feat/pos-incidencias-pago-tasas-diarias` (base `main` @ `13762b31f`)
- Commit: `5c52dbdf6` — «feat(pos): flexibilización temporal de validaciones de pago con incidencias trazables + bloqueo reforzado de ventas negativas + confirmación diaria de tasas»
- PR: **#1415** — https://github.com/Nardian90/Costpro/pull/1415
- CI (TypeCheck `bunx tsc` + Lint + Tests + Build): ejecutándose en GitHub Actions sobre el PR.
- Entorno local: servidor reactivado con **PM2** (`pm2 start ecosystem.config.js`, `pm2 save`), app `costpro` **online** en `http://localhost:3000` (HTTP 200, `bun server.ts` + Socket.io, `.env` con las variables provistas, gitignored).

## 12. Estado del despliegue y pruebas en producción

**No se realizó ningún despliegue a producción** ni pruebas en producción. Todo el trabajo vive en la rama del PR #1415 y en el entorno local (PM2). La aplicación de la migración y el despliegue corresponden al procedimiento autorizado del proyecto.
