# W9.5 — B-10b-OBS-2-R2 · 21-full-reconciliation.md
# GATE 21 — FULL RECONCILIATION · PASS

Reconciliación tienda-completa DESPUÉS de terminar todas las pruebas (`r2_post_global.json` → `store_reconciliation`).

## products.stock_current == inventory.quantity para toda la tienda

```text
mismatch_products = 10  →  identificados 1 a 1 (r2_mismatch_id.json):
  CONC-1786067801, PRODWAC-1786069598, TASA-EXT-1786067764, VOID-1786067801,
  VOIDTRACE-1786068382, WAC-1786067683, WACFINAL-1786069134, WACFIX-1786068956,
  WACFN-1786069224, WACTRACE-1786068302
= EXACTAMENTE los 10 Test excluidos (residuo clasificado PREEXISTENTE, con inventory NULL
  y stock_current>0 heredado del purge; fuera del alcance por diseño, GATE 18).
Para los 114 productos con inventory row (98 reparados + 16 stock-0 no afectados): 0 mismatches.
```

## Σ inventory vs Σ products.stock_current

```text
Σ inventory (tienda)   = 6.427          (98 filas del batch)
Σ stock_current (tienda) = 6.553        (6.427 reparados + 126 Test residuo)
diferencia estructural = 126 = Σ stock de los 10 Test (esperada y clasificada desde OBS-2)
Δ de las pruebas R2    = 0              (idéntico al PRE de esta fase y al POST de R1)
```

## Los 98 reparados — reconciliación fina

```text
98/98: stock_current == inventory.quantity == Σ(movements del producto)
98/98: exactamente 1 movement 'initial' por producto (P15: pass por fixture; POST global)
4/4 fixtures operativos reconciliados al cierre del sandbox (P15: bool_and(pass)=true)
```

## Veredicto GATE 21

```text
PASS — la tienda reconcilia al 100%; única asimetría = residuo Test clasificado (126 u),
       invariable en toda R2
```
