# EXPEDIENTE — Migración propuesta de cobros legacy (165 ventas sin filas de pago)

**Fecha (UTC):** 2026-11-13 · **Modo:** producción read-only para la extracción; validación en BD E2E aislada `lguovmvrozxgssupkwpf`. **Nada aplicado en producción.**

## 1. Qué son las 165

Ventas `completed` de ENERVIDA-VITALLCONS (jul–ago 2026) cuyo cobro está registrado **únicamente en campos históricos** de `transactions` (`cash_amount` / `transfer_amount` / `zelle_amount`) y que **no tienen ninguna fila** en `payment_transactions`. Por eso el motor CP-FIN las rechaza hoy (`ERR_UNBALANCED`: Σcobros = 0 ≠ total_cup) — quedan en `fin_posting_errors`, sin contaminar estados, pero fuera de la contabilidad.

Extracción por operación (READ-ONLY): `scripts/out/m2-165-legacy.json` — por cada venta: id, factura, fecha original, método, campo legacy de origen, importe nominal por componente, moneda real demostrada, tasa, importe CUP, correspondencia con `total_amount`, clave de idempotencia propuesta y evidencia de no-duplicación.

## 2. Resultado de la investigación

| Concepto | Valor |
|---|---|
| Operaciones | 165 (todas ENERVIDA) |
| Métodos | cash 138 · transfer 14 · mixtas cash+transfer 9 · **zelle 3 (+1 mixta cash+zelle)** |
| total_amount Σ | 3.163.110,00 CUP |
| Cobro legacy Σ | 3.163.110,00 CUP (correspondencia EXACTA 165/165, saldo 0) |
| Moneda REAL del importe | **CUP demostrado documento a documento** (165/165: `sale_currency='CUP'` + ítems CUP + sin carve USD en ítems + sin liquidación explícita + saldo exacto). NO se aplicó «tasa 1 por defecto»: la tasa 1 es el contrato estructural de las filas CUP (PT003) y el importe es nominal CUP verificado. |
| Evidencia de no duplicación | 165/165: 0 filas de pago de CUALQUIER referencia (sale/devolución/recuperación), 0 devoluciones sobre la venta, 0 store_credit, 0 liquidaciones explícitas, 0 ítems en divisa. |
| Fechas | 2026-07-16 → 2026-08-10 (conservadas en la migración) |

## 3. Los 4 documentos con conflicto estructural (bloqueados)

`c5965c77` (15.300), `cb3052c3` (4.760), `119a4f5e` (4.760) — cobro íntegro en `zelle_amount` en **CUP** — y `1558287f` (9.520 = cash 2.720 + zelle 6.800).

El trigger de invariantes de `payment_transactions` (PT005) **prohíbe zelle+CUP** (zelle exige USD/EUR/MLC). Migrarlas tal cual aborta la operación (fail-closed). El importe ES CUP nominal (demostrado), pero el **riel** contradice la invariante viva del sistema. Alternativas (decisión del propietario, ninguna adoptada aquí):

- **(a)** Mantenerlas bloqueadas (estado actual).
- **(b)** Autorizar una salvedad explícita de PT005 para datos históricos (política).
- **(c)** Reclasificación documental del riel (modificaría datos originales — exige autorización expresa).

Total bloqueado: 34.340,00 CUP. **Migrables: 161 ventas, 3.128.770,00 CUP.**

## 4. Migración propuesta v1 (`MIGRACION.sql`)

INSERT…SELECT transaccional sobre las ventas elegibles (guards: `completed`, cobro legacy == total exacto, sin filas de pago previas, moneda CUP demostrada, **excluye zelle**), una fila por (venta × método) con:

- `payment_date := transactions.created_at` — **P1 fechas históricas conservadas**
- método = nombre del campo legacy; `currency='CUP'`, `exchange_rate=1` — **P2 métodos/monedas originales**
- clave `legacy-mig-v1-<id>[-método]` + `ON CONFLICT DO NOTHING` + NOT EXISTS — **P3/P5 sin duplicados, re-ejecutable e idempotente**
- `ref_type='sale'`, `ref_id = transaction_id = id de la venta` — **P7 vinculación a la venta original**
- `reference='legacy-migration-v1'` (marcador de lote reversible)

**P4 (no dos asientos por el mismo hecho):** la VENTA solo tiene evento `reconocimiento` en su plantilla (los cobros se agregan al asiento de reconocimiento); el INSERT de pagos no dispara ningún asiento de pago — demostrado.

**P6 reversión controlada:** borrado exacto por `idempotency_key LIKE 'legacy-mig-v1-%'` con PT007 deshabilitado temporalmente (procedimiento documentado en el propio SQL). Las ventas y sus campos legacy quedan intactos; los asientos que ya se hubieran contabilizado requerirían su anulación compensatoria estándar.

## 5. Validación en BD E2E aislada (`validacion-bd-aislada.txt` — PASS TOTAL)

Copia de las 165 ventas reales (ids reales, imports/fechas reales) a la BD aislada:

- ANTES: 4/4 representativas → `ERR_UNBALANCED` (débitos 0) — el estado actual.
- Migración: **161 ventas cubiertas, 170 filas, 3.128.770,00 CUP**; las 4 zelle sin filas.
- Fila a fila: P1 161/161 · P2 170/170 · P3 161/161 + claves únicas · P7 161/161 · Σ amount_cup == total 161/161.
- Posting tras migrar: cash → D ACT_EFECTIVO_CUP; transfer → D ACT_BANCOS; mixta → ambos; C ING_VENTAS por el total — **exactamente 1 asiento por venta**, re-publicar no duplica.
- Re-ejecutar: 170→170 (idempotente). Reversión: 0 filas, ventas/legacy intactos (165, 3.163.110). Re-aplicar tras revertir: 170 de nuevo.
- Limpieza: NET DELTA 0.

## 6. Restricciones cumplidas

Producción read-only (extracción). Nada aplicado, nada modificado, sin merge. La migración es PROPUESTA: su ejecución en producción requerirá autorización expresa del propietario, preferiblemente tras la decisión sobre las 4 zelle y junto al plan por etapas de la primera contabilización.
