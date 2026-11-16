# RECT2_EXECUTION_EVIDENCE — CP-FIN-FINAL-VALUATION-EXECUTION-009

**Operación:** RECT-2 — reconocimiento de salidas de inventario sin asiento · **24,00 CUP**
**Autorización:** propietario (misión 009 §1) · **Runbook:** RECT004 §6 · transacción SEPARADA de RECT-1
**Ejecución:** 2026-11-16T16:07:46.569Z → 2026-11-16T16:07:48.916Z (HTTP 201) · canal Management API `/database/query`, UNA llamada = UNA transacción atómica · producción `wthkddeleylijmonclxg`

## 1. Identificadores deterministas (sin colisión — m060 T8)

| Elemento | Id |
|---|---|
| Asiento RECT-2 | `7ec90009-0000-4000-8000-d0b300000002` |
| Movimiento D `GAS_VALES` | `7ec90009-0000-4000-8000-f0b300000003` |
| Movimiento D `GAS_PERDIDA_INV` | `7ec90009-0000-4000-8000-f0b300000004` |
| Movimiento C `ACT_INVENTARIO` | `7ec90009-0000-4000-8000-f0b300000005` |
| Auditoría (8 filas) | `…-e0b300000007` … `…-e0b300000014` |
| `trace_id` | `RECT-PROD` |

## 2. Pre-guards intra-transacción

- **RECT-1 aplicada:** 1 `fin_entries` con id RECT-1, `document_id=FVC`, `event='ajuste_manual'`, `status='posted'` → superado (reanudación §9 del runbook).
- **Sin RECT-2 previa:** 0 filas con id RECT-2 o tupla (AJUSTE_INVENTARIO, FVC, ajuste_manual) → superado.
- **A-5 conteos:** T1 = exactamente 7 filas y los ids DEBEN ser los 7 congelados (sum 26 u) — RAISE si difieren; T2 = 1+3; T3 = 8 → superados.
- **A-6 balance:** D=C = 0,00 → superado.
- Concurrencia: `pg_advisory_xact_lock(hashtext('fin:RECEP2:'||FVC))`.

## 3. Correspondencia documental exacta (cada movimiento a su documento)

| Movimiento kardex | Documento origen | SKU | Unidades | Cuenta reconocida | Importe |
|---|---|---|---:|---|---:|
| `335e2fcc…` | VS-000037-2026 | 112 | 4 | `GAS_VALES` | 4,00 |
| `9d47f6c1…` | VS-000138-2026 | 112 | 1 | `GAS_VALES` | 1,00 |
| `25db100f…` | VS-000139-2026 | 111 | 1 | `GAS_VALES` | 1,00 |
| `a1330957…` | Cuadre importación Δ−1 (2026-08-18) | 111 | 1 | `GAS_PERDIDA_INV` | 1,00 |
| `a8a82720…` | Cuadre importación Δ−17 (2026-08-18) | 112 | 17 | `GAS_PERDIDA_INV` | 17,00 |
| `68a3ff08…` · `673ede95…` | 2 ventas POS (COGS ya en el mayor) | 111 | 1+1 | — (solo valorización kardex) | — |
| **Asiento RECT-2** | **FAC-VITALLCONS-001-RECT-SAL** | — | 24 u de alcance | D VALES 6 + D PERDIDA 18 / C ACT 24 | **24,00** |

- `GAS_VALES` 6,00 = VS-37 (4) + VS-138 (1) + VS-139 (1) — sin asiento previo (m060 S7).
- `GAS_PERDIDA_INV` 18,00 = cuadre Δ−1 (111) + Δ−17 (112) — sin inventory_adjustments ni asiento previo (m060 C.4).
- **NO duplicado:** vales ya contabilizados (VS-148/157/158/165/208/225), COGS del motor (7 CUP), reingresos (VS-000223 par neto 0 — NO contabilizado), transferencias, movimientos de otros SKU.
- Los 2 movimientos de venta (2 u) solo se revalorizaron en kardex (uc 0→1); su costo ya estaba en `GAS_COSTO_VENTAS` — **sin otro 2 CUP** (W4: 0 movimientos nuevos).

## 4. Efectos aplicados (valores ANTES reales de `audit_logs.old_data`)

| Tabla | Registros | ANTES | DESPUÉS |
|---|---|---|---|
| stock_movements | las 7 salidas congeladas | uc 0 | uc 1 (26 u valorizadas) |
| fin_entries | asiento RECT-2 | — (nuevo) | AJUSTE_INVENTARIO · ajuste_manual · posted · economic_date 2026-11-15 |
| fin_movements | 3 filas | — (nuevas) | D `GAS_VALES` 6 / D `GAS_PERDIDA_INV` 18 / C `ACT_INVENTARIO` 24 |
| audit_logs | 8 filas | — (nuevas) | 7 SYSTEM_RECT_MOV_SALIDA (doc por fila) + 1 SYSTEM_RECT_ENTRY |

## 5. Post-verificación inmediata (m062 --verify — 6/6 PASS)

W1 par exacto (0,00 balance; 6/18/24) · W2 salidas uc=0 restantes = 0 · W3 las 7 congeladas a uc=1 · W4 COGS 7,00 CUP en 5 asientos intacto y 0 GAS_COSTO_VENTAS nuevo asociado a RECT/FVC · W5 3 asientos de la FVC todos posted · W6 auditoría total 14 filas.

## 6. Prohibiciones respetadas

- No se debitaron `GAS_COSTO_VENTAS` adicionales (el motor ya reconoció 7 CUP).
- No se contabilizó VS-000223 (par neto 0).
- No se duplicaron vales contabilizados, reingresos, transferencias ni movimientos de otros SKU.
- No se tocó RECT-1 ni el asiento original (ambos intactos y posted).
