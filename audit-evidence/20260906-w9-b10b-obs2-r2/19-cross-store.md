# W9.5 — B-10b-OBS-2-R2 · 19-cross-store.md
# GATE 19 — CROSS-STORE ISOLATION · PASS

Ninguna prueba de R2 tocó filas de tiendas distintas de `d1c4ba0e` (TIENDA CENTRAL COSTPRO).

## Métricas de aislamiento (PRE == POST master == POST races)

| Métrica otras tiendas | PRE (GATE 1) | POST master | POST races | OK |
|---|---:|---:|---:|---|
| inventory (rows) | 141 | 141 | 141 | ✓ |
| stock_movements (rows) | 702 | 702 | 702 | ✓ |
| kardex (rows) | 702 | 702 | 702 | ✓ |

`r2_post_global.json` y `r2_post_after_races.json` → sección `global_baseline`: `inventory_other=141 · movements_other=702 · kardex_other=702` en ambas capturas.

## Por qué el aislamiento es estructural en el pipeline probado

```text
1. fn_sync_inventory_on_movement: IF NEW.store_id IS DISTINCT FROM products.store_id → ERR_STORE_MISMATCH
2. create_sale_v2/void/reverse: has_store_access_as(actor, store de la transacción) — alcance por tienda
3. register_stock_movement: todas las filas escritas llevan p_store_id explícito = d1c4ba0e
4. Las 5 ventas sintéticas y sus compensaciones especificaron siempre la tienda bajo prueba
5. Post-verificación R1 I11 ya demostró el patrón para el batch de reparación
```

## Veredicto GATE 19

```text
PASS — other stores PRE == POST en las métricas relevantes (0 filas añadidas/cambiadas)
```
