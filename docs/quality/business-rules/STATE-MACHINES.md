# MÁQUINAS DE ESTADOS Y AUDITORÍA DE TRANSICIONES ILEGALES — COSTPRO 4
**Estándar:** CP-BRA-001 · **Versión:** 1.0 · **Fecha:** 2026-11-26 · **Commit:** main `0e684d6c1`
**Convención:** cada máquina incluye estados, transiciones permitidas (con actor y precondiciones), transiciones prohibidas, efectos secundarios, reversibilidad y pruebas negativas asociadas. El actor se expresa en los términos reales del código (`has_store_access_as`, `canManageStore`, roles de `src/lib/roles.ts`).

---

## 1. RESUMEN DE MÁQUINAS IMUESTAS EN BASE DE DATOS

El trigger global `fn_validate_document_transition` (20260913000001:68-77) protege: `transactions`, `devolutions`, `receipts`, `transfers`, `inventory_adjustments`, `production_orders`. **Fail-closed** para tabla/estado desconocido (:116-121).

**NO cubiertas por el trigger global** (transición solo impuesta en RPC): `received_services`, `issue_slips` (vales), `cash_flow_documents`, `purchase_orders`, `fin_generations`, maestros (`master_products`, `master_parties`). → Hallazgo R-12.

---

## 2. RECEPCIÓN (receipts)

```
pending ──confirm_pending_reception──▶ active ──reverse_receipt_v2──▶ reversed
   │                                     │
   └──void_pending_reception──▶ voided   └──(voided vía /api/reverse)
```

| Transición | Actor | Precondiciones | Efectos |
|---|---|---|---|
| pending→active | cualquier miembro (`has_store_access_as`) — **sin gate de rol** (R-06) | proveedor e importe válidos | WAC primero → movimiento después; `notes=receipt_id` (enlace documental CP-RECEP-001); numeración ENT; `ERR_RECEIPT_ALREADY_CONFIRMED` si re-intento |
| pending→voided | cualquier miembro | sin confirmación previa | sin inventario |
| active→reversed | matriz de roles | documento activo | anula inventario/kardex; **NO revierte pagos** (PUR-003/R-04 CRÍTICO) |
| active→voided | admin (patrón) | — | igual brecha de pagos |

**Transición ILEGAL observada en producción:** anular recepción activa CON pagos confirmados sin resolver sus efectos financieros (pagos 'in' activos sobre doc voided) — la misma clase del incidente SRV-20261123-00146 pero para recepciones. **Prueba negativa requerida (R-04):** intentar anular recepción con pago confirmado debe ser rechazada o revierte los pagos con contra-fila.
**Evidencia:** `20261125120000_cp_recep001_confirm_notes_link.sql:50-101`; `20260916000001:3670-3712`; `20261124120200:65-111` (mitigación de elegibilidad).

## 3. SERVICIO RECIBIDO (received_services)

```
draft ──set_received_service_status(active)──▶ active ──void (with_reversal)──▶ voided
   ├──▶ cancelled (con reversión de pagos si los tuviera)
   └──delete_received_service_draft (solo draft, sin pagos/asientos)
```

| Transición | Actor | Precondiciones | Efectos |
|---|---|---|---|
| draft→active | `has_store_access_as` vía API `canManageStore` | proveedor + importe>0 (fail-closed :184-193,195-202) | obligación CxP nace; numeración SRV |
| active→voided | idem | **reversión de TODOS los pagos** con contra-filas + asiento `fin_post_payment_annulment` (20261124120100) | estado terminal |
| draft→cancelled | idem | reversión si pagos | terminal |

**Corrección del incidente SRV-20261123-00146:** la versión 20261010000002 solo anotaba nota y `paid_amount=0` — hoy la cadena vigente (20261124120100) revierte pagos y cancela creaciones duplicadas por `creation_key` + índice único sobre audit_logs. **Riesgo de replay:** cuerpos antiguos reviven el defecto si una migración se re-ejecuta fuera de orden (R: cadena de 3 definiciones).
**Evidencia:** `20261124120100:22-262,184-193,428-430`; `20261122100000:105-120`.

## 4. VENTA (transactions — status completed)

```
(completed al confirmar) ──void_transaction (30s, propia)──▶ voided
(completed) ──reverse_transaction_v2 (admin/manager/encargado)──▶ reversed
```

| Transición | Actor | Precondiciones |
|---|---|---|
| completed→voided (undo 30s) | vendedor propio con rol POS (`canUndoSaleInStore`, Modelo C Nivel 1) | ventana 30 s; `invertSale` |
| completed→reversed | matriz `DOCUMENT_REVERSE_ROLES` | comisiones se revierten (trigger); inventario repuesto |

**Prohibido:** completed→completed (re-confirmar), voided→completed (resucitar), editar `total_amount` (`protect_transactions_total_amount`).
**Evidencia:** `src/lib/roles.ts:172-230`; `usePOSCheckout.ts:578-613`; `fn_audit_transaction_voiding`.

## 5. PAGO (payment_transactions)

Modelo de eventos (no columna status): fila activa `direction in (in,out,refund,recovery)`; la reversión inserta **contra-fila** `direction='reversal'` + `reverses_payment_id` con unicidad estructural `uq_payment_reversal_origin` y key `reversal:<id>`.

| Operación | Actor | Precondiciones | Efecto |
|---|---|---|---|
| registrar pago | service_role vía RPC (single tras gate canManageStore server-side — R-25; batch/multi tras canManageStore) | doc activo, lock FOR UPDATE, overpay prohibido neteando reversas (R-26: batch con la misma fórmula del motor single), idempotencia por clave | asiento 'pago' (solo receipt\|service con in; ORDEN_TRABAJO por fin) + `paid_amount` por trigger |
| registrar lote de OT (R-03) | service_role vía `register_ot_payment_batch` tras gate canManageStore (ruta /api/payments/ot-batch) | **ATOMICIDAD POR ORDEN**: todos los componentes de UNA OT se confirman en UNA transacción o ninguno (lock FOR UPDATE de la OT, pre-check neteado, replay por bloque `<key>:<i>`); la operación MULTI-OT es PARCIAL (una transacción independiente por orden — un fallo NO revierte las demás) | asiento ORDEN_TRABAJO por componente (fin) + `paid_amount` por trigger |
| revertir pago | actor validado `has_store_access_as` | ref_type receipt\|service (OT excluida — R-03), fecha operativa | contra-fila + asiento anulacion; **no protege pagos ya liquidados en cierres** (R-14) |
| DELETE | nadie | 409 PT007 | — |

**Transiciones ILEGALES detectadas:** (a) revertir pago de doc ya anulado (permitido por diseño para limpieza — DOCUMENTAR como excepción formal, R-14); (b) ~~pagos OT sin asiento ni saldo (FIN-013)~~ RESUELTO: el asiento ORDEN_TRABAJO existe (20261121120000) y la rama OT del trigger restaura `paid_amount` (20261126140000); (c) R-03: pago PARCIAL dentro de una OT — prohibido desde 20261127140000 (el pago mixto de una OT pasa por el lote atómico por orden).
**Evidencia:** `20261124120000:211-336,244-246,264-283`; `20260812000001:120-121`; `20261113120100:703-719`; `20261127140000_cpbra_r03_ot_payment_batch.sql` (R-03).

## 6. TRANSFERENCIA (transfers)

```
PENDIENTE ──confirm──▶ CONFIRMADA ──reverse──▶ REVERSADA
    ├──▶ CANCELADA
```

| Transición | Actor | Precondiciones |
|---|---|---|
| crear | miembro | reserva atómica de stock, origen≠destino, tiendas activas, fecha |
| PENDIENTE→CONFIRMADA | miembro | **approval previa si umbral exige segundo rol** (`transfer_approval_rules`, `requires_approval/approved_by`); TRANSFER_OUT+TRANSFER_IN atómicos |
| confirm→REVERSADA | matriz | reversa gobernada (REM-INV-6R) |

**Estado atasco conocido:** reserva expira a 24 h con documento aún PENDIENTE → POS vende ese stock y la confirmación falla por guard negativo (R-24).
**Evidencia:** `20260211:150-193`; `20260726000021_h7`; `20260727000007`; `20260802000002_v2_12_42`.

## 7. AJUSTE DE INVENTARIO (inventory_adjustments)

```
pending ──confirm_inventory_adjustment──▶ confirmed ──reverse_inventory_adjustment_v2──▶ reversed
    └──▶ voided
```

**Precondición insuficiente (R-05 CRÍTICO):** la confirmación sobrescribe `stock_current` a valor arbitrario con solo `has_store_access_as` — sin rol, sin supervisor, sin tope de desviación. **Prueba negativa requerida:** clerk no debe poder confirmar; o segunda aprobación / límite de desviación.
**Evidencia:** `20260726000027_v2_11:23-90,38-40`; mapa :104-109.

## 8. ORDEN DE PRODUCCIÓN / TRABAJO (production_orders)

```
draft→approved→in_progress→(paused↔in_progress)→completed→closed; (+voided/reversed desde estados válidos)
```
Cobros → CxC (FIN-011/FIN-013: el trigger conserva la rama OT con neteo de reversas desde 20261126140000 — R-01 remediado; asiento ORDEN_TRABAJO por fin desde 20261121120000; pagos múltiples de OT = operación parcial con atomicidad por orden — R-03, 20261127140000; la reversión de pagos OT sigue excluida de `reverse_supplier_payment` — decisión vigente).
**Evidencia:** `20260913000001:68-77`; `20261126140000` (R-01); `20261121120000:534-555`; `20261127140000` (R-03); RPCs v2_26_g2/g4/g5/g6/g7/g8.

## 9. DEVOLUCIÓN (devolutions)

```
pending ──▶ completed; completada ──▶ voided | reversed (con recovery atómico p_recovery)
```
Reembolso (v2.24.1): tope por moneda (neto pagado − reembolsos no recuperados), saldo físico por moneda (`ERR_INSUFFICIENT_CURRENCY`), sin conversión implícita USD↔CUP, AS_PAID multimoneda atómico, store_credit con cap.
**Evidencia:** `20260808000002_v2_17_2`; `20261024230000`; `20261024400000` (RC4-RC6); `/api/reverse` con `reverse_devolution`.

## 10. VALE DE SALIDA (issue_slips)

```
pending ──confirm_vale_salida──▶ completed ──reverse──▶ reversed
pending ──▶ voided
[LEGADO VIVO]: create_vale_salida descuenta stock en 1 paso (sin estado intermedio)
```
**Contradicción DOC-003:** el flujo directo sigue abierto y sin aprobación — salida de inventario sin venta ni segundo nivel.
**Evidencia:** `20261031120100:15-17,42-44,110-112`; `/api/vale-salida`.

## 11. ORDEN DE COMPRA (purchase_orders)

```
draft→sent→(partial→received); sent|partial→cancelled; draft→cancelled
```
`partial/received` SOLO vía `receive_against_po_final` (set_purchase_order_status :64-69); Grant a `authenticated` (:108) — sin gate de rol adicional.
**Evidencia:** `20260808000004_v2_24_g4`; `20260808000003_v2_24_g3`.

## 12. DOCUMENTO CAJA (cash_flow_documents)

```
confirmado ──reverse_cash_flow_document──▶ anulado (fila contraria payment_date=NOW())
```
Sin borrador; motivo ≥3; rol admin/manager/encargado; cierres históricos congelados (D4-D6).
**Evidencia:** `20261021000001:119+`; `src/app/api/cash-flow/reverse/route.ts:37-67`.

## 13. CIERRES (cash_closures, fiscal_closings)

Terminal e inmutable: triggers `prevent_cash_closure_edit` / `prevent_fiscal_closing_edit` — no hay transición de salida.
**Riesgo conexo:** reversiones de pagos ya incluidos en cierres caen en el turno vigente sin control de período (R-14).

## 14. GENERACIÓN CONTABLE (fin_generations)

```
building→candidate→active→superseded | rolled_back   (una activa por tienda)
```
Escritura del mayor solo vía motor (FIN-001); reprocess/backfill con dry_run.
**Evidencia:** `20261120120000:105-129`; `/api/fin/posting`.

## 15. TERCEROS MAESTROS (master_products, master_parties)

```
active ──▶ archived (delete físico solo sin historial; guard ERR_PARTY_HAS_HISTORY)
```
Vínculo tienda desconecta sin borrar (`catalog_store_links`); consolidación manual solo con historial vacío.
**Evidencia:** `20261124120400`; `20261028110000`.

---

## 16. MATRIZ CONSOLIDADA DE TRANSICIONES Y PUERTAS

| Entidad | Estados | Impuesta en BD (trigger global) | Impuesta en RPC | Impuesta en API | Impuesta solo en UI | Brecha activa |
|---|---|---|---|---|---|---|
| receipts | pending/active/voided/reversed | SÍ | SÍ | SÍ | Sí | pagos sin reversión al anular (R-04) |
| received_services | draft/active/cancelled/voided | NO | SÍ | SÍ | Sí | replay fuera de orden revive defecto |
| transactions | completed/voided/reversed | SÍ | SÍ | SÍ | Sí | — |
| payment_transactions | (eventos) | parciales (no DELETE) | SÍ | Sí | — | ~~OT sin asiento (R-03)~~ RESUELTO (fin ORDEN_TRABAJO + lote atómico por orden); sin guard de cierre (R-14) |
| transfers | PENDIENTE/CONFIRMADA/CANCELADA/REVERSADA | SÍ | SÍ | Sí | Sí | atasco reserva 24 h (R-24) |
| inventory_adjustments | pending/confirmed/voided/reversed | SÍ | SÍ (sin rol) | Sí | Sí | sin segundo aprobador (R-05) |
| production_orders | draft..closed (+voided/reversed) | SÍ | SÍ | parcial | — | ~~CxC/OT divergente (R-01/02/03)~~ R-01/R-26 remediados; R-03: lote parcial por orden con atomicidad interna |
| devolutions | pending/completed/voided/reversed | SÍ | SÍ | SÍ | Sí | — |
| issue_slips | pending/completed/voided/reversed | NO | SÍ | Sí | Sí | flujo directo sin aprobación (R-13) |
| purchase_orders | draft/sent/partial/received/cancelled | NO | SÍ | Sí | Sí | sin gate de rol (menor) |
| cash_flow_documents | confirmado/anulado | NO | SÍ | SÍ | — | — |
| fin_generations | building..rolled_back | NO (motor) | SÍ | SÍ | — | — |
| master_products/parties | active/archived | NO | SÍ (guards) | — | — | — |

## 17. CASOS DE TRANSICIÓN ILEGAL BUSCADOS SISTEMÁTICAMENTE (resultado de la auditoría)

| Caso | ¿Posible hoy? | Evidencia | Ref. riesgo |
|---|---|---|---|
| Documento pagado que se anula sin resolver pago | SÍ en recepciones; NO en servicios (corregido) | `20260916000001:3670-3712` | R-04 |
| Documento anulados que conservan obligación activa | SÍ (elegibilidad mitiga reporte, no la BD) | `20261124120200:65-111` | R-04 |
| Devolución con movimientos inconsistentes | NO (reversión atómica probada) | `20260808000002`; RC1-RC6 | — |
| Venta confirmada que vuelve a estado incompatible | NO (trigger + protect_total) | `20260913000001` | — |
| Pago revertido sin contrapartida | NO (contra-fila obligatoria + unicidad) | `20261124120000:51-53` | — |
| Pago revertido que ya cayó en cierre | SÍ — sin control de período | `20261124120000:264-283` | R-14 |
| Liquidaciones duplicadas | NO (idempotencia + unicidad) | `uq_payment_reversal_origin`; `20261124120300:97-125` | — |
| Estados modificados directamente evitando procedimiento | PARCIAL — RLS de escritura permite UPDATE directo en varias tablas para roles de tienda (p. ej. precios INV-005, variantes CAT-004) | `20260827000005:128` | R-18/R-19 |
| Operación repetida con efecto duplicado | NO en pagos/ventas (idempotencia); SÍ en alta de proveedores/clientes | PRO-001/002 | R-15/R-16 |
