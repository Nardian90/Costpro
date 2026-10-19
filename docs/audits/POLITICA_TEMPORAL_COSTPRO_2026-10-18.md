# POLÍTICA TEMPORAL DE COSTPRO — AUDITORÍA, ESPECIFICACIÓN E IMPLEMENTACIÓN DE EXTREMO A EXTREMO

**Proyecto:** COSTPRO 4 Multitienda (`Nardian90/Costpro`)
**Fecha:** 2026-10-18
**Alcance:** Todos los documentos que generan movimientos de inventario, logística, servicios, ventas o caja
**Vistas prioritarias:** Vender · Recepciones · Vales de Salida (Almacén) · Servicios Recibidos · Caja
**Documento:** FASES A–C (auditoría + especificación). Los resultados de D–F se reportan en el informe final de la misión.

---

## 1. FASE A + B — MATRIZ DE FLUJOS AUDITADOS

Leyenda de columnas: **FDoc** = fecha del documento · **FEf** = fecha efectiva/operativa · **FCt** = fecha contable/financiera · **FTec** = fecha técnica de creación/confirmación.
En CostPro no existe una columna separada de "fecha contable" por documento: la fecha financiera de los pagos vive en `payment_transactions.payment_date`, y la contabilidad por período se rige por el Cierre Fiscal (`fiscal_closings`, lock por año/mes). "—" = ausente por diseño.

### 1.1 Flujos que CREAN documentos operativos

| # | Tipo de documento | Vista de origen | Tabla y función de escritura | FDoc | FEf | FCt | FTec | Regla actual (verificada en código) | Riesgo probado | Cambio propuesto |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Venta POS (carrito/express) | OPERACIÓN → Ventas → Vender | `transactions` / `create_sale_v2` vía `/api/pos/checkout` | `created_at` | `created_at=completed_at=v_eff` (p_operation_date) | `payment_transactions.payment_date=v_eff` | `audit_logs.created_at`=NOW() | ✅ 3 capas: UI max=hoy Habana, ruta 422, RPC gate. Convención hoy→NOW() | — (PR #1419) | Ninguno |
| 2 | Vale de salida (desde carrito) | Vender → modo Vale | `issue_slips` / `create_vale_salida` vía `/api/vale-salida` | `created_at` | `created_at=v_eff` | — | `audit_logs`=NOW() | ✅ Igual que #1 | — | Ninguno |
| 3 | Vale de salida DEDICADO | OPERACIÓN → Almacén → Vales de Salida | `issue_slips` / `create_vale_salida` vía `/api/vale-salida` | `created_at` | payload soporta `operation_date` pero la UI **no lo expone** («Se registrará con la fecha actual») | — | NOW() | UI sin selector; ruta+RPC ya validan | Imposible retro-fechar desde la vista dedicada (asimetría con Vender) | Añadir selector `OperationDatePicker` con max=hoy + enviar `operation_date` |
| 4 | Recepción de mercancía | OPERACIÓN → Logística → Recepciones | `receipts` / `register_reception` vía `/api/inventory/receptions` | `reception_date` | `reception_date=created_at=v_eff` | `receipt_items.created_at=v_eff`; `paid_at` (trigger, NOW()) | `updated_at` | Input date nativo con min per-store y max=`todayStr` **UTC**; default `todayStr` UTC; convención ≠hoy→`T23:59:59` local; ruta sin re-check; RPC gate (hoy+1 laxo); errores→500 | **Entre 20:00–24:00 Habana el default salta a mañana** → recepción futura aceptada por gate hoy+1 → **envenena el MAX per-store** y bloquea operaciones del mismo día en todos los flujos; `T23:59:59` local corrompe el día de negocio para navegadores al oeste de Habana | Default/max en día de negocio Habana; convención mediodía; validación max en cliente y ruta (422); mapeo de errores de gate a 422 accionable |
| 5 | Recepción express | Recepciones → Express | ídem #4 | `reception_date` | `p_reception_date=NOW()` siempre | — | NOW() | Sin selector (por diseño express) | Ninguno (hoy implícito = conducta canónica) | Ninguno (documentado) |
| 6 | Servicio recibido | OPERACIÓN → Almacén → Servicios Recibidos | `received_services` / `create_received_service_v2` vía `/api/received-services` | `service_date` (DATE) | `service_date=COALESCE(p_service_date, CURRENT_DATE)` | `due_date=service_date+términos`; pagos `payment_date` | `created_at`=NOW() | RPC valida gate (hoy+1 laxo); ruta sin re-check ni default Habana; UI sin selector | **Default `CURRENT_DATE` del servidor Postgres (UTC): tras 20:00 Habana el servicio se crea fechado MAÑANA** (futuro) sin que el usuario lo sepa; fecha no editable | Selector de fecha (max=hoy); default explícito día Habana en ruta; re-check ruta (422); mapeo de errores |
| 7 | Ajuste de inventario individual | Almacén → Inventario → Ajustar | `stock_movements` / `perform_inventory_adjustment` (browser→RPC directo) | — | `movement_date=created_at=v_eff` | — | `products.updated_at=v_eff` | UI `OperationDatePicker` con min per-store **sin max**; RPC gate (valida en forma 1-arg, hoy equivalente porque el gate ignora store) | Fecha futura seleccionable en UI (solo el gate hoy+1 la frena parcialmente) | Añadir max=hoy al picker y a la validación |
| 8 | Ajuste documental (por conteo) | Inventario → Venta por Conteo / Ajustes | `inventory_adjustments` / `process_inventory_adjustment` vía `/api/inventory/adjustments` | `created_at` | v_eff; la **ruta no envía p_operation_date** (gate muerto) | — | `confirmed_at` | Ruta sin fecha de cliente → NOW() | Ninguno operativo (siempre NOW()) | Documentado; sin cambio |
| 9 | Transferencia — crear | OPERACIÓN → Logística → Transferencia de Stock | `transfers` / `create_transfer` (browser→RPC directo vía transfer-service) | `created_at` | `created_at=v_effective_date` | — | `confirmed_at` | UI picker min per-store **sin max**; **RPC SIN gate** | Fecha futura seleccionable y persistible sin ninguna validación de servidor (el browser llama al RPC directo) | max=hoy en UI + gate en RPC (migración) + tope en la vía API |
| 10 | Transferencia — confirmar recepción | ídem (modal de detalle) | `stock_movements` (transfer_in/out) / `confirm_transfer` vía `/api/transfers/[id]/confirm` | — | `movement_date=p_operation_date` **sin validar**; `confirmed_at=NOW()` | — | NOW() | UI picker «Fecha de recepción» min sin max; **ruta acepta `operation_date` arbitraria del cliente y la propaga al Kardex sin ninguna validación** (ni parse) | **Hueco prioritario: cualquier fecha (pasada/futura/inválida) llega al Kardex e inventario** | Validar parse + no-futura en ruta (422) + max en UI + gate en RPC (migración) |
| 11 | Devolución / nota de crédito | OPERACIÓN → Ventas → Opciones → Devoluciones | `devolutions` / `create_devolution_v2` vía `/api/devolutions` | `created_at` | `created_at=v_eff` (p_operation_date opc.) | `payment_transactions.payment_date=v_eff`; `cash_movements` egreso NOW() | `processed_at` | Ruta acepta `operation_date` (schema Zod) **sin re-check futuro**; RPC gate sí | Fecha futura (hoy+1) aceptable vía API | Re-check ruta (422) + mapeo de errores |
| 12 | Pago a proveedor (CxP) | Ventas → Opciones → Cuentas por Pagar | `payment_transactions` / `register_supplier_payment` vía `/api/payments` y `/api/accounts-payable/bulk-pay` | — | `payment_date=NOW()` (ruta no envía fecha) | `payment_date` | `created_at`=NOW() | Sin fecha de cliente → NOW() | Ninguno | Ninguno (documentado) |
| 13 | Pago histórico de OT | Costo → OT → pagos | `payment_transactions` / `register_supplier_payment` vía `/api/production-orders/[id]/payments` | — | `payment_date=p_payment_date` del cliente **sin gate** | `payment_date` | NOW() | Ruta acepta `payment_date` «fechas históricas» (V2.12.32) sin validación | Cualquier fecha (futura incluida) persiste en la fecha financiera del pago | Re-check no-futura en ruta (422); gate en RPC (migración) |
| 14 | Apertura de turno de caja | OPERACIÓN → Ventas → Opciones → Caja | `cash_closures` (INSERT directo vía cash-service) | — | — | `created_at`=apertura (NOW() BD) | NOW() | Por diseño de ventana temporal | Ninguno | Ninguno (política documentada §2.6) |
| 15 | Cierre de turno (arqueo) | ídem | `cash_closures` / `close_cash_shift` vía `/api/cash-closures/close` | — | ventana `created_at(apertura) < X ≤ NOW()` | `closed_at=NOW()` (RPC); el `closed_at` del cliente es código muerto (el hook solo envía declarados) | NOW() | Arqueo server-side por ventana | Ninguno (verificado: el campo cliente NO se persiste) | Ninguno (política documentada §2.6) |
| 16 | Reporte de Entrega (ajuste extraordinario) | Ventas → Opciones → Reporte Entrega | `payment_transactions` vía `/api/cash-report/adjustments` | — | `payment_date=startDate del período` (backdating explícito del flujo de ajuste) | `payment_date` | NOW() | Ajuste del período imputado al día inicial del período (regla de negocio del reporte, documentada en FIX-RE-1510) | Intencional; sin tope futuro implícito (el rango ya está acotado) | Documentado; sin cambio |
| 17 | Venta por catálogo | Vender → catálogo | `transactions` / `create_sale_v2` vía `/api/pos/checkout` | `created_at` | v_eff (siempre mediodía) | ídem #1 | NOW() | Picker min per-store **sin max**; ruta completa | Fecha futura seleccionable en UI (la ruta la rechaza con 422 — UX deficiente, no integridad) | max=hoy en picker |
| 18 | Sync offline (venta) | — (cola offline) | `create_sale_v2` vía `/api/sync/batch` | ídem #1 | `p_operation_date` del payload encolado **sin re-check en ruta** | ídem | NOW() | Delegación total al RPC (gate hoy+1 laxo) | Venta offline futura aceptada (hoy+1) | Re-check por operación en ruta |
| 19 | OT creación/cierre/retiro/anulación | Costo → Órdenes de Producción y Trabajo | `production_orders` / `create_production_order_v2`, `close_*`, `withdraw_*` | `order_date`=CURRENT_DATE | cierres NOW()/CURRENT_DATE | pagos ídem #13 | NOW() | Sin parámetros de fecha operativa | Sin selector ni gate (fecha del documento = día de creación) | Documentado; el pago (#13) sí se corrige |
| 20 | Orden de compra | Logística → Órdenes de Compra | `purchase_orders` / `create_purchase_order` | `expected_date` (planificación, DATE) | — | — | `created_at`=NOW() | Fecha esperada informativa sin gate | Ninguno (no genera movimiento) | Ninguno (documentado) |
| 21 | Cotización | Ventas → Opciones → Cotizaciones | `quotations` / `create_quotation` | `valid_until` (vigencia) | — | — | NOW() | Informativa | Ninguno | Ninguno (documentado) |

### 1.2 Flujos que REVIERTEN o ANULAN (trazabilidad)

| # | Operación | RPC | Fecha estampada | Regla actual | Decisión de política |
|---|---|---|---|---|---|
| 22 | Reversos genéricos (`/api/reverse`) | `reverse_transaction_v2`, `reverse_receipt_v2`, `reverse_transfer`, `reverse_inventory_adjustment_v2`, `reverse_devolution`, `reverse_production_order` | `reversed_at`=NOW(); stock inverso con NOW() | Sin gate | **NOW() por diseño**: el reverso documenta cuándo se ejecutó realmente la corrección; retro-fecharlo falsearía la auditoría. Excepciones puntuales ya controladas: `void_transaction`/`void_reception_with_reversal`/`void_pending_reception`/`void_received_service_with_reversal` aceptan `p_operation_date` y **sí** pasan por gate (o deben pasar) — se alinean a la política general |
| 23 | Anulación de vale | `reverse_vale_salida` | `voided_at`=NOW() | Sin gate | ídem #22 |
| 24 | Cierre fiscal | `close_fiscal_period`/`lock_fiscal_period` | `closed_at/locked_at`=NOW(); período por año/mes | Lock admin | Intocable por política de períodos (§2.7) |

### 1.3 Infraestructura temporal compartida (verificada)

| Pieza | Definición vigente | Estado |
|---|---|---|
| `validate_operation_date(p_new_date, p_store_id)` | migración `20260817000003`: NULL→pasa; mínimo=hoy(Habana)−6 meses; **máximo=hoy+1**; comparación date-only Habana; `ERR_BACKDATED_DOCUMENT`/`ERR_FUTURE_DATED_DOCUMENT` | Tope laxo: es la única vía por la que entra «mañana» al sistema |
| `v_global_operation_dates` + `get_global_max_operation_date(p_store_id)` | migraciones `20260630190000`/`20260623000001`: MAX por tienda de ventas, transferencias, ajustes, OCs, recepciones, cierres, movimientos de caja, sesiones y stock_movements | No lista `devolutions`/`issue_slips`/`received_services`, pero sus efectos de stock (`stock_movements.created_at=v_eff`) sí alimentan el MAX → cobertura práctica |
| `OperationDatePicker` + `useGlobalOperationDate` | `src/components/ui/OperationDatePicker.tsx`: min per-store automático; `max` opcional (solo Vender lo pasa) | Adoptar max en los 6 consumidores |
| `validateOperationDate()` (cliente) | `src/hooks/api/useGlobalOperationDate.ts`: **compara el mínimo a nivel de TIMESTAMP completo** | Bloquea operaciones legítimas del mismo día (p. ej. recepción 23:59 → venta 12:00) → corregir a granularidad de día de negocio |
| `checkNotFutureOperationDate()` | `src/lib/pos/operation-date.ts`: tope hoy Habana, usado por 2 rutas | Adoptar en las 5 rutas restantes que aceptan fecha de cliente |

---

## 2. FASE C — POLÍTICA TEMPORAL FORMAL DE COSTPRO

### 2.1 Semántica de fechas por documento

| Documento | Fecha del documento (= operativa) | Fecha contable/financiera | Fecha técnica |
|---|---|---|---|
| Venta | `transactions.created_at` = `completed_at` | `payment_transactions.payment_date` | `audit_logs.created_at` (real) |
| Vale de salida | `issue_slips.created_at` | — | `audit_logs.created_at` |
| Recepción | `receipts.reception_date` | `receipt_items` WAC + `paid_at` (real) | `receipts.created_at` (mismo v_eff) |
| Servicio recibido | `received_services.service_date` | `due_date` + pagos | `received_services.created_at` (real) |
| Ajuste/transferencia | `inventory_adjustments.created_at` / `transfers.created_at` | — | `confirmed_at` (real) |
| Turno de caja | apertura `created_at` (real) | ventana de arqueo → `closed_at` (real) | NOW() |

**Regla de no-duplicación de semántica:** no se añade ninguna columna nueva. Los campos existentes distinguen correctamente documento/operativa (v_eff) vs. técnica (audit_logs, created_at de servicios, confirmed_at de reversos) porque los RPCs ya estampan `v_eff` en las columnas de fecha operativa y NOW() en las técnicas. La excepción documentada es `kardex_entries.created_at` (trigger de cierre fiscal, siempre reloj de pared — tabla no consumida por la UI del Kardex ni por IPV).

### 2.2 C1 — Fecha predeterminada

- Todo documento nuevo inicia en **HOY como día de negocio en America/Havana** (`todayBusinessDay()`), no en la fecha UTC del navegador/servidor.
- **Convención de envío canónica (se unifica):** fecha seleccionada == hoy → el cliente NO envía fecha y el servidor estampa `NOW()` exacto (conserva timestamps reales del día: orden del ledger, ventana de arqueo, idempotencia). Fecha ≠ hoy → se envía al **mediodía local** (`T12:00:00`), la convención más robusta del proyecto frente a desfases de zona horaria del navegador.
- Los documentos históricos y las operaciones en curso no cambian de fecha predeterminada (cero migración de datos).

### 2.3 C2 — Fecha máxima

- **Máximo = HOY (día de negocio, America/Havana).** Ningún documento operativo nuevo puede llevar fecha futura.
- Aplicación en 3 capas:
  1. **UI:** `max` en el selector (atributo del input + validación inline).
  2. **Ruta API:** `checkNotFutureOperationDate()` → HTTP 422 con mensaje accionable, para TODAS las rutas que aceptan fecha del cliente (`/api/pos/checkout`, `/api/vale-salida`, `/api/inventory/receptions`, `/api/received-services`, `/api/devolutions`, `/api/transfers/[id]/confirm`, `/api/production-orders/[id]/payments`, `/api/sync/batch` por operación de venta).
  3. **BD (gate canónico):** `validate_operation_date` se ajusta de «hoy+1» a **«hoy»** — cierre la única puerta por la que entraban documentos futuros, incluidas las llamadas RPC directas del navegador (transferencias). Migra en `20261018000000_politica_temporal_coherente.sql` (incluida en el PR; su aplicación a producción sigue el procedimiento autorizado del proyecto).
- Motivo del cambio del gate: la misión exige que el tope se haga cumplir en el servidor para todos los flujos; con «hoy+1», una recepción/vale/transferencia futura envenena `get_global_max_operation_date` y bloquea operaciones legítimas del mismo día en toda la tienda.

### 2.4 C3 — Fecha mínima

- **Regla general (documentos operativos): mínimo = fecha operativa máxima vigente de la TIENDA activa** (`get_global_max_operation_date(p_store_id)`), comparada **por día de negocio (inclusiva)**: se permiten dos o más operaciones del mismo día, sea cual sea su hora intradía. Corrección de la comparación a nivel de timestamp del hook cliente.
- **Piso absoluto del sistema:** hoy − 6 meses (`validate_operation_date`) — el límite histórico real, heredado y no modificado.
- Sin documentos previos en la tienda → sin mínimo de secuencia (solo el piso de 6 meses).
- **Períodos contables:** el Cierre Fiscal bloquea su período con lock admin; los documentos no reabren períodos cerrados (el gate de 6 meses ya impide escribir en períodos profundamente cerrados; el cierre fiscal es la barrera formal).
- **Pagos:** la fecha del pago no puede ser futura (tope hoy); el backdating dentro del piso de 6 meses es legítimo («fechas históricas», V2.12.32) y queda acotado por el mismo gate.
- La fecha técnica de creación NUNCA se usa como mínimo operativo.

### 2.5 C4 — Correcciones excepcionales

- El mecanismo controlado de excepción ES el backdating acotado ya institucionalizado: fecha elegible dentro de [hoy−6 meses, hoy], visible en el selector, con `reason`/`notes` obligatorios en los flujos que lo exigen (vales: notas obligatorias; reversos: motivo obligatorio), trazabilidad en `audit_logs` (momento real) + `idempotency_registry` (que además impide mutar la fecha de un documento ya registrado: `ERR_IDEMPOTENCY_KEY_REUSE`).
- Fuera de ese rango la operación queda **bloqueada** (no se habilita edición irrestricta de fechas de documentos contabilizados).
- No se modifica la fecha de documentos históricos: cero UPDATE/DELETE en esta misión.

### 2.6 Caja — política específica (vista prioritaria 5)

- Apertura y cierre de turno sellan **tiempo real** (`created_at` / `closed_at=NOW()` del RPC `close_cash_shift`); el arqueo suma por **ventana temporal** `apertura < X ≤ NOW()`. No se introduce fecha operativa en turnos (decisión PR #1419 ratificada: el sistema permite vender sin turno y la ventana mide lo realmente cobrado).
- El `closed_at` calculado en el cliente por `CashClosureView` es **código muerto** en el camino real de cierre (el hook solo envía `closure_id` + declarados; el RPC estampa NOW()) — verificado; se elimina del payload para evitar confusión.
- El ajuste extraordinario del Reporte de Entrega imputa `payment_date` al día inicial del período del reporte (regla de negocio FIX-RE-1510, documento vivo) — se mantiene y documenta.
- Una venta retro-fechada anterior a la apertura del turno no entra en el arqueo de ese turno: **aviso amber no bloqueante** ya implementado en Vender (se replica en Vales de Salida dedicado).

### 2.7 Excepciones y límites documentados

1. Recepción Express y ajuste por conteo: siempre NOW() (sin selector, por diseño de flujo rápido).
2. Reversos/anulaciones: NOW() (trazabilidad de la corrección).
3. `kardex_entries.created_at`: reloj de pared (trigger de cierre fiscal) — divergencia preexistente documentada; la UI del Kardex lee `stock_movements`.
4. `CURRENT_DATE` como default de `create_received_service_v2`: deriva UTC — la ruta pasa a estampar el día Habana explícito.
5. OCs (`expected_date`), cotizaciones (`valid_until`), lotes (`expiration_date`), ofertas (`fecha`): fechas de planificación/vigencia, no operativas — fuera del gate por diseño.

---

## 3. FASE D — Plan de implementación (mínimo, aditivo, reversible)

| Punto | Archivo | Cambio |
|---|---|---|
| D1 | `src/hooks/api/useGlobalOperationDate.ts` | `validateOperationDate`: mínimo comparado por **día de negocio** (inclusivo mismo día) |
| D2 | `src/components/views/terminal/views/inventory/useReceptionState.ts` | default/max Habana; validación con max; convención mediodía |
| D3 | `src/components/views/terminal/views/inventory/ValeSalidaCreateModal.tsx` | selector de fecha (max=hoy, min per-store) + `operation_date` + aviso de turno |
| D4 | `src/components/views/terminal/views/received_services/ReceivedServicesView.tsx` | selector «Fecha del servicio» + envío de `service_date` |
| D5 | 4 modales (catálogo, ajuste, transferencia crear/confirmar) | `max=hoy` en `OperationDatePicker` + validación |
| D6 | `src/app/api/inventory/receptions/route.ts` | re-check 422 + mapeo `ERR_*DATED*` |
| D7 | `src/app/api/received-services/route.ts` | default Habana + re-check 422 + mapeo |
| D8 | `src/app/api/transfers/[transferId]/confirm/route.ts` | parse + no-futura 422 |
| D9 | `src/app/api/devolutions/route.ts` | re-check 422 |
| D10 | `src/app/api/production-orders/[id]/payments/route.ts` | re-check 422 |
| D11 | `src/app/api/sync/batch/route.ts` | re-check por operación de venta |
| D12 | `src/components/views/terminal/views/cash_closure/CashClosureView.tsx` | eliminar `closed_at` muerto del payload |
| D13 | `supabase/migrations/20261018000000_politica_temporal_coherente.sql` | gate hoy+1→hoy; gate en `create_transfer`/`confirm_transfer`/`register_supplier_payment` |
| D14 | Pruebas unitarias, integración BEGIN…ROLLBACK y E2E | ver informe final |

Sin cambios de esquema de columnas, triggers, RLS ni grants de lectura. Sin `service_role` para saltar reglas. Sin UPDATE/DELETE de datos.
