# POST_EXECUTION_CERTIFICATION — CP-FIN-FINAL-VALUATION-EXECUTION-009

**Fecha:** 2026-11-16 · **Herramienta:** `scripts/m063-rect-final-certification.mjs` (read-only, re-ejecutable) · **Evidencia:** `evidencias/m063-certificacion-final.json`
**Veredicto: CERTIFICACIÓN FINANCIERA POST-EJECUCIÓN APROBADA — 11/11 PASS**

## 1. Resultados de los controles (R1-R11)

| # | Control | Resultado | Detalle |
|---|---|---|---|
| R1 | Kardex 111/112 | PASS | 21 movimientos · capas de compra uc=1 (2) · salidas uc=0 restantes = **0** |
| R2 | Asientos de la FVC | PASS | **3** (original + RECT-1 + RECT-2), `balance_debe` = 0,00 **exacto en cada uno** |
| R3 | Mayores exactos | PASS | `ACT_INVENTARIO` = **50.381.168,51** (= 201.681.043,51 − 151.299.851 − 24) · `PAS_CXP_PROV` = **55.955.299,57** (= 207.255.150,57 − 151.299.851) · deltas < 0,01 (épsilon numérico) |
| R4 | Valor en libros 111/112 | PASS | kardex valorizado = **30,00** = 10×1 + 20×1 |
| R5 | Gastos | PASS | COGS 5 ventas = **7,00 CUP intacto** (0 nuevo) · GAS_VALES porción 111/112 = **94,00** (88 kardex + 6 RECT-2) · GAS_PERDIDA_INV porción RECT-2 = **18,00** |
| R6 | Idempotencia total | PASS | re-ejecutar S1/S2/S3/T1 tocaría **0 filas** (cláusulas WHERE en 0) |
| R7 | Existencias/precios/WAC | PASS | stocks 10/20 = inventario · WAC 1/1 · precios maestros **2.000 CUP / 1.000 USD sin alteración** · 2 filas `rectificacion` en wac_change_log |
| R8 | Líneas protegidas | PASS | **99/99 idénticas** al snapshot congelado (hash id a id) — incluye las **71 no verificables** y las **4 discrepancias de moneda** |
| R9 | T12 + hardening | PASS | trigger `fin_t12_receipt_annulment_block` habilitado (O) · ACL motor {postgres, service_role} · RLS activa en 9 tablas |
| R10 | Errores y auditoría | PASS | `fin_posting_errors` = **0** (sin nuevos) · auditoría `RECT-PROD` = **14 filas** (2 VALUATION + 1 TOTAL + 2 MOV_UC + 2 ENTRY + 7 MOV_SALIDA) |
| R11 | Actividad viva | PASS | 0 asientos ajenos a la FVC en la ventana de ejecución (separación de alcance confirmada) |

## 2. Único efecto por operación (§8 de la misión)

**RECT-1:** un único asiento (`…-d0b300000001`) por **151.299.851,00** — D `PAS_CXP_PROV` / C `ACT_INVENTARIO`, enlazado inequívocamente por `reversal_of` al asiento original 93bb5da9; `PAS_CXP_PROV` reducido exactamente en la cuantía autorizada; `ACT_INVENTARIO` reducido en la misma cuantía; costos de SKU111/112 corregidos a 1 CUP/u (líneas + capas); precios de venta sin modificación.

**RECT-2:** un único asiento (`…-d0b300000002`) por **24,00** — D `GAS_VALES` 6, D `GAS_PERDIDA_INV` 18, C `ACT_INVENTARIO` 24; sin gastos duplicados (COGS 7 CUP preservado; los 6 vales y 2 cuadres sin contabilización previa verificada en preflight).

**Controles comunes:** partida doble equilibrada (3/3) · T12 activa · idempotencia conservada · `fin_posting_errors` sin errores · RLS y privilegios intactos · inventario coherente (stock=inventario=kardex) · kardex sin movimientos duplicados (21) · WAC coherente (1/1) · historial documental completo (3 asientos de la FVC) · auditoría completa (14 filas por fila).

## 3. Áreas protegidas (§6 de la misión) — SIN ALTERACIÓN

- **71 líneas con costos no verificables** — intactas (R8).
- **4 líneas con discrepancia de moneda** — intactas con valores exactos: SKU 999 (1 CUP@1) · SKU 90 (5 USD@680) · SKU 120 (1 CUP@1) · SKU 92 (1 CUP@1).
- **18 líneas con costos legítimos + 6 sin problema** — intactas (R8).
- **Precios de venta** de SKU111/112 — sin alteración (2.000 CUP / 1.000 USD).
- **COGS existente** — 7,00 CUP intacto, sin duplicación.
- **Vales previamente contabilizados** (VS-148/157/158/165/208/225) — intactos.
- **Transacciones comerciales ajenas** — 0 asientos en la ventana (R11).
- **Restantes productos de la recepción** — sus capas/líneas intactas (hallazgo S3-scope: el filtro de producto PRECISAMENTE evitó tocarlas).
- **Cantidades físicas** — 10/20 u sin cambios (solo se valorizó el costo unitario según el runbook).

**Nota:** la valoración de **40.739.585,00 CUP** de la recepción completa continúa siendo una valoración preliminar, no una certificación definitiva de las 101 líneas.

**Nota contable:** `GAS_PERDIDA_INV` global era 1,00 CUP preexistente (ajeno); tras RECT-2 = 19,00 (1 + 18). El criterio del runbook §7.7 se verifica sobre la porción de la rectificación (18,00 exacta, m063 R5).

## 4. Seguridad (§8 de la misión)

- **T12:** motor v2 (`fin_post_document_annulment` con `ERR_PARTIAL_REVERSAL_PENDING` + `fin_entry_reversal_residual`) y trigger de negocio habilitados — la anulación con residual parcial sigue bloqueada. La RECT-1 crea un estado de reversión PARCIAL del asiento original (residual 40.739.585 pendiente): **la recepción NO debe anularse**; si algún día se anulase, el residual se regulariza por asiento manual con `reversal_of` (addendum T12, hallazgo m052/P7).
- **Hardening:** ACLs del motor/helper/trigger sin cambios (service_role) · RLS activa en las 9 tablas clave.
- **Idempotencia:** 3 capas (ids deterministas + ON CONFLICT DO NOTHING; guards WHERE <> objetivo en los 4 UPDATE; advisory lock por documento; pre-guard de existencia previa) — re-ejecución = 0 filas (R6).
- **Sin secretos:** ningún PAT, token o credencial en este expediente (scan pre-push negativo).
