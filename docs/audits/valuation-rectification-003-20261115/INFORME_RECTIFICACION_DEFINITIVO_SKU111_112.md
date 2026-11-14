# INFORME DE RECTIFICACIÓN — SKU 111 y SKU 112 (v3, definitiva)
## CP-FIN-VALUATION-RECTIFICATION-003 · Rectificación histórica controlada de FAC-VITALLCONS-001
### Recepción FAC-VITALLCONS-001 (fd9d6c88-5db8-49ea-b185-8bc96cc93e63) · ENERVIDA-VITALLCONS · Proveedor Vitallcons

**Fecha del informe:** 2026-11-15
**Misiones previas encadenadas:** CP-INVENTORY-TRACEABILITY-RECONCILIATION-001 · CP-FIN-VALUATION-CORRECTION-002
**Alcance de esta misión:** análisis y demostración read-only sobre producción + prototipo E2E aislado EXTENDIDO.
**Producción INTACTA** (re-verificada al cierre; ver §8).

---

## 1. Resumen ejecutivo

La decisión económica del propietario (§1 de la misión) confirma: los valores **2.500 (SKU 111)** y
**1.000 (SKU 112)** eran **precios de venta en CUP** importados erróneamente como costos USD; el costo
real de adquisición es **1 CUP por unidad**. La tasa 680 queda aprobada para las 20 líneas USD auténticas.

Esta misión re-verificó TODO el estado desde cero (sandbox reciclado; regla de resiliencia 11f), reconstruyó
la cronología **por unidad** de las **119 salidas netas**, produjo la matriz económica completa de los
**101 productos**, **comprobó la liquidación real del proveedor** (exigencia §6), refinó el diseño contable
con esa evidencia y lo **demostró en BD E2E aislada con TODAS las pruebas PASS** (V1-V12, idempotencia,
rollback byte a byte, re-aplicación, net delta 0).

| Concepto | SKU 111 | SKU 112 | Conjunto |
|---|---|---|---|
| Producto | Grapas plásticas con clavo de acero | Grapas metálicas 3/4 con tornillo roscante | — |
| Cantidad recibida | 49 u | 100 u | 149 u |
| Valor atribuido antes (defectuoso) | 83.300.000,00 CUP | 68.000.000,00 CUP | 151.300.000,00 CUP |
| Valor correcto (49×1 · 100×1) | 49,00 CUP | 100,00 CUP | 149,00 CUP |
| **Exceso a revertir** | **83.299.951,00 CUP** | **67.999.900,00 CUP** | **151.299.851,00 CUP** |
| Salidas netas demostradas | 39 u (4 ventas + 34 vales + 1 ajuste) | 80 u (3 ventas + 60 vales netos + 17 ajustes) | **119 u** |
| Existencia actual (conciliada) | 10 u | 20 u | 30 u = 30 CUP de valor en libros |

**Total corregido de la recepción: 40.739.585,00 CUP (PRELIMINAR** — subsisten 71 líneas no verificables
y 4 discrepancias de moneda pendientes del propietario).

---

## 2. Fase I — Estado congelado (verificación directa, read-only)

Snapshot reproducible con hashes SHA-256 por sección (`m045-faseI-snapshot.json`, 27 secciones;
`m046-faseI-complemento.json`, 11 secciones). Puntos clave verificados:

| Elemento | Estado verificado |
|---|---|
| Recepción original | 101 líneas; `total_cost` 192.039.436,00 CUP **cuadra al céntimo** con el recomputo línea a línea (q × uc × tasa) |
| Asiento CP-FIN existente | `93bb5da9` (RECEPCION/reconocimiento, posted 2026-11-14 01:51:20, econ. 2026-07-01): D ACT_INVENTARIO 192.039.436 / C PAS_CXP_PROV 192.039.436. **Sin asientos de reversión** (`reversal_of` → 0 filas) |
| Kardex SKU 111/112 | 21 movimientos totales (2 compras + 18 salidas + 1 reversión); todos del almacén ENERVIDA |
| WAC / `wac_change_log` | `cost_average = 1` en ambos (GATE16 2026-10-06 SKU 112 · TAREA-2B 2026-10-07 SKU 111, evento `wac_correction` 0→1) |
| Ventas | 5 transacciones POS v2 (1 con FAC-004479-2026, cliente «Cliente Vitallcons»): 7 unidades, precios 2.500/2.000/1.500/2.000/2.000 CUP |
| Vales | 10 vales (VS-000037/138/139/148/157/158/165/208/223/225) + 1 reversión (VS-000223, status=reversed) |
| Ajustes | 2 movimientos «Cuadre importación ENERVIDA» (2026-08-18, Δ−1 y Δ−17, sin documento ni reference_id) |
| Devoluciones | 0 de estos SKU |
| Existencias | `stock_current` = `inventory.quantity` = 10 / 20 ✓ |
| **PAS_CXP_PROV / liquidación** | **`payment_status='unpaid'`, `paid_amount=0`, `paid_at=null`, vencida 2026-07-31; 0 `payment_transactions` de la FVC o del proveedor; 0 filas en `v_purchase_orders_cxp`**. Mayor: solo reconocimientos (98 recepciones, 207.256.110,57) y 1 anulación (960) — no existe PAGO_PROVEEDOR. **La deuda está 100% pendiente** |
| PR-2 backups | 0 receipts / 0 items de estos SKU (la FVC es posterior al backup 2026-08-09/10) |
| Backfill | NO se re-ejecutó (prohibición §3; el de m020/m022 ya corrió en su momento) |

---

## 3. Fase II — Cronología de las 119 unidades salidas (exigencia §4)

Cronología por unidad con documento, fecha, cantidad, tipo, costo de origen, costo contabilizado y costo
correcto: `CRONOLOGIA_119_SALIDAS_SKU111_112.xlsx` + `m047-faseII-cronologia.json`.

### SKU 111 — 49 recibidas, 10 actuales, 39 salidas demostradas

| # | Fecha | Tipo | Documento | Cant. | uc kardex | Valor reg. | Correcto | Estado contable |
|---|---|---|---|---|---|---|---|---|
| 1 | 2026-07-24 | Venta | FAC-004479-2026 (tx 99d8993f) | 1 | 0 | 0 | 1 | MOTOR ya contabilizó COGS 1 CUP ✓ |
| 2 | 2026-08-18 | Ajuste | Cuadre importación Δ−1 | 1 | 0 | 0 | 1 | sin asiento (brecha) |
| 3 | 2026-10-04 | Venta | Venta POS v2 (tx d939ea06) | 1 | 0 | 0 | 1 | MOTOR ya contabilizó COGS 1 CUP ✓ |
| 4 | 2026-10-05 | Vale | VS-000139-2026 (ENERVIDA) | 1 | 0 | 0 | 1 | sin asiento (brecha) |
| 5 | 2026-10-09 | Vale | VS-000148-2026 (OT/Ferro) | 1 | 1 | 1 | 1 | asiento GAS_VALES 1 ✓ |
| 6 | 2026-10-10 | Vale | VS-000158-2026 (Transf. Puerto Padre) | 20 | 1 | 20 | 20 | asiento GAS_VALES 20 ✓ |
| 7 | 2026-10-14 | Venta | Venta POS v2 (tx 4c76a1a1) | 1 | 1 | 1 | 1 | MOTOR ya contabilizó COGS 1 CUP ✓ |
| 8 | 2026-10-22 | Venta | Venta POS v2 (tx a0d9f44d) | 1 | 1 | 1 | 1 | MOTOR ya contabilizó COGS 1 CUP ✓ |
| 9 | 2026-10-28 | Vale | VS-000208-2026 (Transf. Tienda Ferrocarril) | 12 | 1 | 12 | 12 | asiento GAS_VALES 12 ✓ (parte del vale) |
| Σ | | | | **39** | | **35** | **39** | subvaluación kardex: 4 u a uc=0 |

Identidad: **49 − 39 = 10 ✓** (10 u actuales = `stock_current` = `inventory`).

### SKU 112 — 100 recibidas, 20 actuales, 80 salidas netas demostradas

| # | Fecha | Tipo | Documento | Cant. | uc kardex | Valor reg. | Correcto | Estado contable |
|---|---|---|---|---|---|---|---|---|
| 1 | 2026-08-18 | Ajuste | Cuadre importación Δ−17 | 17 | 0 | 0 | 17 | sin asiento (brecha) |
| 2 | 2026-09-19 | Vale | VS-000037-2026 (Orden/47) | 4 | 0 | 0 | 4 | sin asiento (brecha) |
| 3 | 2026-10-05 | Vale | VS-000138-2026 (ENERVIDA) | 1 | 0 | 0 | 1 | sin asiento (brecha) |
| 4 | 2026-10-05 | Venta | Venta POS v2 (tx acc2b470) | 3 | 1 | 3 | 3 | MOTOR ya contabilizó COGS 3 CUP ✓ |
| 5 | 2026-10-10 | Vale | VS-000157-2026 (Transf. Puerto Padre) | 20 | 1 | 20 | 20 | asiento GAS_VALES 20 ✓ |
| 6 | 2026-10-10 | Vale | VS-000165-2026 (OT/Ferro) | 10 | 1 | 10 | 10 | asiento GAS_VALES 10 ✓ |
| 7 | 2026-10-28 | Vale | VS-000208-2026 (Transf. Tienda Ferrocarril) | 20 | 1 | 20 | 20 | asiento GAS_VALES 20 ✓ (parte del vale) |
| 8 | 2026-11-07 | Vale | VS-000223-2026 (Ferro, vale 38-26, Antonio Ye Batista) | 1 | 1 | 1 | 1 | **ANULADO**: vale reversed; salida y reingreso sin asiento → neto 0 |
| — | 2026-11-07 | **REINGRESO** | Reversión VS-000223 | +1 | 1 | +1 | +1 | (se cancela con la fila anterior) |
| 9 | 2026-11-07 | Vale | VS-000225-2026 (Ferro, vale 38-26) | 5 | 1 | 5 | 5 | asiento GAS_VALES 5 ✓ |
| Σ neto | | | | **80** | | **59** | **80** | subvaluación kardex: 22 u a uc=0 |

Identidad: **100 − 81 + 1 = 20 ✓**.

### Consolidado de las 119 salidas netas — distribución demostrada

| Tipo | Movimientos | Unidades brutas | Reingreso | Netas | Valor correcto | Valor kardex reg. | Valor mayor reg. |
|---|---|---|---|---|---|---|---|
| Ventas (COGS) | 5 | 7 | — | **7** | 7 CUP | 5 CUP | **7 CUP (motor, ya correcto)** |
| Vales | 11 | 95 | −1 | **94** | 94 CUP | 89 CUP | 88 CUP (VS-223 sin asiento, neto 0) |
| Ajustes | 2 | 18 | — | **18** | 18 CUP | 0 CUP | 0 CUP |
| **TOTAL** | **18** | **120** | **−1** | **119** | **119 CUP** | **94 CUP** | **95 CUP** |

**Respuesta a la exigencia §4 («no aceptar un resumen de COGS de 7 CUP y salidas subvaluadas de 26 CUP
sin demostrar cómo se distribuyen las 119 unidades»):** la tabla anterior y el xlsx por unidad demuestran
la distribución completa. Las 26 unidades con uc=0 se distribuyen: **2 ventas** (07-24 y 10-04, SKU 111),
**6 u de vales** (VS-000037: 4, VS-000138: 1, VS-000139: 1) y **18 u de ajustes** (Δ−1 y Δ−17). De ellas,
las 2 ventas YA tienen COGS correcto en el mayor (motor a `cost_average=1`); las 24 restantes nunca
llegaron al mayor.

**Movimientos de stock sin salida documental correspondiente (exigencia §4, explicados):**
únicamente los 2 ajustes de cuadre (18 u): movimientos de regularización de la migración legacy del
2026-08-18 («Cuadre importación ENERVIDA … diferencia acumulada pre-corte vs Excel»), sin documento ni
`reference_id` por diseño de la importación. No son salidas operativas: se contabilizan en la rectificación
como `GAS_PERDIDA_INV` (patrón del asiento AJUSTE_INVENTARIO existente). Los vales de transferencia
(VS-157/158/208) salieron hacia las tiendas Puerto Padre / Ferrocarril y OT/Ferro sin movimiento de
entrada en otra tienda del sistema: el sistema los trata como consumo (`GAS_VALES`), patrón que se conserva.

---

## 4. Fase III — Matriz económica de los 101 productos

`MATRIZ_PRODUCTOS_FAC-VITALLCONS-001.xlsx` (101 filas × 11 columnas §5) + `m048-faseIII-matriz.json`.
Clasificación re-verificada línea a línea (misma lógica auditora de la misión 002, datos re-extraídos):

| Clasificación | Líneas | Valor original | Tratamiento |
|---|---|---|---|
| **SKU corregidos por decisión del propietario** | **2** | 151.300.000 CUP | Rectificados a 1 CUP/u (esta misión) |
| Costos bajos legítimos (1 CUP/1 USD auténticos, D3) | 18 | 1.318 CUP | Se conservan |
| Costos con soporte documental | 0 | — | (PR-2 no cubre la FVC) |
| Discrepancias de moneda (SKU 90, 92, 999, 120) | 4 | 588.217 CUP | PENDIENTE propietario (DP-4) |
| Costos no verificables (`uc == precio`) | 71 | 24.510.805 CUP | PENDIENTE propietario (DP-3); **no se corrigen por inferencia** |
| Sin problema detectado | 6 | 1.307 CUP | Se conservan (SKU 86: margen negativo — observación DP-5) |

Totales verificados: 192.039.436 → **40.739.585 CUP** (reducción 151.299.851; recomputo por dos vías
— por línea y por componentes 79 CUP + 20 USD@680 + 2 corregidas — coincidentes al céntimo).

---

## 5. Fase IV — Rectificación contable diseñada (refinada con liquidación real)

Documento completo: **`PROPUESTA_RECTIFICACION_DEFINITIVA_CP_FIN.md`** (8 verificaciones V-L1..V-L8 que
condicionan el diseño). Síntesis:

**Determinaciones exigidas por §6 de la misión:**

1. **Importe exacto a reducir de ACT_INVENTARIO: 151.299.851,00 CUP** (el exceso permanece íntegro en el
   saldo porque las salidas se costearon a 0-1 CUP, jamás a la valoración 680).
2. **Importe exacto a reducir de PAS_CXP_PROV: 151.299.851,00 CUP** — deuda **100% pendiente verificada**
   (unpaid, 0 pagos, 0 transactions de pago, vencida 2026-07-31): la contrapartida es el pasivo real.
3. **Obligación con el proveedor: sigue pendiente** (no existen pagos asociados). La deuda restante de la
   FVC (40.739.585 CUP) solo se cancelará con pagos reales futuros.
4. **Parte que debe afectar gastos/COGS por salidas posteriores: NO el COGS (ya correcto a 7 CUP en el
   motor)**; sí el reconocimiento de las salidas nunca contabilizadas: **GAS_VALES 6 + GAS_PERDIDA_INV 18
   = 24 CUP**. La propuesta de la misión 002 de debit GAS_COSTO_VENTAS 2 CUP queda **descartada para
   producción** (duplicaría el COGS del motor — verificado en los 5 asientos de venta).
5. **Diferencias adicionales por WAC: ninguna** (WAC 1 constante; evento `rectificacion` registrado) y por
   movimientos: 26 salidas revalorizadas a uc=1 SOLO en la capa kardex (`cost_value_change` intacto:
   convención 0 en 1.776/1.776 filas del sistema).
6. **Documentos de rectificación a emitir:** asiento **RECT-1** (`FAC-VITALLCONS-001-RECT`, `reversal_of →
   93bb5da9`, D PAS_CXP_PROV 151.299.851 / C ACT_INVENTARIO 151.299.851) y asiento **RECT-2**
   (`FAC-VITALLCONS-001-RECT-SAL`, D GAS_VALES 6 + D GAS_PERDIDA_INV 18 / C ACT_INVENTARIO 24), más
   auditoría por fila (14 filas explícitas + la nativa de `trg_audit_receipt_changes`) y el respaldo
   lógico pre-flight con `restore.sql`.

**Restricciones §6 cumplidas:** el asiento original NO se edita ni elimina; la rectificación es compensatoria,
enlazada, auditable (actor, fecha, motivo, valores anterior/nuevo por fila), idempotente y reversible;
**sin cuentas de patrimonio**; la contrapartida es el pasivo real con el proveedor.

---

## 6. Fase V — Prototipo E2E aislado EXTENDIDO: TODAS LAS PRUEBAS PASS

`m049-rect003-faseV-e2e-prototipo.mjs` sobre la BD aislada (lguovmvrozxgssupkwpf, sentinela
`e2e_is_isolated_db()=true` REST+SQL, fail-closed). **Extiende el prototipo de la misión anterior** con la
contabilidad REAL de las salidas (lo que faltaba): 12 asientos réplica que reproducen fielmente producción —
1 reconocimiento (151,3M) + 5 ventas con el **COGS del MOTOR a 1 CUP/u (incluidas las 2 ventas con kardex
uc=0)** + 6 vales con asiento (88 CUP) — y las **brechas documentales reales** (VS-37/138/139/223 y los 2
ajustes sin asiento). Sobre esa réplica se ejecuta la rectificación canónica de 8 pasos en UNA transacción
atómica (pooler IPv4 + escape hatch M021).

| Prueba | Resultado |
|---|---|
| V1 Precios de venta conservados | **PASS** — 2.000 CUP / 1.000 USD intactos antes/después |
| V2 Costos unitarios corregidos a 1 CUP | **PASS** — 2 líneas uc=1, CUP, tasa 1 |
| V3 Costo de recepción correcto | **PASS** — total réplica 149 CUP (producción: 40.739.585) |
| V4 WAC cronológico | **PASS** — WAC 1 constante; saldos 10/20 |
| V5 **COGS de las 119 salidas** | **PASS** — 119 u netas = 119 CUP al costo correcto; motor 7 CUP INTACTO antes/después |
| V6 Asientos correctivos equilibrados | **PASS** — cada asiento D=C; RECT-1 y RECT-2 cuadrados |
| V7 Trazabilidad a la recepción original | **PASS** — `reversal_of` → asiento original; capas → reference_id FVC; auditoría por fila |
| V8 Idempotencia | **PASS** — 2ª pasada: 0 cambios en ítems/cabecera/movs/asientos/WAC/auditoría |
| V9 Reversión controlada | **PASS** — rollback restaura el estado ANTES byte a byte (asiento testigo) |
| V10 Re-aplicación sin duplicación | **PASS** — 14 asientos, 39 movimientos contables, 21 movimientos kardex exactos |
| V11 Limpieza | **PASS** — **net delta 0** en las 11 tablas (cero residuos en la BD aislada) |
| V12 **Conciliación ACT_INVENTARIO** | **PASS** — neto mayor 30 = valor kardex 30 = valor en libros 30 (10 u + 20 u × 1) |
| Saldo correcto de proveedor | **PASS** — neto PAS_CXP_PROV = 149 CUP (costo real documentado; unpaid) |
| Valor de las 30 unidades restantes | **PASS** — 30 CUP |
| GAS_VALES / GAS_PERDIDA_INV | **PASS** — 94 CUP (88 + 6 brecha) / 18 CUP |

Evidencia completa: `m049-faseV-e2e-prototipo.json` (por_asiento con D=C de los 14 asientos, snapshots de
productos, pasos con tiempos). **Producción re-verificada intacta tras el prototipo** (§8).

---

## 7. Fase VI — Plan de ejecución de producción (preparado, NO ejecutado)

**`RUNBOOK_PRODUCCION_RECTIFICACION.md`**: filas a modificar y documentos correctivos a crear, asientos
originales afectados y esperados (débitos/créditos exactos), impacto en WAC/COGS/ACT_INVENTARIO/
PAS_CXP_PROV con valores antes/después, verificaciones post-aplicación (SQL independiente) y procedimiento
de rollback. Requiere: autorización expresa del propietario, ventana con el documento congelado y
ejecución UNA sola vez (regla de oro 11g).

## 8. Restricciones de la misión cumplidas (§9)

- ✅ Producción **exclusivamente en lectura** (REST GET + SELECT por Management API; guard de ref).
- ✅ No se modificaron líneas de recepción, movimientos, WAC, COGS histórico, asientos existentes; ni
  ajustes, reversiones, otros productos o backfills. **Cero escrituras en producción.**
- ✅ Las pruebas de escritura se realizaron **exclusivamente en la BD E2E aislada** (sentinela verificada;
  net delta 0 al cierre).
- ✅ Re-verificación final de producción: FVC byte a byte (total 192.039.436, uc 2.500/1.000 USD@680,
  101 líneas, 21 movimientos, 1 asiento, 0 pagos). El saldo global del mayor ACT_INVENTARIO presentó un
  delta de +18.203,04 CUP **explicado por actividad comercial viva posterior al snapshot** (ventas
  19:08-19:13 UTC: 18.203,04 reconocido, anulado y re-vendido) — fuera del alcance de esta misión y sin
  relación con la FVC o los SKU 111/112.

## 9. Criterio de cierre (§10 de la misión)

1. **Costo real demostrado:** 1 CUP/u en ambos SKU (decisión económica del propietario + corroboración
   quíntuple previa de la misión 002 + WAC=1 preexistente + salidas ya costeadas a 0-1 CUP).
2. **Efecto completo demostrado:** recepción (192.039.436 → 40.739.585, −151.299.851), kardex (21
   movimientos reconstruidos; 119 salidas distribuidas por unidad; 26 u revalorizables), WAC (1 constante,
   evento), COGS (motor 7 CUP ya correcto + kardex alineado), proveedor (deuda 100% pendiente verificada;
   reversión del exceso contra PAS_CXP_PROV), estados financieros (mayores antes/después cuantificados:
   ACT_INVENTARIO 201.699.246,55 → 50.399.395,55; PAS_CXP_PROV 207.255.150,57 → 55.955.299,57).
3. **La rectificación NO se ejecutó en producción** en esta fase — queda documentada, demostrada y lista
   para el runbook previa autorización del propietario.

## 10. Entregables de la misión (§10)

| # | Entregable | Archivo |
|---|---|---|
| 1 | Informe de rectificación por SKU | este documento |
| 2 | Cronología de las 119 unidades salidas | `CRONOLOGIA_119_SALIDAS_SKU111_112.xlsx` + `m047-faseII-cronologia.json` |
| 3 | Matriz económica de los 101 productos | `MATRIZ_PRODUCTOS_FAC-VITALLCONS-001.xlsx` + `m048-faseIII-matriz.json` |
| 4 | Reconciliación final de la recepción | `RECONCILIACION_RECEPCION_FAC-VITALLCONS-001.xlsx` |
| 5 | Propuesta de rectificación CP-FIN | `PROPUESTA_RECTIFICACION_DEFINITIVA_CP_FIN.md` |
| 6 | Propuesta de corrección WAC y COGS | §5 de la propuesta + §3/§6 de este informe (WAC sin cambio material; COGS motor intacto; kardex 26 u) |
| 7 | Evidencia E2E completa | `m049-faseV-e2e-prototipo.json` (TODAS PASS) |
| 8 | SQL independiente y JSON | `consultas_sql_independientes_RECTIFICACION-003.sql` + JSONs m045-m049 |
| 9 | Manifiesto SHA-256 | `MANIFIESTO_SHA256_RECTIFICACION-003.txt` |
| 10 | Runbook de producción (antes/después + rollback) | `RUNBOOK_PRODUCCION_RECTIFICACION.md` |

Copias para el propietario en `download/` (prefijo RECT003_). Expediente íntegro en
`docs/audits/valuation-rectification-003-20261115/` del repo.
