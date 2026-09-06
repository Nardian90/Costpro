# W9.5 — B-10b-OBS-2-R1 · 11-isolation.md
# §24 TEST DE AISLAMIENTO — PASS (0 diferencias fuera de d1c4ba0e)

## Otras tiendas: PRE vs POST idénticos

| Tabla (scope NO-d1c4ba0e) | PRE | POST | Δ |
|---|---:|---:|---:|
| inventory (filas) | 141 | 141 | 0 |
| inventory (Σ quantity) | 4.978,6289 | 4.978,6289 | 0 |
| stock_movements (filas) | 702 | 702 | 0 |
| kardex_entries (filas) | 702 | 702 | 0 |

## Otros productos de la misma tienda (excluidos del batch)

```text
10 Test:      stock_current intacto (Σ=126), 0 inventory, 0 movements (12-test-exclusions.md)
16 stock-0:   stock_current 0, sin filas de ledger (sin posición — sin efecto esperado)
Checksum de stock_current de la tienda (124 filas): Σ 6.553 PRE == POST
```

## Trazabilidad de todas las filas creadas

Todas las filas nuevas del batch tienen `store_id = d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576`
(inventario +98 filas verificadas por `inventory_rows_store == 98` y
`inventory_other == 141` sin delta; movimientos +98 con store fijo; kardex +98 store
fijo; business_events con `payload.store_id` fijo; audit row con store fijo).

El mandato §24 queda demostrado con counts globales y suma de cantidades — no solo con
counts (regla A15: ninguna diferencia no explicada, aunque «parezca mejor»).
