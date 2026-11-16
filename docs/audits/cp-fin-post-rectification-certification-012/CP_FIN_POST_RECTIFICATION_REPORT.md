# CP-FIN-POST-RECTIFICATION-INDEPENDENT-CERTIFICATION-012
## Certificación independiente de la valoración de inventario y de los estados financieros tras la corrección de FAC-VITALLCONS-001

| Campo | Valor |
|---|---|
| Misión | CP-FIN-POST-RECTIFICATION-INDEPENDENT-CERTIFICATION-012 |
| Fecha de ejecución | 2026-11-16, 21:27–21:45 UTC (16:27–16:45 Havana) |
| Objeto | Recepción `FAC-VITALLCONS-001` · receipt_id `fd9d6c88-5db8-49ea-b185-8bc96cc93e63` · tienda ENERVIDA (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`) |
| Misión previa certificada | CP-FIN-RECEIPT-UNIT-COST-1-CUP-011 · PR #1640 · merge `b4b51e72d` |
| main de referencia | `b4b51e72d` (011) → actual `683a6c466` (PR #1639 merged encima; sin efectos contables) |
| Naturaleza | Auditoría 100 % read-only sobre producción (`wthkddeleylijmonclxg`) |
| Guards activos | CP-INFRA-019 (ALLOW_PROD=read-only) · CP-INFRA-020 (guard anti-escritura por consulta) · T12 (`fin_t12_receipt_annulment_block`, tgenabled=O) · RLS · writers manifest (CHECK-WRITERS OK) |
| Escrituras en producción | **CERO** (verificado por doble vía: m077 --verify 18/18 y snapshot de hashes) |

**Veredicto ejecutivo**: la corrección RECT-011 de la misión 011 está correctamente reflejada en toda la contabilidad de COSTPRO. Las 101 líneas de FAC-VITALLCONS-001 valoran 5.861,50 CUP; la cuenta por pagar neta del documento es exactamente 5.861,50 CUP; los 4 asientos (ORIG, RECT-1, RECT-2, RECT-011) permanecen únicos, balanceados y trazables; inventario operativo y contabilidad concilian; los informes de COSTPRO (RPC `fin_get_balance_sheet`, `fin_get_income_statement`, `fin_get_category_detail`) coinciden uno a uno con las consultas directas del motor; ninguna operación ajena fue alterada. Se documenta **1 hallazgo nuevo** (F-012-1: 5 WAC negativos heredados del modelo de la 011, causa raíz preexistente) **sin corregir**, según el mandato de la misión.

**Batería de verificación: 42 veredictos → 41 PASS + 1 hallazgo clasificado (F-012-1).**

---

## 1. Método y garantías de solo lectura

- Canal único: Management API `POST /v1/projects/wthkddeleylijmonclxg/database/query`, exclusivamente sentencias `SELECT`/`WITH` (64 consultas publicadas literalmente en `READONLY_SQL_QUERIES.sql`).
- Triple guard: `assert-not-production` en modo *read* (CP-INFRA-019), guard de referencia de proyecto, y guard anti-escritura por consulta (CP-INFRA-020). Los 3 scripts (m080, m080b, m080c) están declarados READ-ONLY en `scripts/lib/writers.manifest.json` (CHECK-WRITERS OK).
- Re-ejecución del verificador oficial de la 011 en modo read-only: `m077 --verify` → **18/18 PASS** (V1–V18), incluyendo hash MD5 `id|unit_cost` de los 965 movimientos ajenos idéntico al congelado.
- El kardex es append-only (sin columna `updated_at`): la inmutabilidad se demostró porque no existen capas nuevas de la recepción tras la ventana y porque el hash del kardex de los 101 productos (1.066 movimientos) es **idéntico** al congelado al cierre de la 011 (`def5cd25e2…`).

## 2. Resultado de la recepción (§3 del mandato)

| Control | Resultado |
|---|---|
| Líneas verificadas individualmente | 101/101 |
| Costo unitario / moneda / tasa | 101/101 a 1,00 CUP · CUP · 1 |
| Subtotales = cantidad × 1 CUP | 101/101 · Σqty = **5.861,5000** · Σsubtotal = **5.861,50 CUP** |
| Cabecera | `total_cost` = 5.861,50 · `unpaid` · pagado 0,00 · activa |
| Capas de compra | 101/101 a 1 CUP · valor 5.861,50 · **0 duplicadas** · **0 movimientos de recepción adicionales** (único tipo: `purchase`) |
| SKU999 | `is_service=true` · única capa FVC 4×1 CUP · saldo kardex 0 · sin movimientos nuevos; WAC 443,83 proviene de recepción ajena `44b8f20f` (OUT_OF_SCOPE, preservado) |
| Precios de venta | 0 divergencias contra la matriz congelada m074 (RECT-011 no alteró precios) |
| Atribución temporal | 78 líneas actualizadas en la ventana de misión (1ª pasada 19:59:09Z) · 23 ya conformes sin tocar · **0 tras el fin de ejecución** |

## 3. Conciliación inventario ↔ contabilidad (§4)

- **Integridad del kardex**: 1.066 movimientos de los 101 productos idénticos al congelado (hash `def5cd25e2`); comparado contra el pre-misión, las cantidades son idénticas 1.066/1.066 y el `unit_cost` difiere en **exactamente las 78 capas FVC** de las líneas cambiadas (trazabilidad `SYSTEM_RECT011_MOV_UC`).
- **Cantidades**: `stock_current == Σ kardex` para los 101 productos (0 drift; el drift tienda completa 92/256 es PREEXISTING).
- **Crédito de inventario del asiento (3.678.375,50 CUP) descompuesto y verificado**:
  - A) **3.094.707,00** = variación real del valor contable de los 25 productos recalculados, Σ stock×(WAC_old − WAC_now).
  - B) **583.668,50** = write-off del residuo contable de 3 SKUs **sin existencias** (86/89/110) = Σ fvc_restante×(uc_cup_old − 1): valor de recepción que las salidas históricas (registradas a WAC≈0) nunca imputaron.
- **WAC**: 25/25 `cost_average` == `wac_new` congelado; 76/76 productos no recalculados conservan su WAC anterior. El WAC global **no fue forzado a 1** donde existen otras capas: los únicos 2 productos de los 25 con capas de otras recepciones (SKU31: 110 u; SKU90: 100 u) tienen esas capas a 1,00 CUP, por lo que WAC=1 es coherente con **todas** las capas del producto. Las 66 capas de otras recepciones con uc≠1 (15.207.226,67 CUP) están intactas.
- **Hallazgo F-012-1** (ver sección 8): 5 de los 25 WAC quedaron negativos; documentado sin corregir.

## 4. Conciliación de los asientos correctivos (§5)

Los **4 asientos** del documento (`fin_entries.document_id = FVC`), todos `posted`, sin duplicados, sin anulaciones:

| # | Asiento | Tipo/Evento | posted_at (UTC) | reversal_of | Movimientos | Importe |
|---|---|---|---|---|---|---|
| 1 | ORIG `93bb5da9…` | RECEPCION / reconocimiento | 2026-11-14 01:51:20 | — | 2 | D ACT_INVENTARIO / C PAS_CXP_PROV **192.039.436,00** |
| 2 | RECT-1 `7ec90009…0001` | RECEPCION / ajuste_manual | 2026-11-16 16:06:58 | ORIG | 2 | D CXP / C INV **151.299.851,00** |
| 3 | RECT-2 `7ec90009…0002` | AJUSTE_INVENTARIO / ajuste_manual | 2026-11-16 16:07:48 | — | 3 | C INV **24,00** / D PÉRDIDA 18,00 + D VALES 6,00 |
| 4 | RECT-011 `7ec9000b…0001` | AJUSTE_INVENTARIO / reconocimiento | 2026-11-16 20:03:05 | ORIG | 5 | D CXP **40.733.723,50** / C INV 3.678.375,50 + COGS 21.450.370,50 + VALES 5.913.947,50 + PÉRDIDA 9.691.030,00 |

- **Identidad de la cadena**: 192.039.436,00 − 151.299.851,00 − 40.733.723,50 = **5.861,50** = CXP neta del documento = total de la recepción. Exacta al centavo.
- Los 4 asientos están balanceados en `amount_cup` y `amount` (D−C = 0,00).
- **No son anulaciones totales**: el asiento original permanece conservado; RECT-1 y RECT-011 son correcciones parciales con `reversal_of` referenciando el original; T12 (bloqueo de anulación de recepciones) activo. 0 asientos de anulación/reversal/cancel.
- **RECT-011 contabilizada UNA sola vez**: 1 entrada · 183 filas de auditoría con trace `RECT011-PROD` (78 líneas + 78 capas + 25 WAC + 1 total + 1 asiento) · `wac_change_log` con exactamente 25 filas de misión y 0 ajenas desde la ventana · idempotencia verificada (re-ejecución tocaría 0 filas). Historial de ejecución documentado: 1ª pasada (19:59:09–14Z) aplicó lotes A/B/C y abortó atómicamente el lote D por la colisión `uq_fin_entries_doc_event`; 2ª pasada (20:02:56–20:03:05Z) completa — los conteos de auditoría lo reflejan sin duplicaciones.
- **Sin doble reconocimiento**: créditos únicos de COGS/VALES/PÉRDIDA; RECT-2 único; RECT-1/RECT-2/RECT-011 con importes exactos (151.299.851,00 / 24,00 / 40.733.723,50).
- Auditoría de la misión 009 (trace `RECT-PROD`): 14 filas, intacta.

## 5. Conciliación de cuentas financieras (§6) — cadena de corte por libro mayor

Saldo (naturaleza contable) reconstruido a partir del libro mayor (2.004 movimientos de las 5 cuentas clave), con corte por `created_at`:

| Momento (UTC) | ACT_INVENTARIO (ENERVIDA) | PAS_CXP_PROV (ENERVIDA) | Otras tiendas (constante) | ACT global | CXP global |
|---|---:|---:|---:|---:|---:|
| Tras RECT-2 · 16:07:48 | 38.121.388,34 | 43.695.519,40 | 12.259.780,17 | **50.381.168,51** ✓ | **55.955.299,57** ✓ |
| Ventas orgánicas 18:05–18:50 | −7.951,60 | 0,00 | 0,00 | −7.951,60 | 0,00 |
| RECT-011 · 20:03:05 | −3.678.375,50 | −40.733.723,50 | 0,00 | −3.678.375,50 | −40.733.723,50 |
| **Saldo actual** | **34.435.061,24** | **2.961.795,90** | 12.259.780,17 | **46.694.841,41** | **15.221.576,07** |

- Los saldos al corte RECT-2 **+ otras tiendas** reproducen exactamente la certificación m063 de la misión 009 (50.381.168,51 / 55.955.299,57). Aclaración de alcance: esas certificaciones se midieron **globalmente** (3 tiendas: ENERVIDA + `43a4dabc…` 12.258.163,67 + `899d2503…` 1.616,50); el presente informe separa ENERVIDA del resto, que permanece constante y sin movimientos desde la ventana (integridad de otras tiendas).
- La reducción de la cuenta por pagar corresponde **exclusivamente** a FAC-VITALLCONS-001: CXP por documento = FVC 5.861,50 + resto 2.955.934,40 = 2.961.795,90 (Σ cuadra con el saldo). Las obligaciones de otras recepciones están intactas (0 entradas nuevas ajenas desde el corte; la única actividad post-corrección es un servicio recibido con su pago por 900 CUP a las 21:06Z, que no toca CXP de recepciones ni el FVC).
- Cuentas de servicios: GAS_SERVICIOS 59.775,00 (incluye 900 orgánico 21:06Z) · PAS_SERV_PEND 0,00 neto (900 C / 900 D del pago).

## 6. Estados financieros (§7) — control principal

Se verificaron los reportes que COSTPRO **tiene implementados** (código leído: `src/app/api/fin/statements/route.ts` → RPCs del motor) y se contrastaron con consultas directas:

**A. Balance General** (`fin_get_balance_sheet`, as_of 2026-11-17): activos **61.249.431,25** · pasivos **2.961.795,90** · patrimonio_movimientos 0,00 · resultado acumulado **58.287.635,35** · patrimonio total 58.287.635,35 · **ecuación: diferencia 0,00 → equilibrado**. ACT_INVENTARIO en el balance == cadena de corte (34.435.061,24).

**B. Estado de Resultados** (`fin_get_income_statement`): período 2026-11-01→17 refleja solo la actividad orgánica (ingresos 125.950,00 de 3 ventas; COGS 7.951,60). Los efectos de la corrección llevan `economic_date = 2026-07-01` (fecha económica del documento original) y por tanto caen en el período de julio; el PyG acumulado por fecha económica los contiene íntegros (verificado categoría a categoría contra agregación directa). Nota F-012-4.

**C. Libro Mayor**: las 5 cuentas clave concilian: movimientos, débitos, créditos y saldo final (ACT_INVENTARIO 1.000 movs → 34.435.061,24; PAS_CXP_PROV 91 → 2.961.795,90; GAS_COSTO_VENTAS 710; GAS_VALES 200; GAS_PERDIDA_INV 3). `fin_get_category_detail` (reporte de la app) devuelve totales idénticos al motor directo (53 y 6 movimientos en el período).

**D. Reportes de inventario**: valoración por SKU, WAC y capas verificadas en `INVENTORY_VALUATION_RECONCILIATION.xlsx` (101 productos; desglose del crédito INV; 25 WAC; hallazgo F-012-1). No existe vista dedicada adicional en la app; la valoración operativa se apoya en `products.stock_current`/`cost_average` y kardex.

**E. Reportes de cuentas por pagar**: Σ recepciones activas unpaid (89 documentos) = **2.961.795,90** == saldo CXP del libro mayor (exacto). FVC: 5.861,50 unpaid, 0 pagos, sin vencimiento registrado; detalle por proveedor y vencimientos en `ACCOUNTS_PAYABLE_RECONCILIATION.xlsx`.

**Diferencia entre informes COSTPRO y motor contable: NINGUNA** (13 categorías con saldo idénticas una a una). Observación preexistente: la tienda no tiene asiento de apertura (`completitud.sin_apertura = true`; primer documento 2026-07-01) — no atribuible a la corrección.

## 7. Verificación temporal (§8) e integridad fuera de alcance (§9)

- Las 3 ventas orgánicas de 18:05–18:50Z (previas a la corrección) usaron el `cost_at_sale` = `cost_average` vigente en su momento (SKU28 5.000; SKU185 2.000; SKU19 200; SKU17/111/142/157 a 1 CUP — SKU111 ya estaba a 1 por RECT-1). **No se revalorizó retroactivamente ninguna operación ajena** (hash de 965 movimientos ajenos intacto).
- Tras la corrección no hay consumos de los 101 productos (0 ventas/vales/movimientos; horario nocturno); las futuras salidas usarán el `cost_average` actualizado (mecanismo del motor verificado en T1).
- 0 devoluciones/ajustes nuevos en la ventana; kardex idéntico al congelado.
- Integridad: 0 cabeceras/líneas de otras recepciones tocadas · 0 productos ajenos · 0 movimientos de stock nuevos (todas las tiendas) · 0 asientos en otras tiendas · 66 capas uc≠1 preservadas · 0 WAC-log ajenos · precios de venta intactos · pagos FVC 0.
- Auditoría en ventana: 185 filas = **183 RECT011-PROD** + 2 orgánicas (21:06Z: `SERVICE_CREATED` y `SUPPLIER_PAYMENT_REGISTERED` — servicio SRV-20261116-00125 «Comisión», Tienda Pueblo, 900 CUP, pagado; OUT_OF_SCOPE legítimo).
- Tiempos: BD en UTC; posted_at de RECT-011 2026-11-16T20:03:05Z = 15:03 Havana; informes por `economic_date`.

## 8. Hallazgos y clasificación (§11)

| ID | Hallazgo | Clasificación | Cuantificación | Acción |
|---|---|---|---|---|
| **F-012-1** | 5 de los 25 WAC recalculados por RECT-011 quedaron **negativos**: SKU117 −2.175.998,00 (1 u), SKU83 −122.398,00 (2 u), SKU90 −78.176,25 (3 u), SKU40 −665,86 (3 u), SKU37 −1,00 (25 u) | **POST_EXECUTION** (artefacto del modelo m074/loteC) con causa raíz **PREEXISTING** | Valor «contable» de esas existencias: **−2.657.345,32 CUP**. Mecanismo: el crédito de inventario de esos productos (2.657.375,00) excedió su valor registrado (stock×wac_old ≈ 29,68) porque su WAC preexistente (0,14–1,00 CUP) nunca reflejó la recepción (salidas históricas a WAC≈0 con compras de hasta 2.176.000 CUP/u). El asiento permanece balanceado y la asignación por línea es exacta (Σ créditos = Σ delta = 40.733.723,50); el efecto queda absorbido dentro del crédito global de 3.678.375,50 | **No corregido** (solo lectura). Repro: `SELECT p.sku, p.cost_average, p.stock_current FROM products p WHERE store_id='5e6fe821…' AND is_service=false AND cost_average<0`. Requiere misión posterior autorizada (redistribuir el residuo a GAS_PERDIDA_INV o recalcular desde capas a 1 CUP con asiento compensado) |
| F-012-2 | Drift preexistente stock↔kardex a nivel tienda (92/256 productos); valoración de campo de tienda negativa | PREEXISTING | Dominada por F-012-1 | Gobernanza de datos; los 101 productos tienen drift 0 |
| F-012-3 | Bases de valoración divergentes (kardex valorado 142.165.891,25 ≠ ACT contable 34.435.061,24) | PREEXISTING | Documentado en misión 010 (bases A/B/C) | No reabrir (protegido) |
| F-012-4 | Fecha económica 2026-07-01 de ORIG/RECT-1/RECT-011 | PREEXISTING | El PyG de noviembre no incluye la corrección; el Balance sí | Informativo |
| F-012-5 | Venta USD con `amount_cup == amount` en el asiento | OUT_OF_SCOPE | Venta ajena al FVC (18:08Z) | Referencia para misión de semántica USD |

Elementos preexistentes **protegidos y no reabiertos** (mandato §1): 71 líneas no verificables (E), 4 discrepancias de moneda, Δ −1,01 de redondeo en vales (VS-000187/VS-000209), bases COGS A/B/C, WAC 443,83 de SKU999 por recepción ajena.

## 9. Criterios de aceptación (§13)

| Criterio | Estado | Evidencia |
|---|---|---|
| Las 101 líneas siguen a 1 CUP | ✅ PASS | R1 (101/101 · Σ 5.861,50) |
| Total de recepción: 5.861,50 CUP | ✅ PASS | R2 + A4 (cadena al centavo) |
| Inventario operativo y contable conciliados | ✅ PASS | I1–I4 (hashes, desglose A/B del crédito INV) |
| WAC correctamente calculado | ✅ PASS | I5/I6 (25/25 conformes; sin forzar a 1 con capas ajenas) — con la salvedad documentada en F-012-1 |
| RECT-1, RECT-2 y RECT-011 sin duplicaciones | ✅ PASS | A5–A7 (1 entrada por asiento; audit 183+14) |
| Cuenta por pagar conciliada | ✅ PASS | K5 (FVC 5.861,50; Σ docs = saldo) |
| COGS, vales y pérdidas conciliados | ✅ PASS | A8 + libro mayor |
| Balance General coherente | ✅ PASS | E1/E2 (ecuación 0,00) |
| Estado de Resultados coherente | ✅ PASS | E4 + PyG acumulado |
| Libro Mayor conciliado | ✅ PASS | E4 (2.004 movimientos; 5 cuentas) |
| Reportes de COSTPRO coinciden con el motor contable | ✅ PASS | E1 (13 categorías idénticas; 0 diferencias) |
| Otras recepciones y operaciones permanecen intactas | ✅ PASS | N1/N5/N7/N9 (0 tocados; actividad orgánica atribuida) |
| Producción sin escrituras | ✅ PASS | Guards CP-INFRA-019/020 · m077 --verify · hashes |
| Expediente completo e integrado | ✅ PASS | Este expediente (10 entregables) |

## 10. Publicación (§12/§H)

| Ítem | Valor |
|---|---|
| Rama | `docs/cp-fin-post-rectification-cert-012-20261116` (desde `main` = `683a6c466`) |
| Commits | 1) scripts m080/m080b/m080c/m081/m082/m083 + writers manifest · 2) expediente completo · 3) cierre (worklog + PR + hashes) |
| PR | **#1642** — https://github.com/Nardian90/Costpro/pull/1642 (head `e956f59d0`) |
| Checks | CI · Test Coverage · E2E Aislado · Security Audit · Vercel |
| Merge | Por el flujo habitual cuando los controles estén verdes |
| Expediente | `docs/audits/cp-fin-post-rectification-certification-012/` (10 entregables, SHA256SUMS) |

## 11. Conclusión

La corrección de la misión 011 está **correctamente reflejada en el conjunto de la contabilidad de COSTPRO**: recepción valorada a 5.861,50 CUP con CXP neta idéntica; asientos únicos, balanceados y trazables; inventario operativo y contable conciliados con el crédito de inventario descompuesto y verificado; cuentas de gasto con los créditos compensatorios exactos; Balance cuadrado con diferencia 0,00; informes de la app idénticos al motor; y cero efectos sobre recepciones, capas, proveedores, tiendas y precios ajenos. El único defecto nuevo identificado (F-012-1, cinco WAC negativos de causa raíz preexistente) está cuantificado, con consulta reproducible, y queda pendiente de decisión del propietario para una corrección futura autorizada — esta misión, de solo lectura, no lo modificó.
