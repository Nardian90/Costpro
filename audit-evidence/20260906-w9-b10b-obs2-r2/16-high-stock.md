# W9.5 — B-10b-OBS-2-R2 · 16-high-stock.md
# GATE 16 — PRODUCTO DE STOCK ELEVADO · PASS

Fixture: `da1c4090` CAT-0002 (Abrazade metálica de 1 pulgada) — 966 unidades, WAC 11,919422583856775. Confirmado dentro del universo (fila 2 del CSV congelado `07-proposed-opening.csv`; cantidad actual real = 966).

## Operación pequeña y reversible (in-tx, P13/P13b)

```text
venta:  create_sale_v2(items=[{product_id: da1c4090…, quantity: 1, price_at_sale: 350}], total=350, cash)
→       stock 966 → 965 · SUCCESS
void:   void_transaction(tx) → SUCCESS
→       stock 965 → 966 (restauración exacta)
```

## Demostraciones específicas

| Riesgo | Verificación | Resultado |
|---|---|---|
| overflow | stock_current 966/965 dentro de numeric(12,4) (máx 99.999.999,9999); `no_overflow` = true | ✓ |
| race | operación única in-tx; advisory lock de tienda + FOR UPDATE del producto en todo momento | ✓ |
| WAC anomaly | cost_average texto exacto `11.919422583856775` antes == después; wac_change_log 0 | ✓ |
| kardex inconsistency | fila `out` qty=1 · unit_cost=11.92 @numeric(12,2) · balance_quantity=965 · balance_total_value=965×WAC — 1:1 con el movement | ✓ |
| negativo | nunca: 965 ≥ 0 tras venta; guard de 3 capas vigente (14-negative-stock.md) | ✓ |

## Contexto de la magnitud

CAT-0002 es además el producto con el journal histórico más grande (156 business_events pre-purge) y la mayor apertura del batch junto con CAT-0001: la coexistencia de journal largo + stock elevado + operación viva no produjo ninguna anomalía de ledger (P15: triada exacta 966/966/966 al cierre).

## Veredicto GATE 16

```text
PASS — el gran stock opera sin overflow, race, anomalía WAC ni inconsistencia de kardex
```
