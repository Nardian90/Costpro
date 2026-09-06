# W9.5 — B-10b-OBS-2-R2 · 14-negative-stock.md
# GATE 14 — NEGATIVE STOCK · PASS

Prueba: P11 — venta sintética de 1000 unidades del Fixture C (`da1c4090`, stock conocido 966) dentro del sandbox.

```text
intent:  create_sale_v2(items=[{product_id: da1c4090…, quantity: 1000}], total=350.000, subtotal=350.000)
result:  EXCEPTION ERR_INSUFFICIENT_STOCK
         "ERR_INSUFFICIENT_STOCK: product …, stock 966, requested 1000"
```

## Verificación 0-mutación (antes == después, paso a paso)

| Tabla / métrica | before | after | Δ |
|---|---:|---:|---:|
| stock_movements del producto | 1 (initial) | 1 | **0** |
| products.stock_current | 966 | 966 | **0** |
| inventory.quantity | 966 | 966 | **0** |
| inventory.version | 1 | 1 | **0** |
| transactions de la tienda | 5* | 5* | **0** |

\* El contador de la tienda incluía las ventas sintéticas previas dentro de la MISMA transacción sandbox (tx1, tx2, decimal, high-stock); lo relevante es que el intento rechazado **no añadió ninguna fila**.

## Capas del guard verificadas (definiciones congeladas)

```text
1. create_sale_v2 pasada 1:  IF v_stock < v_units → ERR_INSUFFICIENT_STOCK (bajo FOR UPDATE)   ← la que disparó
2. fn_sync_inventory_on_movement: v_new_qty < 0 → ERR_INSUFFICIENT_STOCK (inventory base)      (2ª capa)
3. inventory UPDATE … RETURNING quantity; IF v_new_qty < 0 → ERR_INSUFFICIENT_STOCK            (3ª capa)
```

Tablas products/inventory/movements/kardex/transactions/payments: ninguna tocada por el intento (la excepción abortó el subtransaction del DO block antes de cualquier INSERT efectivo).

## Veredicto GATE 14

```text
PASS — venta sobre-stock RECHAZADA con 0 mutation en todas las tablas
```
