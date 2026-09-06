# W9.5 — B-10b-OBS-2-R2 · 06-stock-integrity.md
# GATE 6 — VERIFICACIÓN DE STOCK · PASS

Después de la venta, antes del rollback (`raw/r2_master_result.json` → paso P2):

## Tres fuentes de verdad cruzadas (Fixture A, venta de 2 unidades)

| Fuente | Valor tras venta | Esperado | OK |
|---|---:|---:|---|
| products.stock_current | **17** | 19 − 2 = 17 | ✓ |
| inventory.quantity (version **2**) | **17** | 17 | ✓ |
| Σ ledger (Σ quantity_change de stock_movements del producto) | **17** | initial(19) + sale(−2) = 17 | ✓ |
| movement nuevo: quantity_change / balance_after / type | −2 / **17** / sale | −2 / 17 / sale | ✓ |
| reference_id del movement | tx_id de la venta | trazable a transactions.id | ✓ |

## Invariantes comprobadas

```text
stock_after == stock_before − sale_quantity          → 17 == 19 − 2            ✓
products.stock_current == inventory.quantity         → 17 == 17                ✓
ledger-derived stock == inventory.quantity           → 17 == 17                ✓
inventory.version incrementó 1 → 2 (auditabilidad)                              ✓
created_by del movement == actor 051c6157 (vía auth.uid())                     ✓
unit_cost del movement == WAC del servidor (489.9999999999999700) — DF-02      ✓
```

**No se aceptó el simple éxito de la función**: el paso P2 compara explícitamente las tres fuentes y falla si cualquiera diverge. La verificación se repite al final del script (P15: los 4 fixtures reconciliados) y tras el ROLLBACK (GATE 21: tienda completa).

## Veredicto GATE 6

```text
PASS — el stock decrementa correctamente y las tres fuentes cuadran
```
