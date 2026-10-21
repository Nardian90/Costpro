# CERTIFICACIÓN INTEGRAL DE INTEGRIDAD CONTABLE — REPORTE ENTREGA

**Fecha:** 2026-10-21 · **Rama:** `fix/submayor-trazabilidad-excel-entrega` · **PR:** #1446 (apilado sobre #1440)
**Ruta funcional auditada:** `Inicio → OPERACIÓN → Ventas → Reporte Entrega`

**Estado final: `CERTIFICADO CON LIMITACIONES`** — 16/16 escenarios ejecutables PASS (0 FAIL); 4 escenarios NO EJECUTADOS por limitaciones del modelo documentadas (vuelto cross-moneda ×3, pago insuficiente fuera de capa) con propuesta de cambio mínimo.

---

## 1. Metodología (cadena de verificación = cadena de producción)

La certificación reproduce EXACTAMENTE la ruta del dato en producción:

| Capa | Mecanismo de prueba | Evidencia |
|---|---|---|
| Tablas de negocio | PostgreSQL 18 **aislado** (embedded-postgres, puerto 5437, desechable, cero residuo) + fixture con la nulabilidad REAL del esquema vivo + columnas V2 de `transaction_items` | `pgtest/cert-fixture.sql` |
| Fórmulas RPC | Migración `20261021120000` (v2.23.0 — **estado VIVO actual de la BD**, aplicada hoy) ejecutada sobre el fixture; `get_cash_report`, `create_cash_flow_document`, `close_cash_shift`, `get_cash_shift_expected` llamados como `service_role` | `pgtest/run-cert-reporte.mjs` |
| Enriquecimiento TS | **Código REAL del repo**: `collection-currency.ts` (reconstructTxCollections + accumulateSalesSplit + buildSalesGroups) — las mismas funciones de `/api/cash-report` | `pgtest/run-cert-ts.ts` |
| Fórmula única | `summary.ts::computeDailySummary` v2.23.0 — fuente única de vista, PDF y Excel (paridad probada por `cash-report-view.test.tsx`, `cash-report-pdf-signatures.test.tsx`, `cash-report-excel.test.tsx`) | idem |
| Documentos | PDF: spies jsPDF (tests existentes) · Excel: libro real inspeccionado con openpyxl | `audit-evidence/20261021-cert-reporte-entrega/` |

La paridad UI/PDF/Excel/API es **estructural**: los cuatro consumen el MISMO `CashReport` (RPC) + el MISMO `computeDailySummary` — no existen segundas lógicas (auditoría 2026-10, docs/auditoria-reporte-entrega.md). Producción INTACTA: solo lecturas autorizadas; todas las escrituras de prueba en PG aislado.

## 2. Matriz de resultados (16 PASS · 0 FAIL · 4 NO EJECUTADOS)

| ID | Escenario | Esperado | Obtenido | Estado |
|---|---|---|---|---|
| F-01 | Fondo inicial 50.000 CUP + 100 USD, sin ventas | esperado CUP 50.000 / USD 100 | CUP 50.000 / USD 100 · docs IE creados por el RPC real (una sola escritura del dinero) | **PASS** |
| F-01b | Fondo cero | 0 / 0 | 0 / 0 (nada inventado) | **PASS** |
| F-01c | Fondo solo CUP | CUP 30.000 / USD 0 | 30.000 / 0 (moneda ausente = 0) | **PASS** |
| M-01 | Venta 40 USD pagada 20 USD + 20.000 CUP | split CUP.cash 20.000 · USD.cash 20 · venta 40 USD-eq SIN doble conteo | exacto · ventaTotal 40 USD-eq · 20.000 CUP ≠ 20.000 USD (sin confusión) | **PASS** |
| M-04 | Venta íntegra CUP | CUP 5.000, sin USD ficticio | 5.000 / 0 | **PASS** |
| M-05 | Venta íntegra USD (efectivo USD) | USD 30, sin CUP ficticio | 0 / 30 | **PASS** |
| M-06 | Mixto exacto cash+transfer | efectivo CUP 5.000; transfer 3.000 NO toca efectivo | 5.000 / 0 · transfer 3.000 aparte | **PASS** |
| M-08 | Vuelto misma moneda (pool neto + incidencia de sobrepago documentada) | cajón retiene 5.000 | 5.000 / 0 | **PASS** |
| M-12 | Dos ventas mixtas consecutivas | sin mezcla entre documentos | CUP 25.000 · USD 20 · transfer 3.000 | **PASS** |
| M-13 | Anulación autorizada (venta voided) | excluida del reporte; historial intacto | excluida (RPC filtra `status != 'voided'`) · fila conservada | **PASS** |
| M-14 | Devolución reembolsada EN EFECTIVO 300 CUP | esperado −300 (regla P1: salió dinero del cajón) | 10.000 − 300 = 9.700 | **PASS** |
| M-15 | Reembolso por TRANSFER 500 CUP | voucher INFORMATIVO (no salió efectivo) | esperado INTACTO · reembolsosVoucher 500 visible | **PASS** |
| M-17 | Devolución parcial del fondo (20.000 de 50.000) | egresosCaja 20.000 | 30.000 | **PASS** |
| M-18 | Tasa histórica 800 ≠ vigente 1.000 | amount_cup GENERADO por fila con la tasa del cobro; USD 100 nativos | USD 100 · canónico 80.000 con tasa 800 (jamás la vigente) | **PASS** |
| M-19 | Turno completo: fondo + ventas mixtas + egreso + reembolso | CUP 66.700 · USD 30 | 66.700 / 30 · ver §4-observación sobre el arqueo canónico | **PASS** |
| M-20 | Reporte ×2 mismo período | mismos datos, cero mutaciones | JSON idéntico · ledger intacto (read-only) | **PASS** |
| ISO | Parámetros de otra tienda | sin fuga | venta 9.999 de la otra tienda NO aparece | **PASS** |
| M-02 | Vuelto 10.000 CUP por cobro de 30 USD | — | **NO EJECUTADO — LIMITACIÓN DEL MODELO** (§3) | — |
| M-03B | Vuelto de 5 USD entregado en CUP | — | **NO EJECUTADO — LIMITACIÓN DEL MODELO** | — |
| M-07 | Pago insuficiente | — | **NO EJECUTADO — FUERA DE LA CAPA DEL REPORTE** (validación del POS) | — |
| M-11 | Mixto CUP+USD con vuelto | — | **NO EJECUTADO — LIMITACIÓN (vuelto)** | — |

Artefactos: `audit-evidence/20261021-cert-reporte-entrega/cert-reporte-input.json` (filas + RPC crudo por escenario) y `cert-reporte-results.json` (matriz completa).

## 3. Limitación del modelo: VUELTTO EN MONEDA DISTINTA (M-02/M-03B/M-11)

**Causa demostrada:** `transactions` no posee campos de vuelto ni de moneda de cambio. Los pools (`cash_amount/transfer_amount/zelle_amount`) registran lo que entra al cajón en CUP canónico y `payment_incidents.received_cup` documenta sobrepagos en CUP. Un vuelto entregado en CUP por una cobranza en USD **no es representable** sin anotación manual — y el brief prohíbe simularlo («No simules una operación correcta mediante una anotación manual»).

**Cambio mínimo propuesto (requiere decisión del propietario):**
1. `payment_transactions` con `ref_type='change'`, `direction='out'`, moneda REAL del vuelto (aprovecha el ledger existente: una fila física por moneda), o bien columnas `change_amount`/`change_currency` en `transactions`.
2. Término `change_out` por moneda en las fórmulas v2.24 (close_cash_shift + espejos + reporte).
3. Fila «Vuelto entregado» en Reporte Entrega (UI/PDF/Excel — la hoja USD resta los vueltos USD; la CUP los CUP).

Hasta implementarse, la operación REAL equivalente que el sistema soporta hoy: cobrar exacto o registrar el sobrepago como incidencia (pool neto + `payment_incidents`), certificada en M-08.

## 4. Observación (no defecto): bases de conciliación arqueo vs reporte

M-19 evidenció que el **arqueo** (`close_cash_shift`/`get_cash_shift_expected`) valora el efectivo en **CUP canónico** (la venta de 30 USD entra como `cash_sales` 30.000 a la tasa del cobro), mientras el **Reporte Entrega** concilia **por moneda** (30 USD siguen siendo USD físicos en su hoja). Ambas bases son internamente coherentes: el cajero declara CUP-canónico en el arqueo (96.700 → diferencia 0) y entrega 30 USD por la hoja USD del reporte. Es una diferencia de POLÍTICA entre documentos, heredada del diseño; se documenta para decisión del propietario (¿unificar por moneda en el arqueo?).

## 5. Conciliaciones exigidas por el brief (fórmulas verificadas)

- **Física por moneda** (Reporte): `esperado = ventasCash + otIngresosCash + ajustes(+) + ingresosCaja − comisionesCash − serviciosRecibidosCash − recibosProveedoresCash − ajustes(−) − egresosCaja − reembolsosCash` — verificada en los 16 escenarios, por moneda, sin sumar CUP+USD jamás.
- **Económica con tipo de cambio** (M-01): recibido 40 USD-eq = venta 40 USD-eq → diferencia 0; la tasa aplicada es la del cobro (M-18: 800 histórica, no la vigente).
- **Fondo inicial**: identificado una sola vez como `ingresosCaja` (documento IE) — jamás como venta; sin doble conteo con el mecanismo de apertura (M-17/F-01).
- **Anulaciones/devoluciones**: reverso trazable (fila contra en el ledger + `devolutions`); el original no se borra (M-13/M-14).
- **Repetición** (M-20): el reporte no crea ni duplica movimientos.

## 6. Parte A y Parte B de la misión doble (mismo PR #1446)

- **Parte A — submayor SKU 15:** `CORREGIDA Y VALIDADA`. Causa raíz demostrada en la BD viva (balance_after encadenado por ORDEN DE INSERCIÓN vs created_at retro-datables → saltos imposibles 41−1→55); corrección §34-bis (saldo derivado cronológico desde el origen); datos ÍNTEGROS (Σ 38 movimientos = 66 = inventory.quantity = stock_current — cero históricos modificados); 38/38 pruebas incl. regresión con los 15 movimientos REALES del período.
- **Parte B — Excel:** `IMPLEMENTADA Y VALIDADA`. .xlsx real (xlsx-js-style + JSZip post-proceso), fiel al PDF (misma fuente/fórmulas/helpers), 16 pruebas + evidencia openpyxl (freeze/landscape/autofiltro/numéricos) + botón con guardia de reporte aplicado.

## 7. Riesgos residuales y casos no ejecutados

1. **Vuelto cross-moneda** (M-02/M-03B/M-11): limitación del modelo (§3) — propuesta elaborada, pendiente de decisión.
2. **M-07**: pertenece a la capa POS (create_sale_v2), no al reporte.
3. **Validación visual en navegador** del submayor corregido y del botón Excel: cubierta por pruebas de componente/lógica con datos reales; queda pendiente revisión humana en la preview del PR.
4. **Política arqueo vs reporte** (§4): decisión de negocio pendiente.
5. Escenarios de CONCURRENCIA real (dos cajeros simultáneos): fuera del alcance de esta certificación (la batería previa de creación de documentos ya cubre idempotencia/advisory locks).
