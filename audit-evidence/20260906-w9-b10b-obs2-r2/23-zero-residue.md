# W9.5 — B-10b-OBS-2-R2 · 23-zero-residue.md
# GATE 23 — ZERO TEST RESIDUE · PASS

Después de limpiar/rollback de fixtures (cada script termina en `ROLLBACK;`), dos capturas POST independientes (`r2_post_capture.sql`):

1. `raw/r2_post_global.json` — tras el **master test** (GATE 4-16, 23 pasos)
2. `raw/r2_post_after_races.json` — tras las **races de concurrencia** (2 conexiones × 4)

## Δ de las tablas tocadas por las pruebas (PRE GATE 1 → POST)

| Tabla | PRE | POST master | POST races | Δ |
|---|---:|---:|---:|---|
| transactions | 520 | 520 | 520 | **0** |
| payment_transactions | 366 | 366 | 366 | **0** |
| commission_payments | 0 | 0 | 0 | **0** |
| stock_movements | 800 | 800 | 800 | **0** |
| kardex_entries | 800 | 800 | 800 | **0** |
| inventory | 239 | 239 | 239 | **0** |
| business_events | 10.651 | 10.651 | 10.651 | **0** |
| audit_logs | 7.377 | 7.377 | 7.377 | **0** |
| wac_change_log | 14 | 14 | 14 | **0** |
| products | 323 | 323 | 323 | **0** |

**24/24 métricas globales idénticas en ambas capturas** — comparador en `iteration-19…test.ts` (describe D) y en `raw/r2_races_summary.json`.

## Fixture residues = 0 en todas las tablas tocadas

```text
5 ventas sintéticas (tx1 cash, tx2 zelle, tx5 decimal, tx3 high-stock, tx4 FB2) → ROLLBACK
10 movements (5 sale + 4 sale_void + 1 sale_reverse)                            → ROLLBACK
10 kardex · 10 business_events · 5 transaction_items · 6 payments               → ROLLBACK
audit: 5×CREATE_SALE_V2 + 4×VOID_SALE + 1×REVERSE_TRANSACTION_V2 + status-audit → ROLLBACK
temp tables (r2_results / rl)                                                   → ROLLBACK
```

El estado final in-tx del master (`final_state`: FA 19, FB 95.5, FB2 91.5, FC 966, batch 98) demuestra además que los fixtures quedaron restaurados ANTES del rollback: la restauración no depende del ROLLBACK, sino del pipeline (void/reverse) — el ROLLBACK solo garantiza que las filas de prueba no persistan.

## Veredicto GATE 23

```text
PASS — fixture residues = 0 en todas las tablas; Δ=0 verificada dos veces
```
