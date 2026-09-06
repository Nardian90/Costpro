# W9.5 — B-10b-OBS-2-R1 · 04-universe-validation.md
# §4 universo — comparación exacta esperado vs actual (autoridad: CSV congelado)

## Identificación

```text
repair_batch_id:   B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW
store:             d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576 (TIENDA CENTRAL COSTPRO)
actor:             051c6157-600b-425e-b8c0-72388bacf541 (RECONCILIATION_EXECUTOR)
mechanism:         register_stock_movement('initial') × 98
modelo:            D = B + C
```

## Comparación por fila (§4: expected_qty == actual_qty · expected_wac == actual_wac)

Las 98 filas se validaron una a una en DOS capas independientes:

1. **Capa Node (pre-ejecución)** — `r1_check_universe.js` vs `raw/r1_universe_current.json`:
   98/98 `Number(db) == Number(csv)` para qty y WAC + float64 igualdad con
   `raw/r1_exact_decimals.json`. Resultado PASS (raw `r1_universe_verdict.json`).
2. **Capa SQL en-transacción (§15 TOCTOU)** — DO block `$r1_pre$` dentro de la
   transacción con las 98 filas bajo `FOR UPDATE`: por fila,
   `stock_current IS DISTINCT FROM q OR cost_average IS DISTINCT FROM w` →
   `RAISE ERR_UNIVERSE_DRIFT`. Resultado: 0 excepciones (las 98 pasaron).

La tabla completa expected vs actual (product_id, sku, expected_qty, actual_qty,
expected_wac, actual_wac) queda congelada en:

- `raw/r1_exact_decimals.json` (texto decimal exacto de la DB, 98 filas)
- `raw/r1_universe_current.json` (estado completo 124 filas)
- CSV aprobado: `../20260906-w9-b10b-obs2-repair-design/07-proposed-opening.csv`

Cualquier desviación habría disparado `ABORT` por A9 — no hubo ninguna.

## Composición del universo

```text
Set A (FROZEN_MATCH, backup==current):        94 productos · 4.961 u
Set B (DELTA_CONFIRMED_BY_EVENTS):             4 productos · 1.466 u
────────────────────────────────────────────────────────────────
Total apertura:                               98 productos · 6.427 u
Excluidos Test (TEST_RESIDUE):                10 productos ·   126 u  (§5 PASS)
Excluidos stock-0 (sin posición):             16 productos ·     0 u
Universo tienda:                             124 productos · 6.553 u declaradas
```
