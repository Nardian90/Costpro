# CP-OPS-ENERVIDA — Estado de implementación (2026-11-24, sesión 1)

Rama: `fix/cp-ops-enervida-integridad-operativa` · Base: main @ 029d40165 · PR: pendiente (no abrir hasta cerrar la matriz de pruebas §7.3).

## Causas raíz verificadas (con datos de producción, SOLO LECTURA)

1. **P0 §2 Reporte Entrega**: `SRV-20261123-00146` (Aduana, Pixelarte, F-23112026, 1.800 CUP) se creó 23/11 16:34 con pago en efectivo (`4783f9ae`) y se anuló 18 s después (16:35:09); se re-creó como `SRV-20261123-00147` (Serv. de Terceros, misma ref/importe) con pago `c15d5525` (16:36). El pago del servicio anulado quedó como salida activa (solo nota de texto, sin contra-fila) → el reporte resta 3.600 por un hecho pagado una sola vez → **faltante artificial de 1.800 CUP** (esperado real del sistema: 79.950; el −3.600 restante vs. lo contado 76.350 no tiene registro en el sistema — egresos/cierres/devoluciones del período = 0 — y NO se enmascara, misión §2).
2. **§3/§4 Terceros**: `SupplierSelector` ignoraba `source` de `search_master_parties` → un proveedor LOCAL (ej. Tienda Pueblo, `suppliers.03988f54`) viajaba como `masterPartyId` → el POST de confirmación creaba el draft ANTES de resolver identidad → 400 `ERR_SUPPLIER_MASTER_INVALID` con draft huérfano, y cada reintento creaba otro (sin `creation_key` en ese camino). Evidencia: servicios 00141/00142 (20/11) con `supplier_master_party_id=03988f54` (no existe en master_parties).
3. **§5 Anular pago**: `DELETE /api/payments/[id]` hacía borrado físico y el trigger PT007 lo prohíbe por diseño («Use reversal/void flow») — el flujo de reversión NO existía. Recepción caso: `2b74e9cf-0c98-4fd2-b5e2-ef274d82ece7` (Rec-23112026, active, paid 1 CUP).
4. **§3 guard `delete_master_party`**: comparaba `transactions.customer_id` (UUID de `customers`) contra `master_parties.id` — inefectivo.

## Implementado (commits 2ab3e6cc1 + siguientes)

**Migraciones (5, NO aplicadas a producción — solo E2E):**
- `20261124120000` — `direction='reversal'` + `reverses_payment_id` (índice único: una reversa por pago), `update_payment_status` NETEA contra-filas, `fin_post_payment_annulment` (asiento compensatorio por pago, patrón `reversal_of`), **`reverse_supplier_payment`** (RPC: contra-fila + asiento + auditoría, transaccional e idempotente), `register_supplier_payment` re-emitido con neteo de saldo.
- `20261124120100` — `void_received_service_with_reversal` ahora crea CONTRA-FILAS por pago; `set_received_service_status` revierte pagos al cancelar/anular; `create_received_service_v2` + `p_creation_key` (idempotencia del modo confirmación, índice único en audit_logs).
- `20261124120200` — **elegibilidad** en `get_cash_report` (payments excluye documentos anulados + grupo NUEVO `payment_reversals`) y `get_cash_currency_summary` (término `supplier_reversals_cash`; el saldo inicial deja de contaminarse).
- `20261124120300` — **`register_supplier_payment_multi`**: lote atómico multi-documento, locks deterministas, overpay por documento neteando reversas, replay idempotente, un método/moneda por lote.
- `20261124120400` — **`consolidate_local_party`** (link|promote local→maestro, sin borrar el local, `party_change_log`+`audit_logs`) y `delete_master_party` con guard corregido (customers/suppliers VINCULADOS).

**Backend TS**: `POST /api/payments/[id]` = reversión (canManageStore + actor de sesión; DELETE → 409 accionable PT007); `POST /api/payments/multi` (zod + gates + mapeo de errores); `POST /api/received-services` resuelve identidad ANTES de crear y pasa `creation_key`.

**Libs del reporte**: `summary.ts` (concepto `reversionesPagosCash` + neteo en esperado), `custom-result.ts` (identidad personalizado==oficial conservada), `service-concept-breakdown.ts` (excluye servicios voided/cancelled + filas reversal).

**UI**: `SupplierSelector` respeta `source` (+`linked_supplier_id`); modal de servicios envía `creation_key` también al confirmar y renueva la clave tras éxito; «Anular pago» de Recepciones/CxP/Servicios llama a la reversión (confirm+motivo); CxP: barra de selección con contador + total pendiente y **panel «Liquidar seleccionadas»** (`LiquidationModal`: importe editable por documento, total/parcial, un método por lote, validaciones overpay/cero/riel divisa, confirmación explícrita, idempotente) — sustituye a «Marcar Pagadas» (flujo individual intacto).

**Verificación**: `tsc --noEmit` = 0 errores.

## PENDIENTE (siguiente sesión — plan exacto)

1. **UI §2.1 (Resultados A/B/C)**: en `CashReportView.tsx` `ResultadosPanel` (~2327-2714) añadir sección «Obligaciones del período» con dos grupos (A: servicios `received_services` del período con total/pendiente/ref; B: recepciones `receipts` con total/pendiente/document_number) — fuente: extender `/api/cash-report` o consumir `/api/accounts-payable` filtrado — y re-etiquetar el acordeón de pagos como «C. Pagos efectivamente realizados».
2. **UI §2.2 (selección PDF)**: persistencia `costpro:cash-report:pdf-concepts:v1:store:<id>` (mostrar en PDF, independiente de `summary-concepts` que gobierna el cálculo); en `buildDiarioIncomeRows` (`cash-report-pdf.ts:342-440`, compartido con docx) colapsar los conceptos desmarcados en una línea «Otros conceptos incluidos» con su suma NETA — importes contables intactos; selector con marcar/desmarcar por grupo.
3. **UI §3**: en `ClientesProveedoresView.tsx` acciones por registro local «Vincular al maestro» (selector con candidatos por NIT/nombre/contacto — nunca auto-fusión) y «Promover al Maestro» vía `consolidate_local_party` (hook nuevo en `useClassifier.ts`); marcar «pendiente de depuración» el registro «—» (sin nombre/NIT).
4. **Pruebas §7.3** (matriz completa): unitarias nuevas (summary reversiones, breakdown elegibilidad, LiquidationModal validaciones, SupplierSelector source, route order+creation_key, reverse endpoint idempotencia) + **integración en CostproE2E** (aplicar las 5 migraciones y ejercitar: void con pagos → contra-filas + asientos + reporte sin la salida; anular pago de recepción → obligación restablecida/inventario intacto/caja revertida/reintento idempotente; liquidación múltiple con 2 docs incl. parcial; consolidar terceros; aislamiento tenants) + E2E Playwright (creación de servicio con Tienda Pueblo + error controlado + reintento → UN borrador; flujo §2.1/§2.2) + net-zero guard.
5. **Conciliación de prueba** para el PR: ENERVIDA 21-23/11 — registros participantes, inválido (SRV-…-00146 voided, pago 4783f9ae 1.800), resultado corregido (servicios 4.799 = Comisión 2.999 + Serv.Terceros 1.800; esperado 79.950) — ejecutado contra la BD aislada con réplica del caso.
6. **Inventario de terceros** (decisiones, NO ejecutar fusiones ambiguas): «—» → PENDIENTE depuración; Juan Carlos local vs CP-0002 JuanCarlos → PENDIENTE (tipo jurídica vs natural, sin identificadores compartidos); Pedro Infante local (prov, 56009375) vs CL-0001 (cliente, tax 00001234567, 53214567) → PENDIENTE (no fusionar; posible doble rol); Proveedor General → investigar uso (sin docs aún); Tienda Pueblo → PROMOVER al maestro (20+ servicios históricos; tras el fix del selector funciona en ambos orígenes); Pixelarte local ya vinculada a CP-0003 ✓.
7. Expediente completo + PR (sin fusionar) con todo lo anterior.

## Reglas de la misión respetadas

Producción SOLO LECTURA (cero escrituras verificadas); sin borrar pagos (PT007); obligación ≠ salida de efectivo (las A/B/C); personalizar el PDF nunca altera importes; flujo individual de pago intacto; sin N+1 (el desglose usa las mismas filas del RPC).
