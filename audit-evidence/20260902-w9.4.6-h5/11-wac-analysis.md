# W9.4.6 — H-5 · FASE 11 · Análisis WAC / single-writer

## Mecanismo W7 en producción (verificado en vivo)

- Trigger `trg_guard_wac_writer` ON products BEFORE UPDATE OF cost_average → fn `w62_guard_wac_writer`:
  exige `current_setting('app.wac_writer')='fn_recalc_wac'`; sin token → `ERR_WAC_SINGLE_WRITER_VIOLATION`.
- Único escritor legal: `fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb)` (secdef, `search_path=public, extensions`, log en `wac_change_log`).
- **Prueba en vivo (P9, `raw/probes/p9_wac_guard.txt`)**: `UPDATE products SET cost_average=cost_average+1` sin token →
  `ERR_WAC_SINGLE_WRITER_VIOLATION: UPDATE cost_average sin token (OLD=0 NEW=1). Unico escritor: fn_recalc_wac`. Guard ACTIVO.

## ¿Escribe WAC alguna versión?

| Camino | ¿Toca cost_average? | ¿Vía token? | Veredicto |
|---|---|---|---|
| V1 (`reverse_transaction`) | NO — solo `stock_current` directo + kardex snapshot | n/a | sin violación del guard; WAC invariante |
| V2 (`reverse_transaction_v2`) → `register_stock_movement` | NO — comentario A2 hotfix v2.22.0: "cost_average stays as-is … until Grupo B/C adds WAC logic" | n/a | sin violación; WAC invariante |
| V2 → triggers stock_movements | `auto_kardex_on_stock_movement`/`sync_product_stock` no tocan cost_average (solo balance/stock_current) | n/a | OK |

- No existe `GREATEST(0,…)` sobre cost_average en ningún cuerpo (búsqueda en 02-live-function-definitions.sql).
- `fn_recalc_wac` NO es invocado por ninguna de las dos versiones — correcto semánticamente: reversa de venta = entrada de mercancía a su costo de salida; el modelo W7 declara "devolución A1 / evento neutro: WAC INVARIANTE".

## Riesgo de ERR_WAC_SINGLE_WRITER_VIOLATION por las reversiones

NULO: ninguna versión ejecuta UPDATE sobre columnas de costo. El guard solo vigila `cost_average`; `stock_current` no está bajo single-writer (se sincroniza por triggers de stock_movements — V2 — o se escribe directo — V1).

## Observación de integridad (no-WAC, para matriz de riesgos)

V1 actualiza `products.stock_current` SIN pasar por `stock_movements`/`inventory`:
- `inventory.quantity` (fuente de verdad desde `5e2fa2a`) queda desincronizada tras cada reversión V1.
- Divergencia preexistente products_sum_stock(12094.63) vs inventory_sum_qty(4978.63) — preexistente al baseline, NO atribuible a este par (baseline 05-pre-baseline.json; el gap existe con 0 reversiones ejecutadas).
- Clasificado P3-backlog (V1 solo alcanzable con flag OFF + service_role).
