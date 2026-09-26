# FASE E-SEC — 08 INVENTORY INTEGRITY (GATE E8)

## Fecha
2026-09-26 · pre y post fix, mismo fixture (solo tienda sintética).

## Comando
GET-only sobre `stock_movements` (por `reference_id = transaction_id`),
`products.stock_current` e `inventory.quantity` (service-role, solo lectura).

## Resultado (post-fix, extracto de la conciliación de la matriz)

```text
TODAS las ventas creadas (pre y post) cumplieron:
  transactions.subtotal == Σ transaction_items.price_at_sale × quantity
  1 movimiento 'sale' por ítem con quantity_change = −qty
  balance_after coherente con la secuencia de inventory (trigger fn_sync_inventory_on_movement)
```

Casos de verificación específicos:
| Verificación | Resultado |
|---|---|
| Venta 500→490 (UI real, tx 1f849f7d) | mov −1, balance_after 14 ✓ |
| Venta 500→300 con supervisor (tx 3c0b7624) | mov −1 ✓ |
| Oversell (FASE D + matriz): qty > stock | 409 ERR_INSUFFICIENT_STOCK — stock inmutable ✓ |
| Venta rechazada (403/422/400) | **0 movimientos, 0 ventas, 0 filas** (rollback completo de la TX) |
| Venta contra tienda ajena (A24) | 400 ERR_STORE_MISMATCH → rollback: 0 filas en la tienda ajena (verificado GET-only) |
| Costo (WAC) | SIEMPRE server-side (`cost_at_sale = products.cost_average` bajo FOR UPDATE, DF-02) — el `cost` del cliente es IGNORADO pre y post fix |
| WAC / costo promedio | la modificación de precio NO toca `cost_average` ni `stock_current` más allá del decremento normal de la venta |

## Interpretación
E8 cumple: el desvío de precio no altera cantidades, costos ni movimientos; solo
produce las consecuencias normales de cerrar (o rechazar) la venta. Los rechazos de
precio post-fix dejan huella CERO en inventario (transacción atómica).
