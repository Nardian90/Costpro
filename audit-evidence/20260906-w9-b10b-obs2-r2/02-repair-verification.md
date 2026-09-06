# W9.5 — B-10b-OBS-2-R2 · 02-repair-verification.md
# GATE 1 — REPAIR BASELINE · PASS

Verificación READ-ONLY (`scripts/r2_gate1.sql` → `raw/r2_gate1.json`) de que el repair batch continúa exactamente como quedó al finalizar R1 (commit `90450273`, acta `20260906-w9-b10b-obs2-r1/06-postconditions.md`).

## Forma del batch

| Métrica | Esperado | Observado | OK |
|---|---:|---:|---|
| movements (reference_doc = batch) | 98 | **98** | ✓ |
| Σ quantity_change (unidades) | 6427 | **6427** | ✓ |
| Σ(quantity_change × unit_cost) exacto | 9.932.216,938816005 | **9.932.216,938816005** | ✓ |
| distinct_products | 98 | **98** | ✓ |
| movement_types | ['initial'] | **['initial']** | ✓ |
| inventory rows tienda | 98 | **98** | ✓ |
| Σ inventory tienda | 6427 | **6427** | ✓ |
| kardex rows (reference_description = batch) | 98 | **98** | ✓ |
| kardex value @numeric(12,2) | 9.932.216,94 | **9.932.216,94** | ✓ |
| business_events (type='initial') | 98 | **98** | ✓ |
| audit STOCK_RECONCILIATION_OPENING | 1 | **1** | ✓ |
| created_by DISTINCT | [051c6157…] | **[051c6157…]** | ✓ |

## Triada canónica por producto (98)

`products.stock_current == inventory.quantity == Σmovements`, con `n=1` movimiento por producto:

```text
mismatches = []   (0 de 98)
```

## Baseline global R2 (PRE de esta fase — idéntico al POST de R1)

```text
products_all=323 · products_store=124 · products_store_stock=6553 · products_store_cost=6.132.624,960555917
inventory_all=239 · inventory_sum=11.405,6289 · stock_movements_all=800 · stock_movements_sum=11.405,6289
kardex_all=800 · business_events_all=10.651 · audit_logs_all=7.377 (store 366)
transactions_all=520 (store 0) · transaction_items_all=555 · payments_all=366 · commissions_all=0
wac_log_all=14 (store 0) · devolutions_store=13 · receipts_store=0 · transfers_all=0
isolation: inventory_other=141 · movements_other=702 · kardex_other=702
```

Estas 24 métricas son la referencia PRE contra la que se comparará el POST final (GATE 25) — `raw/r2_gate1.json`.

## Veredicto GATE 1

```text
PASS — batch íntegro; nada modificado
```
