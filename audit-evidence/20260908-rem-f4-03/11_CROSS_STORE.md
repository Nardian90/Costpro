# 11 — CROSS-STORE (aislamiento multitienda)

**Directiva §11/§12.** Fixture real: `audit-clerk-4f0d1e@costpro.test`
(miembro ÚNICAMENTE de `AUDIT F4E1 STORE A`, role clerk) vs orden de
`AUDIT F4E1 STORE B`.

## Escenario (P5)

1. Producto fixture en STORE B (stock 10, WAC 50) + orden STORE B `in_progress`
   con item budgeted_qty=5.
2. Snapshot PRE: stock=10, WAC=50, movements=0, item actual_qty=0.
3. El clerk de STORE A intenta retirar del item de la orden de STORE B por
   el **camino HTTP real**.

## Resultado

| Verificación | Resultado |
|---|---|
| HTTP status | **403** (`{"error":"No autorizado"}`) |
| STORE B stock | unchanged (10) |
| STORE B WAC | unchanged (50) |
| STORE B ledger (stock_movements) | +0 movimientos |
| STORE B item actual_qty | unchanged (0) |

## Caso "STORE A order + STORE B product" (directiva §12)

**Imposible por construcción**: el producto NO se elige en el request —
`_v3` lee `product_id` del `production_order_items` de la orden indicada
(FK), y el WAC se lee de `products WHERE id=v_product_id AND
store_id=v_order_store_id`. Un producto de otra store no puede existir como
item de la orden; si el dato estuviera corrupto, `ERR_PRODUCT_NOT_FOUND`
aborte el retiro (sin mutación).

## Nota admin global

`admin@demo.com` tiene rol global admin → cross-store permitido BY DESIGN
(decisión D6 documentada en RECON/F4-04; no es defecto ni parte de F4-03).
El DENY estricto aplica a usuarios no-miembros (verificado con clerk real
y con JWT sub-cero en P6).
