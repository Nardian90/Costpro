# RECT1_EXECUTION_EVIDENCE — CP-FIN-FINAL-VALUATION-EXECUTION-009

**Operación:** RECT-1 — corrección del exceso de valoración SKU 111/112 · **151.299.851,00 CUP**
**Autorización:** propietario (misión 009 §1) · **Runbook:** RECT004 §5 + addendum T12
**Ejecución:** 2026-11-16T16:06:56.345Z → 2026-11-16T16:06:58.794Z (HTTP 201) · canal Management API `/database/query`, UNA llamada = UNA transacción atómica · producción `wthkddeleylijmonclxg`

## 1. Identificadores deterministas (sin colisión — m060 T8)

| Elemento | Id |
|---|---|
| Asiento RECT-1 | `7ec90009-0000-4000-8000-d0b300000001` |
| Movimiento D `PAS_CXP_PROV` | `7ec90009-0000-4000-8000-f0b300000001` |
| Movimiento C `ACT_INVENTARIO` | `7ec90009-0000-4000-8000-f0b300000002` |
| wac_change_log SKU111 / SKU112 | `…-9cb300000001` / `…-9cb300000002` |
| Auditoría (6 filas) | `…-e0b300000001` … `…-e0b300000006` |
| `trace_id` | `RECT-PROD` |

## 2. Guards intra-transacción (cerrados en la MISMA llamada — ventana TOCTOU = 0)

- **A-1 deuda:** `payment_status='unpaid'`, `paid_amount=0`, status ∈ {active} → superado.
- **A-2 líneas íntegras:** 2 filas en 2500/1000 USD@680 → superado.
- **A-3 sin RECT previa:** 0 `fin_entries` con `document_id=FVC` y `event='ajuste_manual'` → superado.
- **A-5 conteos:** S1=2 · S2=1 · S3=2 · S4=2 · S5=1+2 · S6=6 (RAISE EXCEPTION si difieren) → superados.
- **A-6 balance:** `sum(débito−crédito) WHERE entry_id=RECT-1` = 0,00 → superado.
- Concurrencia: `pg_advisory_xact_lock(hashtext('fin:RECEPCION:'||FVC))`.
- Escape hatch M021: `SET LOCAL app.allow_receipt_item_edit='on'` (solo sesión; guard `trg_receipt_items_economic_immutable` lo exige).

## 3. Efectos aplicados (valores ANTES reales de `audit_logs.old_data`)

| Tabla | Registro | ANTES | DESPUÉS |
|---|---|---|---|
| receipt_items | línea 111 `80a1767b…` | 2.500,00 USD @ tasa 680 | 1,00 CUP @ tasa 1 |
| receipt_items | línea 112 `9c9e6010…` | 1.000,00 USD @ tasa 680 | 1,00 CUP @ tasa 1 |
| receipts | cabecera `fd9d6c88…` | total_cost 192.039.436,00 | total_cost 40.739.585,00 |
| stock_movements | capa compra 111 `5f58e2b1…` | uc 1.700.000 | uc 1 |
| stock_movements | capa compra 112 `8552e290…` | uc 680.000 | uc 1 |
| fin_entries | asiento RECT-1 | — (nuevo) | ajuste_manual · posted · `reversal_of=93bb5da9…` |
| fin_movements | 2 filas | — (nuevas) | D `PAS_CXP_PROV` 151.299.851 / C `ACT_INVENTARIO` 151.299.851 |
| wac_change_log | 2 filas | — (nuevas) | event `rectificacion`, wac 1→1, qty_in 10/20, uc_in 1 |

**Semántica `reversal_of` (RECT004):** asiento correctivo con `document_type='RECEPCION'`, `document_id=FVC`, `document_number='FAC-VITALLCONS-001-RECT'`, `event='ajuste_manual'`, `reversal_of` = asiento original — la tupla es única por `uq_fin_entries_doc_event` (con `coalesce(payment_ref)`). NO es una contabilidad `RECEPCION` nueva ni una anulación. Índice único verificado (m060 T1).

## 4. Respuesta de la transacción (RETURNING = valores POST-update)

`S1: 2 filas` · `S2: 1 fila` · `S3: 2 filas` · `S4: 2` · `S5_entry: 1` · `S5_movements: 2` · `S6_audit: 6` · `balance_debe: 0` — evidencia completa en `evidencias/m061-rect1-ejecucion.json` (incluye nota de semántica RETURNING; los valores ANTES reales están en la tabla §3 y en `audit_logs.old_data`).

## 5. Post-verificación inmediata (m061 --verify — 9/9 PASS)

V1 cabecera 40.739.585,00·unpaid·active · V2 líneas a 1 CUP@1 · V3 capas uc=1 · V4 asientos FVC=2 (original intacto + RECT-1 enlazado) · V5 D=C=0,00 · V6 par exacto 151.299.851 D/C · V7 idempotencia 0 filas · V8 auditoría 6 filas · V9 ninguna otra línea tocada.

## 6. Prohibiciones respetadas

- No se anuló la recepción (status intacto `active`; T12 sin intervenir).
- No se debitó `GAS_COSTO_VENTAS`.
- No se tocó el asiento original 93bb5da9 (intacto, posted).
- No se modificó ninguna otra línea/capa/documento fuera del alcance (V9 + m063 R8: 99/99 líneas protegidas idénticas).
