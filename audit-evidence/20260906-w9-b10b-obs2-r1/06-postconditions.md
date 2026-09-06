# W9.5 — B-10b-OBS-2-R1 · 06-postconditions.md
# §21 POST-EXECUTION VERIFICATION + §32 invariantes finales — 29/29 PASS

Comparador completo: `scripts/r1_check_post.js` · raw: `raw/r1_post_verification.json`,
`raw/r1_post_snapshot34.json`, `raw/r1_post_verdict.json`.

## 34 métricas PRE → POST (deltas = proyección exacta del diseño)

| Métrica | PRE | POST | Δ |
|---|---:|---:|---:|
| inventory_all | 141 | 239 | **+98** |
| inventory_store | 0 | 98 | **+98** |
| inventory_sum | 4.978,6289 | 11.405,6289 | **+6427** |
| stock_movements_all | 702 | 800 | **+98** |
| stock_movements_store | 0 | 98 | **+98** |
| stock_movements_sum | 4.978,6289 | 11.405,6289 | **+6427** |
| kardex_all | 702 | 800 | **+98** |
| kardex_store | 0 | 98 | **+98** |
| audit_logs_all | 7.376 | 7.377 | **+1** |
| audit_logs_store | 365 | 366 | **+1** |
| products_store_stock | 6.553 | 6.553 | 0 |
| products_store_cost | 6.132.624,960555917 | 6.132.624,960555917 | 0 |
| transactions_all / store | 520 / 0 | 520 / 0 | 0 |
| payments_all | 366 | 366 | 0 |
| commissions_all | 0 | 0 | 0 |
| wac_log_all / store | 14 / 0 | 14 / 0 | 0 |

## Invariantes del mandato (§18) — todas PASS

```text
I1  98 productos reparados (triada canónica 98/98: inventory==stock_current==Σmovements)
I2  Σ opening movements = 6427 (exacto)
I3  products.stock_current == inventory.quantity para los 98 (98/98)
I4  inventory.quantity == apertura aprobada por producto (98/98, version=1)
I5  Kardex consistente 1:1 con movements (98/98 'in' @numeric(12,2))
I6  WAC preservado bit a bit (cost_average 98/98 == frozen; Σ tienda idéntica)
I7  0 transactions creadas (store 0; global 520)
I8  0 payments creados (global 366)
I9  0 commissions creadas (global 0)
I10 0 ventas históricas modificadas (transaction_items 555; devolutions 13; receipts 0)
I11 0 otras tiendas modificadas (inventory_other 141, movements_other 702, kardex_other 702)
I12 Exactamente 1 repair batch (audit row = 1; family rows = 98; distinct docs = 1)
I13 Exactamente 98 opening movements
I14 0 productos Test incluidos
I15 Actor correcto (created_by DISTINCT = [051c6157…] en las 98)
I16 Referencia trazable end-to-end (kardex.reference_description = batch en 98/98)
```

## §32 estado final de la DB

```text
products.stock_current == inventory.quantity  →  98/98 productos afectados
Σ repaired movement quantity = 6427           →  exacto
98 inventory rows · 98 initial movements      →  verificado
negative stock        → 0 casos (prevent_negative_inventory + verificación)
WAC drift             → 0 (cost_average bit a bit; wac_change_log +0)
duplicate batch       → 0 (una sola familia reference_doc; audit rows = 1)
duplicate movement    → 0 (1 movimiento por producto; has_movements=true 98/98)
cross-store effect    → 0 (aislamiento verificado)
financial mutation    → 0 (§19)
```
