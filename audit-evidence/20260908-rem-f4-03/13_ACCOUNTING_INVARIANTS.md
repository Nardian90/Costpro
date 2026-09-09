# 13 — ACCOUNTING INVARIANTS (directiva §17)

## Invariante de costo

```
movement_unit_cost == server_side_unit_cost (products.cost_average)
movement_unit_cost ≠ client_supplied_unit_cost  (en ningún caso)
```

Verificación completa en P9 (4 retiros del fixture, WAC=100):

| Registro contable | Valor | Fuente |
|---|---|---|
| `stock_movements.unit_cost` (4/4) | 100 | kardex |
| `production_order_items.actual_unit_cost` | 100 | item |
| `result.unit_cost_used` (respuesta HTTP) | 100 | API |
| `audit_logs.metadata.unit_cost_used` (4/4) | 100 | procedencia |
| `audit_logs.metadata.cost_authority` (4/4) | `server_side_wac_v3` | autoridad declarada |

## Coherencia contable del inventario

```
Costo del material consumido = qty × WAC = 5 × 100 = 500 (consistente fila a fila)
Inventario valorizado: 10×100 (seed) − 5×100 (consumo) = 5×100 ✓
```

## Integridad del WAC

- Los retiros NO crean contribuciones WAC (`wac_change_log == 1`, solo la
  recepción seed) — el consumo no re-precifica el inventario.
- El WAC del producto permanece exactamente 100 tras los 4 retiros.
- Escritor único preservado: ningún nuevo escritor de `cost_average` (la
  remediación solo conecta lectura server-side; el guard
  `trg_guard_wac_writer` sigue siendo la autoridad de escritura).

## Procedencia auditable (INV-15)

Cada retiro escribe `audit_logs` con action `PRODUCTION_ITEM_WITHDRAWN`,
metadata con `order_id`, `product_id`, `qty`, `unit_cost_used`,
`cost_authority='server_side_wac_v3'`, `idempotency_key` y `param_hash` —
la trazabilidad del costo es completa y reproducible.
