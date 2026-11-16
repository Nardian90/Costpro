# RECEIPT_FULL_VALUATION_REPORT — MISIÓN CP-FIN-RECEIPT-FULL-VALUATION-010

**Recepción:** `FAC-VITALLCONS-001` (id `fd9d6c88-5db8-49ea-b185-8bc96cc93e63`)
**Fecha operacional:** 01/07/2026 · **Proveedor:** Vitallcons · **Tienda:** ENERVIDA-VITALLCONS
**Estado:** active · unpaid (0 pagos; deuda 100 % pendiente)
**Método:** auditoría forense 100 % READ-ONLY sobre producción (`wthkddeleylijmonclxg`) vía Management API `/database/query`, exclusivamente SELECT, con guard de referencia y guard anti-escritura en cliente. **0 escrituras en producción.**
**Fecha de cierre:** 2026-11-17

---

## A. Alcance

- **101 líneas identificadas en BD**: `receipt_items` devuelve exactamente **101 filas / 101 SKU distintos / 2 monedas** (CUP, USD) para `receipt_id = fd9d6c88-5db8-49ea-b185-8bc96cc93e63`. Control de alcance §2 de la misión: **SUPERADO sin desviaciones**.
- **Correspondencia con el listado cerrado del propietario (§2)**: **101/101 SKU encontrados**, con **0 diferencias** de cantidad, costo unitario mostrado y subtotal mostrado. No hay SKU faltantes ni sobrantes.
- **Capas de compra**: `stock_movements` con `reference_id` = la recepción y `movement_type='purchase'` devuelven **101 capas en correspondencia 1:1** con las líneas (cantidad y costo idénticos, 0 discrepancias). Idempotencia: **0 capas duplicadas**.
- **Exclusión estricta**: ninguna consulta ni verificación tocó otra recepción, otro proveedor u otros productos. Las 45 compras posteriores que afectan a los mismos SKU (otras recepciones), la venta post-ciclo de SKU111 (transacción `9bac8945`, 2026-11-16 18:05Z) y los cuadres del 2026-08-18 fueron **documentados pero no modificados**.
- Referencia contable de la recepción: asiento original `93bb5da9…` (RECEPCION reconocimiento, 2026-07-01, PAS_CXP_PROV / ACT_INVENTARIO × **192.039.436,00 CUP**), rectificado por RECT-1 (151.299.851,00) y RECT-2 (24,00) en la misión 009 autorizada.

## B. Clasificación (§6) — 101 líneas, valor conservado en CUP

| Categoría | Líneas | Valor CUP | Detalle |
|---|---:|---:|---|
| **A — Costo correcto y demostrado** | **24** | **15.640.414,00** | 18 × costo 1 CUP auténtico (decisión D3 del propietario, misión 003) + 6 × evidencia de sistema (costo ≠ precio de venta, moneda consistente): SKUs 17, 47, 86, 113, 118, 119 |
| **B — Costo incorrecto y documentado (corregido)** | **2** | **149,00** | SKU111 y SKU112: corregidas por RECT-1 (2.500/1.000 USD@680 → 1 CUP/u; misión 009) y **re-verificadas aquí; NO repetidas** |
| **C — Moneda señalada, demostración pendiente** | **3** | **588.213,00** | SKU90 (material, señal m048: magnitud 5 = precio CUP plausible) + SKU92/120 (triviales). Propuestas cuantificadas, **sin ejecutar** |
| **D — Costo cero o incompleto** | **0** | — | Ninguna línea con costo 0 o incompleto |
| **E — Costo no verificable** | **71** | **24.510.805,00** | Magnitud indistinguible precio/costo (DP-3, misión 003); protegidas §6, pendientes de documento de compra por línea |
| **F — Servicio (no inventario)** | **1** | **4,00** | SKU999 «Servicio de cripiar»: `products.is_service=true`; capa FVC 4 u × 1 CUP trivial; saldo kardex neto 0 |
| **TOTAL** | **101** | **40.739.585,00** | = cabecera `receipts.total_cost` (Δ 0,00) |

Contraste con la matriz congelada m048 (misión 003): **99/99 líneas protegidas idénticas** (0 diferencias en cantidad, costo, moneda y tasa). Las únicas 2 líneas que cambiaron desde el congelado son SKU111/112, por la corrección RECT-1 autorizada y ejecutada en la misión 009.

## C. Correcciones

| SKU | Costo anterior | Costo nuevo | Motivo y evidencia | Importe | Estado |
|---|---|---|---|---|---|
| 111 Grapas plásticas con clavo de acero | 2.500 USD × 680 (precio de venta importado como costo) | **1,00 CUP/u** (49 u → 49 CUP) | Decisión económica del propietario; runbook RECT004 + addendum T12 | 151.299.851,00 CUP (junto con 112) | **APLICADA (RECT-1, misión 009) y VERIFICADA en 010** — no repetida |
| 112 Grapas metálicas 3/4 con tornillo roscante | 1.000 USD × 680 | **1,00 CUP/u** (100 u → 100 CUP) | Ídem | (incluido arriba) | **APLICADA y VERIFICADA** — no repetida |
| 90 Cable Solar Rojo 6mm | 5,00 USD × 680 = 588.200,00 CUP | (propuesta) 5,00 CUP × 1 = 865,00 CUP | Señal m048: magnitud idéntica a precio CUP; **sin documento de compra** que demuestre la moneda original | Δ **−587.335,00 CUP** (100 % en egresos históricos: las 173 u ya salieron; Δ inventario 0,00) | **PROPUESTA L1 — NO EJECUTADA** (§7: requiere evidencia + autorización específica) |
| 92 Juego de pata / 120 Estación de carga | 1,00 CUP (auténtico, magnitud ambigua) | sin cambio recomendado | Señal m048 trivial; impacto ≤ 8.148,00 CUP solo si se demostrara USD | Δ ≤ 8.148,00 / 679,00 CUP | **PROPUESTA L2 — NO EJECUTADA** |
| 71 líneas E | valor registrado conservado | — | Sin documento de compra por línea | sin propuesta de importe | **L3 ABIERTO** — decisión del propietario línea a línea |

**Ningún importe nuevo se escribió en producción.** La autorización anterior (151.299.875,00 CUP) cubre exclusivamente RECT-1 y RECT-2, ya contabilizadas; ambos lotes figuran en `RECEIPT_CORRECTIONS_BY_BATCH.xlsx` como L0a/L0b con su verificación 010.

## D. Inventario

- **Capas de la recepción**: 101 capas × (cantidad, costo) idénticos a las líneas; valor total **40.739.585,00 CUP**; sin duplicados.
- **Existencia atribuible (FIFO cronológico)**: calculada línea a línea en `RECEIPT_INVENTORY_AND_COGS_IMPACT.xlsx` (columnas «Capa restante FIFO» y «Existencia actual»). Ejemplos: SKU111 capa restante 0 de 49 u (consumo real: 5 ventas, 3 vales, 1 ajuste y venta post-ciclo de 1,2 u); SKU112 restante 0 de 100 u (vale −20 Puerto Padre, vale −12 Ferrocarril, ventas); SKU90 restante **0 de 173** (todas salieron).
- **Salidas históricas (101 SKU, todas las causas)**: 649 movimientos de venta (23 reversas), 190 consumos por vales (2 reversas), 56 ajustes de cuadre; además **45 ingresos de otras recepciones** (ajenos, documentados).
- **WAC**: sin cambios por esta misión (0). WAC actuales por SKU en la matriz maestra; 113 registros de `wac_change_log` documentados como historial (incluyen RECT-1 en 111/112 y otras recepciones).
- **SKU111/112 verificación §8**: uc de línea = 1 CUP, capa = 1 CUP (49/100 u), WAC = 1 CUP, todas las salidas históricas a uc 1; precios de venta NO tocados por RECT-1 (el cambio 2.500→2.000 CUP de SKU111 es del 2026-10-22, audit-logged y ajeno al ciclo; SKU112 conserva 1.000 con moneda USD de catálogo del 2026-10-16). Stock actual 8,8/20 u (venta legítima post-RECT-2 documentada, no modificada).
- **SKU999 (servicio)**: sin capa nueva ni WAC como mercancía; su WAC actual 443,83 proviene de la recepción ajena `44b8f20f` (20 u × 680) y cuadres — fuera del alcance, documentado en `RECEIPT_UNRESOLVED_LINES.xlsx`.
- **Antes/después**: `BEFORE_AFTER_SNAPSHOT.json` — todas las secciones de negocio **idénticas por hash** antes y después de la misión.

## E. Contabilidad

- **Asientos de la recepción** (`fin_entries` + `fin_movements`):
  - `93bb5da9…` RECEPCION reconocimiento (2026-07-01): Débito ACT_INVENTARIO 192.039.436,00 / Crédito PAS_CXP_PROV 192.039.436,00.
  - RECT-1 (`reversal_of=93bb5da9`, AJUSTE/RECEPCION ajuste_manual): Débito PAS_CXP_PROV 151.299.851,00 / Crédito ACT_INVENTARIO 151.299.851,00.
  - RECT-2 (AJUSTE_INVENTARIO ajuste_manual): Débito GAS_VALES 6,00 + GAS_PERDIDA_INV 18,00 / Crédito ACT_INVENTARIO 24,00.
  - **0 asientos de `anulacion`** sobre la recepción; T12 v2 activo (bloqueo de re-anulación con residual parcial).
- **Efecto neto CXP**: 192.039.436,00 − 151.299.851,00 = **40.739.585,00 CUP pendientes** (0 pagos, `payment_status=unpaid`, 0 `payment_transactions` del documento).
- **COGS** (3 bases documentadas): A por línea `cost_at_sale` de los 101 SKU (ventas POS completadas netas) = **1.814.385,87 CUP**; B costo derivado del kardex de sus salidas de venta = **1.800.185,43 CUP** (Δ 14.200,44 = redondeo/deriva entre bases, documentado); C movimientos `GAS_COSTO_VENTAS` por transacción completa (602 transacciones mezcladas con SKUs ajenos y servicios) = **4.677.274,19 CUP** (no attributable por línea). **Sin duplicación atribuible a la recepción**; el COGS 7,00 CUP de las 5 ventas SKU111/112 permanece intacto. 7 transacciones completadas sin movimiento GAS = ventas con costo derivado 0 (observación documentada, sin impacto en el alcance).
- **Vales**: consumo por línea de los 101 SKU = **524.266,99 CUP**; `GAS_VALES` por vale completo (159 vales, mezcla de SKU del alcance y ajenos) = **606.903,26 CUP** vs suma de ítems vigentes 606.904,27 → Δ **−1,01 CUP** acumulado en redondeos a centavos del asiento por vale (máximos individuales: VS-000187 +0,01; VS-000209 −0,01). RECT-2 ya reconoció los 6 CUP de vales SKU111/112 sin asiento; **sin duplicaciones**.

## F. Importe final de la recepción (moneda de referencia CUP)

**40.739.585,00 CUP** — certificado con desglose reproducible:

| Moneda | Líneas | Subtotal en moneda original | Tasa almacenada | Equivalente CUP |
|---|---:|---:|---:|---:|
| CUP | 81 | 5.129.855,00 CUP | 1,0000 | 5.129.855,00 |
| USD | 20 | 52.367,25 USD | 680,0000 (histórica por línea) | 35.609.730,00 |
| **Total** | **101** | — (no se suman monedas distintas) | | **40.739.585,00** |

- La suma en CUP coincide con la cabecera `receipts.total_cost` (**Δ 0,00**) y con la suma de las 101 capas.
- **Tasas justificadas**: la tasa 680 se conserva **únicamente** para las 20 líneas USD; es la tasa informal (elToque, segmento 3) del período — capturada como 680 el 16/06/2026 y 08/07/2026, con captura puntual del 01/07/2026 en 620 — y está almacenada línea a línea en `tasa_cambio_recepcion`. No se convirtió automáticamente ningún importe CUP por 680 y no se reescribió ninguna tasa.
- Clasificación monetaria línea a línea en `RECEIPT_CURRENCY_RECONCILIATION.xlsx`. Las señales de moneda pendientes (SKU90/92/120) conservan su valor registrado y están cuantificadas como propuestas, no como errores aplicados.
- Los subtotales del listado del propietario suman 5.182.222,25 en monedas originales y **coinciden 101/101** con los registros de BD.

## G. Seguridad

- **Lectura pura**: todos los accesos por Management API con guard de ref `wthkddeleylijmonclxg` y guard anti-escritura en cliente (rechaza SQL no SELECT/WITH). Scripts declarados READ-ONLY en `writers.manifest.json` (m069, m070, m070b) → `CHECK-WRITERS OK` (147 excepciones justificadas).
- **T12**: trigger `fin_t12_receipt_annulment_block` habilitado ('O'); hardening del ciclo CP-FIN intacto; CP-INFRA-019/020 respetados (sin E2E contra producción; sin SQL temporal).
- **`fin_posting_errors`**: 0 registros nuevos desde RECT-2 (2026-11-16 16:07Z).
- **Alcance protegido**: 99 líneas protegidas idénticas al congelado m048; precios de venta, COGS 7 CUP, vales ya contabilizados, otras recepciones y los cuadres históricos **sin ninguna modificación**; venta post-ciclo SKU111 (2026-11-16) solo documentada.
- **Sin secretos**: ningún PAT/clave impreso o commiteado; escaneo de diff previo al PR.

## H. Publicación

- **Rama**: `docs/receipt-full-valuation-010-20261117` desde `main` (`a78fd3e9a`).
- **Contenido**: expediente `docs/audits/receipt-full-valuation-010/` (10 entregables con `SHA256SUMS.txt`) + scripts del ciclo (m069–m073) + entradas READ-ONLY del manifest de escritores.
- **PR**: abierto por API con cuerpo en español (qué cambia, evidencia, seguridad); checks CI / Test Coverage verdes antes de integrar; integración por merge normal de GitHub (sin push directo a main ni force-push). Número de PR y SHA de merge: ver `worklog.md` (registro por etapas 11a).
- **Post-merge**: verificación de expediente en main, hashes íntegros y CI del push del merge.

---

## Definición de terminado (§12)

- [x] Las 101 líneas están identificadas y conciliadas (101/101, 0 diferencias vs listado).
- [x] No se han mezclado otras recepciones ni productos ajenos (alcance restringido por `receipt_id`; verificación hash de secciones).
- [x] Cada moneda original está identificada (81 CUP / 20 USD, línea a línea).
- [x] Todas las conversiones están justificadas (tasa 1 CUP; 680 solo USD demostradas, con evidencia de período).
- [x] Las correcciones demostradas están aplicadas o preparadas según su autorización (B aplicadas y verificadas; C cuantificadas como propuestas sin ejecutar).
- [x] SKU111 y SKU112 no fueron contabilizados nuevamente (RECT-1/RECT-2 verificadas, sin duplicación).
- [x] Los servicios no generan inventario ficticio (SKU999 tratado como F; sin capa/WAC nuevos).
- [x] Las capas de compra y el WAC son coherentes (101 capas 1:1; WAC sin cambios no autorizados).
- [x] El COGS está reconciliado sin duplicaciones (bases A/B/C documentadas; COGS 7 CUP intacto).
- [x] Las líneas no verificables están claramente identificadas (71 E + 3 C + notas de servicio, en `RECEIPT_UNRESOLVED_LINES.xlsx`).
- [x] No hay cambios en productos o recepciones fuera del alcance (BEFORE_AFTER_SNAPSHOT: todas las secciones idénticas).
- [x] La valoración total de la recepción está explicada en una única moneda de referencia (40.739.585,00 CUP, Δ 0,00 vs cabecera).
- [x] El expediente y sus hashes están completos (10 entregables + `SHA256SUMS.txt`).
- [x] PR integrado y worklog actualizado.
