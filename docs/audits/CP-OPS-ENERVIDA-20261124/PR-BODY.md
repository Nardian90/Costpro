# CP-OPS-ENERVIDA — Integridad de reportes, terceros, recepciones y cuentas por pagar

Tienda: **ENERVIDA-VITALLCONS** · Período: 21–23/11/2026 (America/Havana) · **Producción: SOLO LECTURA durante todo el diagnóstico** (cero escrituras verificadas). Pruebas de escritura: BD aislada **CostproE2E**. Expediente completo: `docs/audits/CP-OPS-ENERVIDA-20261124/INFORME.md`.

## 1. Resumen ejecutivo (4 problemas + mejora)

| # | Problema | Causa raíz comprobada | Corrección |
|---|---|---|---|
| **P0** | Reporte Entrega incluye un servicio cancelado → faltante artificial de **1.800 CUP** | El pago (1.800, 23/11 16:34) de `SRV-20261123-00146` (Aduana) — anulado 18 s después y re-creado como `…-00147` (misma ref. F-23112026, «6 QR a 300 pesos») — sobrevivió como salida activa: el void solo marcaba notas y **ninguna** consulta del pipeline (`get_cash_report`, `get_cash_currency_summary`, desglose por concepto) filtra por estado del documento padre | Contra-filas `direction='reversal'` al anular + **regla de elegibilidad** (documento anulado ⇒ sin efectos económicos activos) + concepto «Reversiones de pagos a proveedores» (entradas sobre documentos válidos) |
| **P1 §3/§4** | Consolidación local↔Maestro; error al crear servicio con «Tienda Pueblo» (~3 borradores) | `SupplierSelector` ignoraba `source` de `search_master_parties` → un local viajaba como `masterPartyId` (evidencia: servicios 00141/00142 con `supplier_master_party_id=03988f54`, un `suppliers.id` inexistente en el maestro) y el POST de confirmación creaba el draft **antes** de validar identidad, sin `creation_key` | Selector respeta `source` (+`linked_supplier_id`); identidad resuelta **antes** de crear; `create_received_service_v2` idempotente por `p_creation_key`; RPC `consolidate_local_party` (link/promote) + UI con verificación humana (nunca auto-fusión por nombre) |
| **P1 §5** | Error al anular el pago de la recepción `2b74e9cf` (Rec-23112026, 1 CUP) | El botón hacía `DELETE` físico y el trigger **PT007 lo prohíbe por diseño** — el flujo de reversión no existía | RPC `reverse_supplier_payment` (contra-fila + asiento compensatorio `anulacion`/`reversal_of` + obligación restablecida por neteo) + `POST /api/payments/[id]` + UI con motivo; DELETE → 409 accionable |
| **§2.1/§2.2** | Resultados sin separación obligaciones/pagos; PDF sin selección por concepto | La pestaña solo listaba pagos; una única selección gobernaba cálculo y presentación | Sección **«Obligaciones del período»** (A servicios · B recepciones, con documento y saldo) + acordeón **«C. Pagos efectivamente realizados»** + selector **«Conceptos que se mostrarán en el PDF»** (persistido por tienda) con colapso **«Otros conceptos incluidos»** — ocultar no altera importes |
| **§6** | CxP sin liquidación múltiple verificable | Solo «Marcar Pagadas» (estados en bloque, no transaccional) | RPC `register_supplier_payment_multi` (**atómico**, overpay por documento bajo lock, replay idempotente) + `POST /api/payments/multi` + panel **«Liquidar seleccionadas»** (importe editable por documento: total/parcial, un método por lote, validaciones, confirmación) — flujo individual intacto |

## 2. Conciliación de prueba — Reporte Entrega 21–23/11

Trazado al céntimo contra producción (solo lectura): ventas 84.750 (69.250+7.000+2.000+6.500) · servicios 6.599 (1.000+1.999+1.800+1.800) · proveedores 1.

- **Inválido:** pago `cfc629e0-…:0` (1.800 cash, 23/11 16:34) del servicio **anulado** `SRV-20261123-00146` — el mismo hecho ya está pagado por su reemplazo activo `SRV-20261123-00147`.
- **Corregido:** «Servicios recibidos» = **4.799** (Comisión 2.999 + Serv. de Terceros 1.800; «Aduana» desaparece del desglose) · esperado **79.950** · el faltante artificial de 1.800 desaparece. El residual que quede es la realidad física de la caja (el sistema registra 0 egresos/cierres/devoluciones en el período) — **no se enmascara**.

## 3. Inventario de terceros (decisión por caso — sin fusionar identidades ambiguas)

**Conservar:** CP-0001 Yila, PR-0001 Laudelina, CP-0002 JuanCarlos, CL-0001 Pedro Infante, CP-0003 Pixelarte (+ local Pixelarte ya vinculada). **Promover (manual, vía UI):** Tienda Pueblo (20+ servicios históricos). **Pendiente de validación humana:** Juan Carlos local (jurídica/56561619) vs CP-0002 (natural, sin tax); Pedro Infante local (prov., 56009375) vs CL-0001 (cliente, tax 00001234567/53214567) — contactos y clasificación distintos; el modelo admite doble rol si se confirma. **Pendiente de depuración:** «—» (sin nombre/NIT — la UI lo marca y bloquea promoverlo); Proveedor General (revisar uso).

## 4. Migraciones (5 — idempotentes, justificación)

1. `20261124120000` — `direction='reversal'` + `reverses_payment_id` (único por pago) + `update_payment_status` netea + `fin_post_payment_annulment` + **`reverse_supplier_payment`** + neteo de saldo en `register_supplier_payment`.
2. `20261124120100` — `void_received_service_with_reversal` crea contra-filas; `set_received_service_status` revierte pagos en cancelación; `create_received_service_v2` + `p_creation_key`.
3. `20261124120200` — elegibilidad en `get_cash_report` (+grupo `payment_reversals`) y `get_cash_currency_summary` (el saldo inicial deja de contaminarse).
4. `20261124120300` — `register_supplier_payment_multi`.
5. `20261124120400` — `consolidate_local_party` + guard de `delete_master_party` corregido + **`customers.master_party_id` incorporado VERBATIM** al stream (existía en producción y faltaba en replays — mismo patrón que ADN-009 F2 para suppliers).

## 5. Pruebas ejecutadas (resultados reales)

- `tsc --noEmit`: **0 errores**.
- **vitest suite completa: 6.566 ✓ / 0 fallos** (nuevas: reversals del resumen/colapso PDF (6), validaciones LiquidationModal (4); actualizadas por contrato: manifiesto de replay 198→**203** regenerado con el script oficial, mock `useConsolidateLocalParty`, select del desglose `+direction`, testids canónicos conservados).
- **Integración BD aislada CostproE2E: 28/28 ✓** (vía Management API; guard fail-closed por ref): migraciones aplicadas + P0 (contra-fila + elegibilidad + reporte al baseline) + §5 (recepción sigue activa, obligación restablecida, idempotente, asiento enlazado) + §6 (parcial 40/100 + total 250, replay sin duplicar, overpay rechazado) + §3 (promote/link/no_change/desvinculación al borrar) + **net-zero** (residuo 0 tras limpieza, reporte al baseline, tenant/enlace de prueba restaurados).
- **E2E Playwright: pendiente** (limitación declarada; pasos manuales abajo).

## 6. Evidencias antes/después (BD aislada)

- **Antes (repro del defecto):** reporte resta el pago del servicio → total +1.800 sobre baseline; el void (versión main) dejaba el pago activo.
- **Después:** void → contra-fila `reversal` enlazada + `paid_amount=0` + `payment_status=unpaid` + **reporte vuelve exactamente al baseline**; reemplazo activo resta exactamente una vez.

## 7. Riesgos residuales y limitaciones

1. El pago fantasma histórico del SRV-…-00146 permanece en `payment_transactions` de producción (no se escribe en producción); con la corrección el reporte lo excluye. Si el propietario desea la contra-fila explícita: ejecutar `reverse_supplier_payment` en producción tras desplegar (decisión del propietario).
2. El asiento compensatorio degrada limpiamente si la tienda no tiene reglas contables activas (`fin_post_document_safe`).
3. Los borradores duplicados ya existentes del incidente se limpian con el flujo ADN-010 (cancelar/eliminar borrador) — la corrección evita que se generen nuevos.
4. La promoción de «Tienda Pueblo» y las decisiones de fusión son acciones manuales explícitas (inventario §3).
5. Sin E2E de navegador en este ciclo (component tests + integración cubren los flujos).

## 8. Validación manual (pasos precisos)

1. **P0:** OPERACIÓN → Ventas → Reporte Entrega → ENERVIDA → 21–23/11/2026 → Generar: sin «Aduana −1.800»; esperado 79.950; Resultados con «Obligaciones del período» (A/B) y «C. Pagos efectivamente realizados».
2. **§2.2:** Resultados → «Conceptos que se mostrarán en el PDF» → desmarcar «Otros egresos» → exportar: línea única «Otros conceptos incluidos»; esperado/cuadre intactos.
3. **§4:** Servicios Recibidos → Nuevo → «Tienda Pueblo» (badge Local) → confirmar con pago → UN servicio activo; reintento tras error NO duplica (creation_key).
4. **§5:** Recepciones → 2b74e9cf → Anular pago → motivo: recepción sigue Confirmada, saldo del proveedor restablecido, historial original+reversión; doble clic no genera dos devoluciones.
5. **§6:** Cuentas por Pagar → seleccionar 2+ → «Liquidar seleccionadas» → un importe parcial → Confirmar: saldos coherentes; reintentar el lote no duplica.
6. **§3:** Clientes y Proveedores → «Tienda Pueblo» → «Promover al maestro»; «—» muestra «Pendiente de depuración» con Promover bloqueado.

---

**Principio rector cumplido:** la presentación se personaliza (selección de PDF, secciones A/B/C), pero los hechos económicos, saldos y trazabilidad nunca se alteran para acomodar un reporte. Producción intacta. **PR listo para revisión — no fusionar.**
