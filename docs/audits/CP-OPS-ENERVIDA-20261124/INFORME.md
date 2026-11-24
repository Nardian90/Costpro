# CP-OPS-ENERVIDA — Informe final (auditoría + corrección)

Rama: `fix/cp-ops-enervida-integridad-operativa` · Base: main @ 029d40165 · 2026-11-24
Tienda: ENERVIDA-VITALLCONS · Período: 21–23/11/2026 (America/Havana, inclusivo)
PRODUCCIÓN: SOLO LECTURA durante todo el diagnóstico (verificado: cero escrituras).

---

## 1. Resumen ejecutivo

| # | Problema | Causa raíz (comprobada) | Corrección |
|---|---|---|---|
| P0 | Reporte Entrega incluye un servicio cancelado → faltante artificial de 1.800 CUP | El pago (1.800, 23/11 16:34) del servicio **SRV-20261123-00146 (Aduana)** — anulado 18 s después y re-creado como 00147 — sobrevivió como salida activa: el void solo añadía texto a las notas y ninguna consulta del pipeline filtra por estado del documento padre | Contra-filas `direction='reversal'` en el void + regla de elegibilidad en `get_cash_report`/`get_cash_currency_summary`/desglose por concepto (documento anulado ⇒ sin efectos activos) + concepto «Reversiones de pagos» |
| §2.1/§2.2 | Resultados sin separación contable; PDF no configurable por concepto | La pestaña Resultados solo listaba pagos; la selección de conceptos gobernaba cálculo y presentación a la vez | Sección «Obligaciones del período» (A servicios · B recepciones) + acordeón rotulado «C. Pagos efectivamente realizados» + selector independiente «Conceptos que se mostrarán en el PDF» con colapso «Otros conceptos incluidos» (importes intactos) |
| P1 §3/§4 | Duplicación local↔Maestro; error al crear servicio con «Tienda Pueblo» (~3 borradores) | `SupplierSelector` ignoraba `source` de `search_master_parties` → un local viajaba como `masterPartyId` (evidencia en BD: servicios 00141/00142 con `supplier_master_party_id=03988f54`, un `suppliers.id` inexistente en el maestro) y el POST de confirmación creaba el draft ANTES de validar identidad, sin `creation_key` | Selector respeta `source` (+`linked_supplier_id`); identidad resuelta ANTES de crear; `create_received_service_v2` con `p_creation_key` idempotente; RPC `consolidate_local_party` (link/promote) + UI con verificación humana |
| P1 §5 | Error al anular el pago de la recepción 2b74e9cf (Rec-23112026, 1 CUP) | El botón hacía `DELETE` físico y PT007 lo prohíbe por diseño — el flujo de reversión NO existía | RPC `reverse_supplier_payment` (contra-fila + asiento compensatorio `anulacion`/`reversal_of` + obligación restablecida por neteo) + `POST /api/payments/[id]` + UI con motivo; DELETE → 409 accionable |
| §6 | Cuentas por Pagar sin liquidación múltiple verificable | Solo existía «Marcar Pagadas» (cambio de estados en bloque, no transaccional) | RPC `register_supplier_payment_multi` (atómico, locks deterministas, overpay por documento, replay idempotente) + `POST /api/payments/multi` + panel «Liquidar seleccionadas» con importe por documento (total/parcial) |

## 2. Conciliación de prueba — Reporte Entrega ENERVIDA 21–23/11

**Registros participantes (trazados a origen, producción solo lectura):**

| Concepto del reporte | Importe | Origen exacto |
|---|---:|---|
| Ventas en efectivo | 84.750 | pagos cash CUP: 69.250 (45ffa36e 21/11) + 7.000 + 2.000 + 6.500 (23/11) |
| Equivalencia CUP (informativa) | 382.000 | 400 USD cash (fbdaf826 21/11, tasa 955) |
| Servicios recibidos pagados en efectivo | −6.599 | 1.000 (04a7ee26 21/12:00) + 1.999 (0385efaa 23/12:00) + **1.800 (fedb7c40 23/16:34 — INVÁLIDO)** + 1.800 (602eb3c1 23/16:36) |
| Pagos a proveedores | −1,00 | recepción 2b74e9cf (23/11 12:00) |
| Efectivo esperado (personalizado) | 78.150 | 84.750 − 6.599 − 1 |
| Contado / Cuadre | 76.350 / **−1.800** | desglose de billetes del usuario |

**Registro inválido:** pago `cfc629e0-…:0` (1.800 CUP cash, 23/11 16:34) del servicio **SRV-20261123-00146 (Aduana, Pixelarte, F-23112026, «6 QR cada uno a 300 pesos»)** — creado 16:34:48 con liquidación, **voided 16:35:09** (18 segundos) y re-creado como SRV-20261123-00147 (Servicios de Terceros, misma ref. F-23112026, mismo concepto) con pago propio 16:36:09. El mismo hecho económico pagado UNA vez estaba registrado como DOS salidas.

**Resultado corregido (con esta corrección):** «Servicios recibidos pagados en efectivo» = 4.799 (Comisión 2.999 + Servicios de Terceros 1.800; el desglose ya NO muestra «Aduana»), esperado **79.950**. El faltante artificial de 1.800 desaparece. El residual contado-vs-esperado que quede es la realidad física de la caja (el sistema no registra egresos de caja, cierres ni devoluciones en el período: 0 filas) — **no se enmascara** (misión §2: no ajustar cifras para que el cuadre dé cero).

## 3. Inventario de terceros ENERVIDA (decisión por caso — sin ejecutar fusiones ambiguas)

| Registro | Datos | Decisión | Justificación |
|---|---|---|---|
| «—» (local, suppliers 14001a9b) | sin nombre/NIT/contacto | **Pendiente de depuración** | Sin identidad suficiente; la UI ahora lo marca con badge y bloquea promoverlo |
| Juan Carlos (local f0779c3f) | prov. jurídica, tel 56561619 | **Pendiente de validación humana** | vs CP-0002 «JuanCarlos» (natural, sin tax/tel): nombre similar pero tipo y datos NO coinciden — no se fusiona (regla §3.2-3) |
| Pedro Infante (local aa7eb181) | prov., tel 56009375 | **Pendiente de validación humana** | vs CL-0001 (cliente, tax 00001234567, tel 53214567): contacto y clasificación distintos; si se confirma la misma persona, el modelo admite doble rol (is_client+is_supplier) sin duplicar |
| Proveedor General (local f0675a3b) | sin tax/tel | **Pendiente de validación** | Sin documentos identificados en el período auditado; normalizar o desactivar tras revisión |
| Tienda Pueblo (local 03988f54) | 20+ servicios históricos (comisiones diarias) | **Promover al Maestro** (acción manual vía UI) | Tercero operativo central; con el selector corregido funciona desde Maestro y desde el flujo de servicios |
| Pixelarte (local 578b4967) | vinculado a CP-0003 (d5f988ad) | **Conservar** (ya consolidado) | Referencia correcta en servicios 00146/00147 |
| CP-0001 Yila, PR-0001 Laudelina, CP-0002 JuanCarlos, CL-0001 Pedro Infante, CP-0003 Pixelarte (maestros) | — | **Conservar** | Identidades maestras activas |

La UI de «Clientes y Proveedores» ofrece por registro local: **Vincular al maestro** (selector de candidatos con verificación explícita — nunca auto-fusión por nombre), **Promover al maestro** (con aviso de homónimos) y el badge **Pendiente de depuración**.

## 4. Reversión de pago de recepción — comportamiento verificado (§5)

Antes → después (integración en BD aislada, pagos de prueba):
1. Recepción **sigue `active`**; inventario y costo intactos (ningún toque a receipts/receipt_items más allá del pago).
2. Obligación **restablecida** por el importe revertido: `payment_status` paid→unpaid (o parcial), `paid_amount` neteado por el trigger `update_payment_status`.
3. Caja/banco: **contra-fila** (`direction='reversal'`, `reverses_payment_id`, mismo importe/medio/moneda, fecha y usuario propios).
4. Asiento compensatorio `event='anulacion'` enlazado por `reversal_of` al asiento «pago» original (nunca UPDATE del histórico).
5. **Idempotente**: el reintento devuelve la MISMA contra-fila (`status='idempotent'`).
6. Auditoría `PAYMENT_REVERSED` con pago original, motivo, fecha e importes.

## 5. Liquidación múltiple — demostración (§6, BD aislada)

Lote: recepción 100 CUP + servicio 250 CUP, un solo método (efectivo):
- Asignación explícita: 40 (parcial) a la recepción + 250 (total) al servicio → recepción `partial` saldo 60, servicio `paid`.
- **Replay** del mismo lote con la misma clave → `replayed=true`, cero filas nuevas.
- **Overpay** (61 > saldo 60) → `ERR_MULTI_OVERPAY`, NINGÚN documento liquidado (atómico).
- El flujo de pago individual (POST /api/payments) permanece intacto.

## 6. Archivos modificados (resumen)

**Migraciones (5, idempotentes; NO aplicadas a producción):** `20261124120000` (reversal + reverse_supplier_payment + neteo), `20261124120100` (void con contra-filas + creation_key), `20261124120200` (elegibilidad del reporte), `20261124120300` (liquidación múltiple), `20261124120400` (consolidación de terceros + `customers.master_party_id` incorporado VERBATIM al stream — existía en producción pero faltaba en el replay, mismo patrón que ADN-009 F2).

**Backend:** `api/payments/[id]/route.ts` (POST=reverse, DELETE=409), `api/payments/multi/route.ts` (nuevo), `api/received-services/route.ts` (identidad ANTES de crear + creation_key), `api/cash-report/route.ts` (`pending_obligations`).

**Libs:** `cash-report/summary.ts` (+`reversionesPagosCash`), `custom-result.ts` (identidad conservada), `report-selection.ts` (pdfConcepts por tienda), `service-concept-breakdown.ts` (elegibilidad), `cash-report-pdf.ts` (+reversión, +colapso «Otros conceptos incluidos»), `cash-report-docx.ts` (paridad), `useClassifier.ts` (+consolidate).

**UI:** `CashReportView.tsx` (selector PDF, obligaciones A/B, categoría C, fila reversión), `SupplierSelector.tsx` (source), `ReceivedServicesView.tsx` (creation_key al confirmar + reversión de pago), `ReceptionDetailsModal.tsx` / `PaymentHistoryRow.tsx` (reversión), `AccountsPayableView.tsx` + `LiquidationModal.tsx` (liquidación múltiple), `ClientesProveedoresView.tsx` (vincular/promover/pendiente).

## 7. Pruebas ejecutadas (resultados reales)

- **tsc --noEmit: 0 errores.**
- **vitest suite completa: 6.566 ✓ / 0 fallos** tras ajustes (nuevas: `cash-report-reversals.test.ts` (6), `liquidation-modal.test.tsx` (4); actualizadas por contrato: manifiesto 198→203 con regeneración oficial, mock de `useConsolidateLocalParty`, testid del desglose `+direction`).
- **Integración BD aislada CostproE2E (Management API): 28/28 ✓** — migraciones aplicadas + escenarios P0/§5/§6/§3 + **net-zero** (residuo 0 y reporte al baseline tras limpieza; producción intacta, guard por ref).
- **E2E Playwright: pendiente** (limitación documentada; pasos manuales en §9).

## 8. Riesgos residuales y limitaciones

1. **Datos históricos de producción**: el pago fantasma del SRV-…-00146 sigue en `payment_transactions` (no se toca producción). Con la corrección, el reporte lo excluye por elegibilidad; si el propietario quiere la contra-fila explícita, ejecutar `reverse_supplier_payment` en producción tras desplegar (decisión suya — esta misión no escribe en producción).
2. El asiento compensatorio depende de que el motor contable tenga reglas activas para la tienda (fin_post_document_safe degrada sin romper; verificado el enlace `reversal_of` cuando existe el asiento «pago»).
3. Los borradores duplicados ya existentes del incidente «Tienda Pueblo» (p. ej. SRV-20261121-00144, sin pagos) se limpian con el flujo ADN-010 existente (cancelar/eliminar borrador); la corrección evita que se generen nuevos.
4. La promoción de «Tienda Pueblo» al Maestro queda como acción manual explícita (inventario §3) — nunca automática.
5. Sin E2E de navegador en este ciclo: los flujos UI están cubiertos por tests de componentes; la prueba de navegador queda para el siguiente ciclo.

## 9. Validación manual (pasos precisos)

1. **P0**: Inicio → OPERACIÓN → Ventas → Reporte Entrega → ENERVIDA-VITALLCONS → 21/11/2026–23/11/2026 → Generar: el desglose de servicios ya no muestra «Aduana −1.800»; esperado 79.950; en Resultados, la sección «Obligaciones del período» lista pendientes por servicios/recepciones y el acordeón se rotula «C. Pagos efectivamente realizados».
2. **§2.2**: Resultados → «Conceptos que se mostrarán en el PDF» → desmarcar «Otros egresos» → exportar PDF: aparece una única línea «Otros conceptos incluidos» con el neto; el esperado/cuadre no cambian.
3. **§4**: OPERACIÓN → Servicios Recibidos → Nuevo → buscar «Tienda Pueblo» (badge Local) → confirmar con pago → un único servicio activo; repetir con error de red simulado → el reintento NO duplica (creation_key).
4. **§5**: Logística → Recepciones → 2b74e9cf → pagos → Anular → motivo → la recepción sigue Confirmada, el proveedor recupera el saldo y el historial muestra original + reversión; el doble clic no genera dos devoluciones.
5. **§6**: Ventas → Opciones → Cuentas por Pagar → marcar 2+ documentos → «Liquidar seleccionadas» → revisar importes (uno parcial) → Confirmar → ambos quedan liquidados con sus saldos correctos; reintentar el mismo lote no duplica.
6. **§3**: Clientes y Proveedores → en «Tienda Pueblo» → «Promover al maestro» → verificar CP-00xx en el Maestro y que el local deja de aparecer como independiente; en «—» → badge «Pendiente de depuración» y Promover bloqueado.
