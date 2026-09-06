# W9.5 — B-10b-OBS-2-R2 · 15-decimal-stock.md
# GATE 15 — PRODUCTO DECIMAL · PASS

Fixture: CAT-0087 `983e5726` — stock de apertura **95.5** (Cable Solar Negro 4mm, unit_cost 2835, price 4.5).

## Operación

```text
venta:  create_sale_v2(items=[{product_id: 983e5726…, quantity: 1.5, price_at_sale: 4.5}],
                       total=6.75, subtotal=6.75, cash)
```

## Verificación de precisión (P12)

| Fuente | Valor exacto (texto) | Esperado | OK |
|---|---|---|---|
| products.stock_current | **`94.0000`** | 95.5 − 1.5 = 94.0 | ✓ |
| inventory.quantity | **`94.0000`** | 94.0 | ✓ |
| movement balance_after | **`94.0000`** | 94.0 | ✓ |
| is_exact_94 (`stock_current = 94 ∧ round(stock_current,4) = stock_current`) | **true** | true | ✓ |

```text
Prohibiciones verificadas:
  93 (pérdida de parte decimal)        → NO  (94.0000)
  94.0000000001 (drift binario)        → NO  (numeric(12,4) exacto; round(…,4)==valor)
  truncamiento silencioso              → NO  (1.5 procesado íntegro; price 4.5×1.5=6.75 exacto)
Tipos: stock_current / inventory.quantity / quantity_change / balance_after = numeric(12,4)
```

## Reversibilidad (P12b)

```text
void:  void_transaction(tx_decimal) → SUCCESS
stock: 94.0000 + 1.5 = **95.5000** (products e inventory, texto exacto) — restauración sin drift
netting de la venta decimal: −1.5 + 1.5 = 0                                ✓
```

## Coherencia con la apertura

El `initial` del batch R1 (95.5 @ 2835) permaneció bit a bit intacto durante toda la operación; el kardex registró `out` 1.5 con unit_cost 2835 (fila 1:1 del movement).

## Veredicto GATE 15

```text
PASS — arithmetic decimal exacta en numeric(12,4); sin pérdida, sin drift, reversible
```
