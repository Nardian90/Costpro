# RECEIPT_POST_EXECUTION_CERTIFICATION.md — Certificación post-ejecución

**Misión:** CP-FIN-RECEIPT-UNIT-COST-1-CUP-011
**Recepción:** FAC-VITALLCONS-001 (`fd9d6c88-5db8-49ea-b185-8bc96cc93e63`) · 01/07/2026 · Vitallcons · tienda ENERVIDA-VITALLCONS
**Regla económica del propietario (§1):** las 101 líneas a costo unitario **1,00 CUP**, moneda **CUP**, tasa **1**.
**Fecha de certificación:** 2026-11-17 (UTC) · **Ejecución:** 2026-11-16 19:59:09–20:03:05 UTC (dos pasadas: primera + reanudación idempotente)
**Canal:** Management API `/database/query` (producción `wthkddeleylijmonclxg`) · 1 llamada = 1 transacción atómica · guards fail-closed · escape hatches M021 (`app.allow_receipt_item_edit`) y w62 (`app.wac_writer`)
**Verificación ejecutada:** `scripts/m077-receipt-1cup-execute.mjs --verify` → **18/18 PASS** (evidencia completa en `scripts/out/m011/prod-verificacion.json`).

---

## 1. Checklist §13 de la misión (13 ítems obligatorios)

| # | Requisito §13 | Resultado | Evidencia |
|---|---|---|---|
| 1 | 101/101 líneas con costo unitario 1,00 CUP | **PASS** | V1: n=101, ok=101 |
| 2 | 101/101 líneas con moneda CUP | **PASS** | V1 + extracto post: `monedas:["CUP"]` |
| 3 | 101/101 subtotales = cantidad × 1 CUP | **PASS** | V1: `subtotales_mal=0`, Σ=5.861,50 |
| 4 | Total de líneas 5.861,50 CUP (cantidades originales) | **PASS** | V1/V2: Σ líneas = cabecera = 5.861,50; cantidades intactas (Σqty 5.861,5000 antes y después) |
| 5 | Cabecera consistente con las líneas | **PASS** | V2: total_cost 5.861,50 · unpaid · active · 0 pagos |
| 6 | Capas de compra corregidas | **PASS** | V3: 101 capas, 0 con uc≠1, Σ=5.861,50 |
| 7 | WAC recalculado con las demás compras sin modificarlas | **PASS** | V4: 25/25 conformes · capas ajenas intactas (V13: hash MD5 de 965 movimientos ajenos idéntico) |
| 8 | COGS histórico corregido | **PASS** | V7: crédito GAS_COSTO_VENTAS 21.450.370,50 por unidades vendidas de la capa FVC (reparto §10) |
| 9 | Vales y pérdidas conciliados | **PASS** | V7: GAS_VALES 5.913.947,50 · GAS_PERDIDA_INV 9.691.030,00 |
| 10 | Servicio SKU999 correctamente tratado | **PASS** | V16: uc=1 · subtotal 4,00 · is_service=true · sin capa nueva ni WAC nuevo |
| 11 | Cuenta por pagar conciliada | **PASS** | V8: CXP neta del documento = 5.861,50 (192.039.436 − 151.299.851 − 40.733.723,50) |
| 12 | RECT-1 y RECT-2 conservadas sin duplicación | **PASS** | V9: 4 asientos posted (reconocimiento, ajuste_manual ×2, RECT-011) intactos · COGS 7 CUP no duplicado |
| 13 | Debe = Haber | **PASS** | V6: balance RECT-011 = 0,00 con 5 movimientos |
| — | T12 activa | **PASS** | V10: `fin_t12_receipt_annulment_block` tgenabled=O |
| — | `fin_posting_errors` sin errores nuevos injustificados | **PASS** | V11: 0 errores FVC desde el inicio de la ejecución |
| — | Cero cambios en otras recepciones | **PASS** | V12/V15: 0 líneas y 0 cabeceras ajenas tocadas (ventana de ejecución) |
| — | Cero cambios en precios de venta | **PASS** | V5: 0 precios divergentes vs matriz congelada |
| — | SKU111/112 intactas (§7) | **PASS** | V16: uc 1 · WAC 1 · precios 2.000/1.000 CUP · stock 8,8/20 · RECT-1 no repetida |

**Matriz final verificable por SKU:** `RECEIPT_101_ALL_COSTS_1_CUP.xlsx` (hoja `Matriz_101_lineas`, 101 filas) y `scripts/out/m011/after-matriz.json`.

## 2. Controles numéricos reproducidos desde la BD

- Σ cantidades: **5.861,5000** (101 líneas; idéntico al listado del propietario §5; 0 diferencias).
- Σ subtotales ANTES (equivalente CUP): **40.739.585,00** = cabecera (81 CUP 5.129.855,00 + 20 USD 52.367,25 × 680).
- Σ subtotales DESPUÉS: **5.861,50** = 5.861,50 u × 1,00 CUP.
- Diferencia aplicada: **40.733.723,50 CUP** (idéntica a la §5 del propietario).
- Asiento RECT-011: **DR PAS_CXP_PROV 40.733.723,50** / **CR ACT_INVENTARIO 3.678.375,50 · GAS_COSTO_VENTAS 21.450.370,50 · GAS_VALES 5.913.947,50 · GAS_PERDIDA_INV 9.691.030,00** · Debe−Haber = 0,00.
- CXP del documento: 192.039.436,00 − 151.299.851,00 (RECT-1) = 40.739.585,00 − 40.733.723,50 (RECT-011) = **5.861,50** · `payment_status=unpaid` · 0 pagos.

## 3. Idempotencia (§12)

- Re-ejecución de los lotes A–D probada **dos veces**: (a) E2E BD aislada (m075 --verify: reejecución de los 4 lotes → 0 cambios); (b) producción (reanudación: A/B/C re-ejecutadas con `S1_previas=0` antes de aplicar D).
- V18 (read-only): `s1=s2=s3=0` (0 filas no conformes), `wcl=25`, `entrada=1` → re-ejecutar los lotes tocaría 0 filas.

## 4. Integridad del alcance (§6)

- Escrituras limitadas por `receipt_id`/`reference_id` = FVC + `WHERE (estado ≠ objetivo)` + `ON CONFLICT DO NOTHING`.
- 183 filas de auditoría con `trace_id='RECT011-PROD'` (78 VALUATION + 78 MOV_UC + 25 WAC + 1 TOTAL + 1 ENTRY), ids deterministas md5.
- Cero escrituras en: otras recepciones, precios de venta, movimientos ajenos (V13 hash MD5), productos fuera de alcance (V14), cabeceras ajenas (V15).
- SKU999 conservó su naturaleza de servicio (sin existencias físicas inventadas, sin WAC forzado).

## 5. Veredicto

**RECT-011 VERIFICADA — misión cumplida (§13).** Las 101 líneas de FAC-VITALLCONS-001 quedan a 1,00 CUP/u, la cabecera en 5.861,50 CUP, las capas y el WAC recalculados, la contabilidad equilibrada y la cuenta por pagar del documento en 5.861,50 CUP, con RECT-1/RECT-2 intactas y cero efectos fuera de la recepción.
