# PRODUCTION_EXECUTION_EVIDENCE.md — Evidencia de ejecución en producción

**Misión:** CP-FIN-RECEIPT-UNIT-COST-1-CUP-011 · **Autorización:** propietario, §1 (regla 1,00 CUP/u) y §11 (corrección integral de las 101 líneas, sus capas, WAC, salidas históricas y contrapartidas contables; sin solicitudes adicionales).
**Proyecto:** producción `wthkddeleylijmonclxg` (Supabase) · **Canal:** Management API `/database/query`.
**Disciplina:** guards CP-INFRA-019 (fail-closed, doble flag `ALLOW_PROD=read-only` + `ALLOW_PROD_WRITE=I_UNDERSTAND`) · writers manifest (m075/m077 en `guardProtected`) · T12 activo durante toda la ejecución · RLS intacto.

---

## 1. Ciclo de ejecución (runbook)

| Paso | Herramienta | Resultado |
|---|---|---|
| Preflight | `m070` (extracto read-only 25 SELECT) + `m074` (matriz) + drift-check | Extracto fresco; **drift 0** vs congelado (kardex 1066→1066, 0 movimientos nuevos, stocks/precios/WAC idénticos) |
| Congelación | `scripts/out/m011/before-extract.json` + matriz `m074-matriz-1cup.json` (guards de estado prístino) | Σqty 5.861,5000 · Σvalor 40.739.585,00 · 78 líneas a corregir · 23 ya conformes · Δ 40.733.723,50 |
| E2E aislada | `m075` (fixture → análisis → lotes → ejecución → verificación → limpieza) | **E2E APROBADA 11/11** · idempotencia (re-ejecución = 0 cambios) · **NET DELTA = 0** |
| Generación | `m076` (lotes A–D idempotentes con guards) | 4 archivos SQL; importes exactos; ids deterministas segmento `7ec9000b-0000-4000-8000` |
| Ejecución 1 | `m077 --execute` (2026-11-16 **19:59:09–19:59:14 UTC**) | LOTES **A/B/C COMMIT OK** · **LOTE-D abortada atómicamente** (HTTP 400 → rollback total; hallazgo único) |
| Corrección | asiento → combinación única libre | ver §3 |
| E2E re-validación | `m075` flujo completo repetido | **E2E APROBADA 11/11** de nuevo, NET DELTA = 0 |
| Ejecución 2 (reanudación) | `m077 --execute` (2026-11-16 **20:02:56–20:03:05 UTC**) | A/B/C re-ejecutadas **idempotentes (0 cambios, S1_previas=0)** · **D COMMIT OK** |
| Verificación §13 | `m077 --verify` | **18/18 PASS** → `scripts/out/m011/prod-verificacion.json` |
| Post-extracto | `m070` + `m074` | 101/101 ya conformes · moneda única CUP · Δ=0 · CXP 5.861,50 |

## 2. Lotes aplicados (cada uno = 1 transacción atómica con `pg_advisory_xact_lock` por documento)

| Lote | Contenido | Guards de conteo (A-5) | Verificación intra (A-6) |
|---|---|---|---|
| **A** | 78 líneas → `unit_cost=1, moneda_recepcion='CUP', tasa=1` + cabecera `total_cost` 40.739.585,00 → 5.861,50 + 78+1 auditorías | freeze: 101 líneas · Σqty 5.861,5000 · Σvalor prístino/ya-aplicado · unpaid/0 pagos | post: 101/101 conformes · Σ=5.861,50 · cabecera=5.861,50 |
| **B** | 78 capas de compra (`stock_movements purchase` del FVC) → `unit_cost=1` + 78 auditorías | freeze: 101 capas 1:1 · Σ(qty×uc) prístino/ya-aplicado | post: 0 capas sucias · Σ=5.861,50 |
| **C** | WAC de 25 productos (`cost_average`, escape hatch `app.wac_writer='fn_recalc_wac'`) + 25 `wac_change_log` + 25 auditorías | freeze: stock congelado por producto; WAC actual = congelado o objetivo | post: 25/25 conformes · wcl=25 |
| **D** | Asiento RECT-011 (1 entrada + 5 movimientos) + 1 auditoría | prerrequisitos A+B · CXP neta 40.739.585,00/5.861,50 · no-duplicado | post: D−C=0,00 · CXP neta=5.861,50 |

**Escape hatches:** M021 (`SET LOCAL app.allow_receipt_item_edit='on'`, LOTE-A) y w62 single-writer (`SET LOCAL app.wac_writer='fn_recalc_wac'`, LOTE-C) — sesiones locales dentro de la transacción.

## 3. Hallazgo técnico de la primera pasada (y su resolución)

- **LOTE-D (19:59 UTC) fue abortada atómicamente** por la restricción única `uq_fin_entries_doc_event (document_type, document_id, event, COALESCE(payment_ref,…))`: `(RECEPCION, FVC, ajuste_manual)` ya estaba ocupada por **RECT-1** y `(AJUSTE_INVENTARIO, FVC, ajuste_manual)` por **RECT-2**.
- Resolución gobernada: RECT-011 se registró bajo la combinación libre **`(AJUSTE_INVENTARIO, FVC, reconocimiento)`** — reconocimiento de ajuste de inventario por revalorización — con `reversal_of=93bb5da9…` (asiento original), `document_number='FAC-VITALLCONS-001-VAL1CUP'` y traza completa.
- La re-validación E2E completa se repitió con la nueva combinación **antes** de reintentar producción; la reanudación re-ejecutó A/B/C con **cero cambios** (idempotencia de reanudación probada en vivo) y aplicó D.
- Estado intermedio (A/B/C sin D): **nunca comprometió datos** — cada lote es una transacción independiente atómica; el estado intermedio era "líneas/capas/WAC corregidas, asiento pendiente", exactamente el caso de reanudación para el que se diseñaron los guards.

## 4. Resultados numéricos finales (reproducidos en la verificación)

- 101/101 líneas a 1,00 CUP · CUP · tasa 1 · subtotales = cantidad · Σ = 5.861,50 = `receipts.total_cost`.
- 101 capas a uc=1 · Σ(qty×uc) = 5.861,50 · **965 movimientos ajenos intactos** (hash MD5 idéntico al congelado).
- 25 WAC conformes · precios de venta 0 divergencias · SKU111/112 (1 CUP, precios 2.000/1.000, stock 8,8/20) y SKU999 (servicio, 4,00) intactos.
- Asiento RECT-011 `7ec9000b-0000-4000-8000-d11300000001` (posted 2026-11-16 20:03:05 UTC): DR `PAS_CXP_PROV` 40.733.723,50 / CR `ACT_INVENTARIO` 3.678.375,50 · `GAS_COSTO_VENTAS` 21.450.370,50 · `GAS_VALES` 5.913.947,50 · `GAS_PERDIDA_INV` 9.691.030,00 · balance 0,00.
- CXP neta del documento: **5.861,50 CUP** (unpaid, 0 pagos) · 4 asientos posted en el documento, todos intactos.
- `fin_posting_errors`: 0 errores del documento desde el inicio de la ejecución · T12 activo (`tgenabled=O`).

## 5. Trazabilidad

- Auditoría por fila: 183 registros `trace_id='RECT011-PROD'` (78 `SYSTEM_RECT011_VALUATION` + 78 `SYSTEM_RECT011_MOV_UC` + 25 `SYSTEM_RECT011_WAC` + 1 `SYSTEM_RECT011_TOTAL` + 1 `SYSTEM_RECT011_ENTRY`), ids deterministas md5, `old_data`/`new_data` por fila.
- `wac_change_log`: 25 entradas `event='rectificacion'` con `source_ref` de la misión.
- `movements_snapshot` + `traza` jsonb por movimiento del asiento (regla por movimiento: `rect011-cxp-d`, `rect011-inv-c`, `rect011-cogs-c`, `rect011-vales-c`, `rect011-perd-c`).
- Scripts re-ejecutables: `m074` (análisis), `m075` (E2E), `m076` (generador), `m077` (ejecutor/verificador), `m078` (expediente XLSX); extractos `before-extract.json` / `after-extract.json` y matrices `m074-matriz-1cup.json` / `after-matriz.json` en `scripts/out/m011/`.

## 6. Seguridad

- PAT nunca impreso ni persistido (URL efímera de push). Ningún secreto en diffs ni en este expediente (scan negativo previo al PR).
- Producción escrita **solo** mediante `m077` con doble flag explícito; `m070/m070b` permanecen read-only (guard `qs()` anti-escritura).
- E2E exclusivamente contra `lguovmvrozxgssupkwpf` (BD aislada, centinela activo); limpieza con **NET DELTA = 0** certificado por conteo de 11 tablas.
