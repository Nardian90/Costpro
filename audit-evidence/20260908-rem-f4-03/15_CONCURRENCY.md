# 15 — CONCURRENCY (directiva §20)

## Mecanismo existente (sin inventar infraestructura)

`_v3` ya ejecuta todo bajo transacción única con locks de fila:

```sql
SELECT ... FROM production_order_items WHERE id = p_item_id FOR UPDATE;  -- item
SELECT store_id, status FROM production_orders WHERE id = v_order_id FOR UPDATE;  -- orden
SELECT cost_average FROM products WHERE id=... AND store_id=... FOR UPDATE;  -- WAC
```

El overconsumption check compara `actual_qty + p_qty > budgeted_qty` con el
valor BLOQUEADO — dos retiros simultáneos se serializan: el segundo ve el
`actual_qty` ya actualizado por el primero.

## Verificación empírica (P11 — fixtures aislados, cero producción)

Fixture: item con `budgeted_qty=2`, producto con stock 10.

```
Promise.all([withdraw(qty=2, key=C1), withdraw(qty=2, key=C2)])  →  paralelos reales
```

| Verificación | Resultado |
|---|---|
| Éxitos | **exactamente 1 de 2** |
| Denegaciones | **exactamente 1 de 2** |
| Denegación = budget guard (`Cantidad excede lo presupuestado del item`) | PASS |
| `actual_qty` final == 2 (ceiling respetado, sin lost update) | PASS |
| Stock decrementado exactamente 2 (sin doble consumo) | PASS |
| Exactamente 1 movimiento `production_out` | PASS |
| Sin stock negativo | PASS (implícito: stock 10 → 8) |

## Conclusión

**CONCURRENCY = PASS** — los locks existentes garantizan que retiros
simultáneos no produzcan negative stock, double consumption ni lost update.
