# 12 — INVENTORY INVARIANTS

## Invariante de cantidad (directiva §16)

```
stock_after = stock_before - qty
```

Verificación empírica (suite P8 + P1, fixture con seed 10):

| Momento | stock_before | qty | stock_after | Check |
|---|---|---|---|---|
| P1 | 10 | 1 | 9 | PASS |
| P8 (tras P1+P3+P4) | 7 | 2 | 5 | PASS |
| P11 (concurrencia) | 10 | 2 | 8 | PASS |

## Invariantes adicionales verificadas

| Invariante | Evidencia |
|---|---|
| `actual_qty` del item acumula exactamente los retiros (1+1+1+2=5) | P8: actual_qty == 5 |
| Item pasa a `completed` cuando actual ≥ budgeted | P8: status == completed |
| Suma absoluta de movimientos == total retirado (5) | P9: sum(abs(qty_change)) == 5 |
| Cada retiro genera EXACTAMENTE 1 movimiento `production_out` | P11: 1 retiro → 1 movimiento |
| Sin stock negativo posible: overconsumption guard (actual+qty>budgeted → DENY) | P11/P12: 400 |
| Deny no muta NADA (stock, item, ledger) | P5/P6: snapshots idénticos pre/post deny |
| Concurrencia: `FOR UPDATE` serializa; 2 retiros paralelos sobre ceiling → 1 éxito + 1 deny; sin lost update ni doble consumo | P11 |

## WAC invariante en retiros

El retiro LEE el WAC pero NO re-precifica: tras 4 retiros, WAC == 100
(idéntico al post-seed) y `wac_change_log` mantiene solo la contribución de
la recepción (1 evento). P9.
