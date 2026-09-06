# W9.5 — B-10b-OBS-2-R2 · 22-ledger-consistency.md
# GATE 22 — LEDGER CONSISTENCY · PASS

Coherencia `inventory ↔ stock_movements ↔ kardex ↔ business_events` para todos los productos reparados, tras todas las pruebas.

## El initial sigue siendo exactamente uno por producto reparado

```text
movements con reference_doc = batch         : 98 (types = ['initial'], distinct products = 98)
business_events payload.type = 'initial'    : 98
kardex reference_description = batch        : 98
inventory rows tienda                       : 98 (sum 6.427)
audit STOCK_RECONCILIATION_OPENING          : 1  (batch único, idempotencia R1 intacta)
```

## Cadena de generación observada (misma para venta, void y reverse)

```text
register_stock_movement
  → fn_sync_inventory_on_movement (BEFORE): inventory.quantity += Δ · version++ · balance_after
  → trg_auto_kardex (AFTER 1:1): kardex out/in/sale_reverse con qty ABS(Δ), unit_cost, balance
  → trg_sync_product_stock (AFTER): products.stock_current = último balance_after
  → business_events (event_type='stock_movement', payload {store_id, qty, type, new_qty})
```

## Evidencia por eslabón (in-tx, P2/P3/P15 + POST)

| Invariante | Resultado |
|---|---|
| kardex rows == movements rows por fixture y por tienda (1:1, trigger) | ✓ (P15: kar == moves en 4/4 fixtures; tienda 800/800 POST) |
| inventory.quantity == Σ movements (ledger-derived) | ✓ (P2, P8, P15; GATE 21 tienda-completa) |
| products.stock_current == inventory.quantity | ✓ (98/98 sin mismatch fuera de los Test) |
| business_events 1:1 con movements nuevos (10 in-tx, 0 net POST) | ✓ |
| balance_quantity de kardex = stock post-movimiento | ✓ (17, 965, 94 — observado y documentado) |
| Σ kardex total_value del batch = 9.932.216,94 @2dp | ✓ (POST == R1) |

## Veredicto GATE 22

```text
PASS — los cuatro eslabones del ledger permanecen coherentes bajo operación completa
```
