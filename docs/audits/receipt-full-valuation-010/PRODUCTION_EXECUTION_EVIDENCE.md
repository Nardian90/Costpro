# PRODUCTION_EXECUTION_EVIDENCE — MISIÓN CP-FIN-RECEIPT-FULL-VALUATION-010

**Proyecto de producción:** `wthkddeleylijmonclxg` (guard de referencia en todos los scripts)
**Método de acceso:** Supabase Management API `POST /v1/projects/{ref}/database/query` — **exclusivamente SELECT**
**Token:** `SUPABASE_ACCESS_TOKEN` resuelto en runtime desde el `.env` local del repo (jamás impreso, jamás commiteado)
**Fecha:** 2026-11-17

## 1. Principio operativo

1. **Cero escrituras**: la misión es de conciliación y valoración; la autorización vigente (151.299.875,00 CUP) cubre solo RECT-1/RECT-2 (ya ejecutadas y certificadas en la misión 009, PR #1635). El §7 de la misión 010 prohíbe escribir importes nuevos sin aprobación específica → **no se ejecutó ninguna escritura**.
2. **Guard doble en cliente**: cada script verifica `ref === 'wthkddeleylijmonclxg'` (fail-closed) y rechaza cualquier SQL que no empiece por `SELECT`/`WITH` (m070: función `qs()`; m069/m070b: `q()` con head-check).
3. **Alcance restringido**: todas las consultas filtran por `receipt_id = fd9d6c88-5db8-49ea-b185-8bc96cc93e63` (o por los 101 `product_id` de sus líneas, derivados de esa misma condición). Ninguna condición global `unit_cost <> 0` ni actualización por SKU global.

## 2. Log de ejecución (scripts re-ejecutables en `scripts/`)

| Script | Consultas | Propósito | Escrituras |
|---|---:|---|---|
| `m069-receipt-valuation-schema-probe.mjs` (×2) | 14 | esquema (information_schema), conteos de alcance, tipos de movimiento | 0 |
| `m070-receipt-full-valuation-extract.mjs` (×3) | 25 | extracción integral: cabecera, 101 líneas, 101 capas, kardex 1.066 movs, wac_log 113, ventas/vales, asientos, CXP/pagos, tasas, SKU999, SKU111/112, controles T12/idempotencia | 0 |
| `m070b-receipt-valuation-maestro-audit.mjs` (×2) | 12 | audit_logs del maestro SKU111/112, venta post-RECT-2, tasas 680, conciliación exacta COGS/VALES por granularidad | 0 |
| `m071-receipt-valuation-matriz.py` | 0 (local) | matriz maestra 101 × campos §5, clasificación A–F, conciliaciones, lotes | 0 |
| `m072-receipt-valuation-gen-xlsx.py` | 0 (local) | 6 XLSX del expediente (skill xlsx, paleta professional, validados) | 0 |
| `m073-receipt-valuation-snapshot.py` | (via m070) 25 | snapshot antes/después por hash de secciones | 0 |

Resultados crudos conservados en `scripts/out/`: `m069-schema-probe.json`, `m070-receipt-valuation-extract.json` (referencia de auditoría), `m070-before-mission-extract.json` / `m070-post-mission-extract.json` (antes/después), `m070b-maestro-audit.json`, `m071-matriz-maestra.json`.

## 3. Controles verificados contra producción (todos SELECT)

| Control | Resultado |
|---|---|
| Líneas de la recepción | **101** (101 SKU distintos, 2 monedas) |
| Capas de compra (`movement_type='purchase'`, `reference_id`=recepción) | **101**, correspondencia 1:1 (0 discrepancias de cantidad/costo) |
| Capas duplicadas (idempotencia) | **0** |
| Asientos de la recepción | 3: `93bb5da9` (reconocimiento 192.039.436,00) + RECT-1 (151.299.851,00, `reversal_of=93bb5da9`) + RECT-2 (24,00) |
| Asientos de `anulacion` sobre la recepción | **0** |
| T12 | trigger `fin_t12_receipt_annulment_block` **habilitado** (tgenabled='O') |
| `fin_posting_errors` desde RECT-2 | **0** |
| Pagos del documento | **0** (`payment_status=unpaid`, sin `payment_transactions`) |
| SKU111 | uc línea **1,00 CUP** · capa **1,00** (49 u) · WAC **1,00** · stock 8,8 (venta post-ciclo 1,2 u documentada) · precio venta 2.000 CUP (cambio 22-10 ajeno, audit-logged) |
| SKU112 | uc línea **1,00 CUP** · capa **1,00** (100 u) · WAC **1,00** · stock 20 · precio venta 1.000 (moneda de catálogo USD desde 16-10, previa al ciclo) |
| SKU999 | `is_service=true` · capa FVC 4 u × 1 CUP · saldo kardex neto 0 · sin ventas en `sale_items` |
| Matriz congelada m048 (99 protegidas) | **0 diferencias** (cantidad/costo/moneda/tasa) |
| Moneda | 81 líneas CUP (tasa 1,0000) + 20 líneas USD (tasa 680,0000) — evidencia de período: elToque 680 (16-06 y 08-07-2026), captura 01-07-2026 = 620 |

## 4. Manifiesto de escritores

- Añadidas **3 entradas READ-ONLY** en `scripts/lib/writers.manifest.json`: m069, m070, m070b (justificación, guard y re-ejecutabilidad documentadas por entrada).
- `node scripts/lib/check-writers.mjs` → **CHECK-WRITERS OK** (147 excepciones justificadas; 47 con guard de producción; 28 con guard de aislamiento E2E).

## 5. Declaración final

- **Producción permaneció INTACTA**: `BEFORE_AFTER_SNAPSHOT.json` compara por SHA-256 las secciones de negocio (cabecera, 101 líneas, 101 capas, kardex, WAC-log, asientos, pagos, T12, errores financieros) entre la extracción de referencia de la auditoría y la re-extracción de cierre → **todas idénticas**.
- Ninguna operación de E2E se ejecutó contra producción (CP-INFRA-019/020). Ningún secreto fue impreso ni commiteado; el PAT de GitHub se usó solo en URL efímera de push.
