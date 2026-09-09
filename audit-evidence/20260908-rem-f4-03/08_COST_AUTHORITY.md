# 08 — COST AUTHORITY (fuente única server-side)

## Autoridad declarada y verificada

```
products.cost_average (WAC) del producto EN la store de la orden,
bajo FOR UPDATE, sin fallback a 0.
```

- Es la **misma autoridad** del COGS de ventas (create_sale_v2) y del blend
  de recepciones (`fn_recalc_wac`). NO se inventó un nuevo modelo de costos
  (directiva §8), no se duplicó fórmula, no se copió lógica del frontend.
- El retiro de producción NO re-precifica el inventario: lee WAC, no lo
  escribe (verificado: `wac_change_log` sin contribuciones de retiros, P9).

## Verificación empírica (suite P1/P2 — camino HTTP real)

| Paso | Resultado |
|---|---|
| Seed: recepción HTTP 10 @ 100 → WAC server-side = 100 | PASS (tol 1e-6) |
| Retiro qty=1 con `unit_cost=0.01` en el body | PASS |
| `result.unit_cost_used` | **100** (no 0.01) |
| `unit_cost_used == products.cost_average` (1:1) | PASS (P2) |
| `production_order_items.actual_unit_cost` | **100** |
| `stock_movements.production_out.unit_cost` | **100** |
| `audit_logs.cost_authority` | `server_side_wac_v3` |
| `audit_logs.unit_cost_used` | **100** |

## Cadena de procedencia completa (INV-15)

Cada retiro deja rastro auditable de la autoridad del costo:

```
audit_logs.metadata = {
  "cost_authority": "server_side_wac_v3",
  "unit_cost_used": <WAC leído bajo lock>,
  "order_id": ..., "product_id": ..., "qty": ...,
  "idempotency_key": ..., "param_hash": ...
}
```

## Costos forjados del cliente (directiva §9/§10/§18)

| Intento | unit_cost enviado | Costo contabilizado | Veredicto |
|---|---|---|---|
| bajo | 0.01 | 100 | IGNORADO (P3) |
| alto | 999999999 | 100 | IGNORADO (P4) |
| cero | 0 (histórico `unit_cost \|\| 0`) | contrato eliminado — el campo ya no viaja a la RPC | ELIMINADO (route) |

**client supplied cost ≠ accounting authority — DEMOSTRADO.**
