# INFORME FINAL — MISIÓN POLÍTICA TEMPORAL COSTPRO (2026-10-18)

**Proyecto:** COSTPRO 4 Multitienda (`Nardian90/Costpro`)
**Rama:** `feat/politica-temporal-documentos-1810`
**Estado:** **CORREGIDA Y VERIFICADA** a nivel de aplicación (UI + rutas API + pruebas en BD real); el refuerzo del gate canónico de BD viaja en la migración del PR, pendiente de aplicar por el propietario con el procedimiento autorizado (ver §10).
**Documentos companion:** `docs/audits/POLITICA_TEMPORAL_COSTPRO_2026-10-18.md` (matriz de flujos completa + especificación formal, entregados ANTES del código, §10 de la misión).

---

## 1. Matriz de vistas y operaciones auditadas

Matriz completa con 30 flujos (21 creadores + reversiones + infraestructura temporal): ver `docs/audits/POLITICA_TEMPORAL_COSTPRO_2026-10-18.md` §1. Resumen por estado:

| Estado | Flujos |
|---|---|
| Ya correctos (PR #1419) | Venta POS (carrito/express), vale desde carrito |
| Corregidos en esta misión (UI+server) | **Recepciones**, **Vales de Salida dedicado**, **Servicios Recibidos**, venta por catálogo, ajuste individual, transferencia (crear/confirmar), devoluciones, pagos de OT, sync offline |
| Correctos por diseño (documentados, sin cambio) | Caja (ventana temporal), reversos/anulaciones (NOW()), recepción express, ajuste por conteo (NOW()), OCs/cotizaciones (fechas informativas), cierre fiscal |
| Defecto colateral descubierto y corregido | Servicios Recibidos: fetches sin Bearer → 401 sistemático (SEC-024) |

## 2. Política temporal formalizada (resumen ejecutivo)

1. **Semántica:** documento/operativa = columnas `v_eff` existentes; financiera = `payment_transactions.payment_date`; técnica = `audit_logs`/`created_at` de servicios/`confirmed_at`. **Cero columnas nuevas.**
2. **Predeterminado:** HOY como día de negocio `America/Havana`; hoy → el servidor estampa `NOW()` (convención canónica); ≠ hoy → mediodía local (convención unificada — la anterior `T23:59:59` de recepciones corrompía el día para navegadores al oeste de Habana).
3. **Máximo = HOY** (Habana) en 3 capas: UI (`max` del selector), rutas (422 con `checkNotFutureOperationDate`), BD (migración: `validate_operation_date` hoy+1 → HOY).
4. **Mínimo = MAX operativo per-store** (`get_global_max_operation_date`), comparado **por día de negocio e inclusivo** (dos operaciones del mismo día siempre permitidas — corregido el bloqueo por hora intradía). Piso absoluto: hoy−6 meses.
5. **Excepciones (backdating):** rango [hoy−6m, hoy] con trazabilidad (audit real + idempotencia que impide mutar fechas ya registradas). Fuera de rango: bloqueado. Sin edición irrestricta de fechas contabilizadas.
6. **Caja:** turnos por ventana temporal real (apertura `created_at`, cierre `closed_at=NOW()` del RPC); el `closed_at` calculado en cliente era código muerto y se eliminó del payload.
7. **Reversos:** NOW() (trazabilidad de la corrección).

## 3. Causa raíz de cada defecto

| # | Defecto | Causa raíz |
|---|---|---|
| 1 | Recepciones fechadas «mañana» tras 20:00 Habana (envenenan el MAX de la tienda y bloquean el flujo entero) | Default/tope con slice UTC del navegador (`new Date().toISOString().slice(0,10)`) + gate BD laxo hoy+1 |
| 2 | Servicios recibidos creados con fecha futura silenciosa tras 20:00 Habana | Default `CURRENT_DATE` del Postgres (UTC) en el RPC, sin fecha visible ni editable en la UI |
| 3 | Cualquier fecha (futura/pasada/inválida) llegaba al Kardex al confirmar transferencias | `/api/transfers/[id]/confirm` propagaba `operation_date` del cliente sin ninguna validación y `confirm_transfer` no tiene gate |
| 4 | Vales de Salida dedicado sin fecha operativa | El payload soportaba `operation_date` pero la UI nunca lo exponía («Se registrará con la fecha actual») |
| 5 | Bloqueo de operaciones legítimas del mismo día | `validateOperationDate` cliente comparaba el mínimo por TIMESTAMP completo (recepción 23:59 > venta 12:00 del mismo día) |
| 6 | Fechas futuras seleccionables en catálogo/ajustes/transferencias | `OperationDatePicker` sin `max` (solo Vender lo pasaba) |
| 7 | Pagos con `payment_date` arbitraria | `register_supplier_payment` sin gate y rutas sin re-check |
| 8 | Venta offline con fecha futura | `/api/sync/batch` delegaba 100% al RPC sin el tope estricto de la misión |
| 9 | **Servicios Recibidos 401 en toda la gestión UI** | `getServerSession` fail-closed por Bearer (SEC-024) vs fetches crudos del módulo sin Authorization |

## 4. Archivos, funciones y migraciones modificados

**Modificados (16):** `useGlobalOperationDate.ts` (validador día-negocio), `useReceptionState.ts`, `ValeSalidaCreateModal.tsx`, `ReceivedServicesView.tsx` (+fix Bearer), `SalesCatalogCheckoutModal.tsx`, `InventoryAdjustmentModal.tsx`, `CreateTransferModal.tsx`, `TransferDetailsModal.tsx`, `CashClosureView.tsx` (−closed_at muerto), rutas `inventory/receptions`, `received-services`, `transfers/[id]/confirm`, `devolutions`, `production-orders/[id]/payments`, `sync/batch`, y el test existente del validador (semántica día).

**Nuevos (7):** `POLITICA_TEMPORAL_COSTPRO_2026-10-18.md`, migración **`20261018000000_politica_temporal_coherente.sql`** (tope HOY + gates en `create_transfer`/`confirm_transfer`/`register_supplier_payment`; cuerpos base = `pg_get_functiondef` de la BD viva → diff real = solo el gate; sin DDL/RLS/triggers), `e2e/politica-temporal-documentos.spec.ts`, 3 suites de tests (`useGlobalOperationDate-validate` ampliada, `politica-temporal-migration.test.ts`, `ValeSalidaCreateModal-fecha.test.tsx`), `tsconfig.mision-1810.json`, evidencia `audit-evidence/20261018-politica-temporal-documentos/`.

**RPCs/tablas/triggers/RLS en BD remota: SIN CAMBIOS** (verificado byte a byte §8).

## 5. Pruebas ejecutadas (todas reales, evidencia guardada)

| Nivel | Resultado |
|---|---|
| Unitarias nuevas (3 suites) | **29/29 PASS** |
| Suite completa de regresión (vitest) | **3170 PASS / 0 fallos** (185 archivos) |
| Integración BD real (aplicar→probar→restaurar, `scripts/mision_politica_temporal_db_v2.py`, evidencia JSON) | **10/10 PASS**: B0.1 el gate original aceptaba mañana · B0.2 `create_transfer` persistía futuro (defecto probado) · M1 hoy pasa · M2 mañana rechazado (nuevo) · M3 piso 6m intacto · M4/M6/M7 futuro rechazado en los 3 RPCs sin gate · M5 transfer retro OK · M8 pago retro OK persistiendo `payment_date` ayer 12:00 HV · M9 fecha persistida correcta |
| E2E navegador (Playwright, proyecto core, entorno aislado E2E_ISOLATION=1, tz Habana) | **8/8 PASS**: A1-A7 (422 de fecha futura en servicios/recepciones/vales/confirm-transfer/devoluciones/pagos-OT; A2 servicio sin fecha → HOY Habana) + B1-B5 recorrido UI con 10 capturas |

**Honestidad de la matriz:** no se ejecutó la suite E2E completa del repo (~150 specs) ni la simulación de carrera real de dos usuarios simultáneos (cubierto por diseño: advisory locks + revalidación en transacción + refetch 30 s). El E2E de Vender documenta la vista; la sección «Fecha de venta» en sí tiene sus 35 tests de PR #1419 aún verdes.

## 6. Capturas reales de las cinco vistas prioritarias

`audit-evidence/20261018-politica-temporal-documentos/`: `b1-vender-pos.png` · `b2-recepciones-historial.png` + `b2-recepciones-selector-fecha.png` (input con default/max HOY verificados por aserción) · `b3-vales-salida-vista.png` + `b3-vales-fecha-operativa.png` (selector nuevo, default/max HOY) + `b3-vales-rechazo-futura.png` (error inline «no puede ser futura») · `b4-servicios-vista.png` + `b4-servicios-creado-retro.png` + `b4-servicios-persistencia-recarga.png` (servicio creado con fecha de AYER desde la UI y verificado tras recarga) · `b5-caja-ventana-temporal.png`.

## 7. Persistencia y coherencia documento↔inventario↔caja↔reportes

- Recepciones → `register_reception` estampa `reception_date=created_at=v_eff` y `stock_movements.movement_date=v_eff` (gate preexistente; ahora también tope HOY en ruta+UI).
- Vales dedicado → mismo endpoint/RPC que Vender: `issue_slips.created_at=v_eff` + Kardex `movement_date=v_eff` (persistencia probada en BD por PR #1419 y revalidada aquí por la ruta 422 + integración).
- Servicios → `service_date` (DATE) persistida con el día elegido: **E2E B4 creó con AYER y tras recarga la fila muestra 2026-10-16 y el número SRV-20261016-NNNN incrusta el mismo día**.
- Reportes: IPV/Kardex leen `movement_date`/`created_at` que ya llevan `v_eff` (sin cambios necesarios, verificado en auditoría).
- Caja: arqueo por ventana `apertura < X ≤ NOW()` — coherente por diseño.

## 8. No se alteraron históricos ni otras tiendas (verificación real)

1. **Cero UPDATE/DELETE** de datos en la misión; cero DDL aplicado a la BD remota (la migración vive solo en el PR).
2. Integración en BD: estrategia aplicar→probar→**restaurar** con backup `pg_get_functiondef`; verificación **byte a byte** post-restauración: las 4 funciones == estado pre-misión.
3. Residuos: 0 transferencias/pagos/receipts/servicios de prueba (queries de conteo en §FASE F del log de la misión).
4. E2E en tiendas piloto dedicadas (hard-delete del teardown, net zero); el tipo de servicio global de prueba quedó **desactivado** (0 contaminación del catálogo).
5. **0 tiendas con MAX operativo futuro** (ningún envenenamiento residual).
6. Pruebas existentes de contabilidad/inventario/permisos/idempotencia: 3170 PASS.

## 9. Rama y commit

- Rama: `feat/politica-temporal-documentos-1810` (desde `main` `10af2706c`).
- Commit + PR: ver cabecera (se completa al crear el PR). **Sin fusiones ni despliegues** (§12 de la misión anterior ratificado: la activación del gate BD reforzado ocurre al aplicar la migración por el procedimiento autorizado).

## 10. Pendientes y limitaciones explícitas

1. **Migración `20261018000000` NO aplicada a la BD remota** (gate HOY estricto + gates de transferencias/pagos a nivel RPC). Las rutas ya hacen cumplir el tope HOY para todo el tráfico de la app; el refuerzo RPC cubre llamadas directas (p. ej. transferencias desde el navegador) tras aplicar.
2. `v_global_operation_dates` no lista `devolutions`/`issue_slips`/`received_services` (sus efectos de stock sí alimentan el MAX); actualización de la vista = mejora futura opcional.
3. `kardex_entries.created_at` (cierre fiscal) siempre reloj de pared — divergencia preexistente documentada, tabla no consumida por UI/IPV.
4. `close_service_order_as_sale` y cierres de OT siguen estampando NOW() (camino secundario documentado).
5. UI de devoluciones sin selector de fecha (el RPC/ruta ya soportan `operation_date` para la vía API/importaciones).
6. Suite E2E completa del repo y carrera real de 2 usuarios: no ejecutadas (cubierto por diseño transaccional).
