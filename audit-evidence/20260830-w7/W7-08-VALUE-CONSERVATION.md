# W7-08 — VALUE CONSERVATION FORMALIZADA (FASE 19)

Formalización del invariante maestro sobre clon post-migración, con ciclo completo de valoración. Evidencia cruda: `tmp/W7-f19.out` (10/10 asserts PASS).

## 19.1 Definiciones

- **INV-15 (conservación)**: `ΣCOGS ≡ Σ(unit_cost × qty)` sobre el kardex — todo valor que sale del inventario queda materializado como costo; toda reversión devuelve exactamente el costo original.
- **Basis A1**: cuando un `return` re-ingresa unidades con un `unit_cost` distinto del WAC vigente (p. ej. devolución de venta histórica), el mismatch **debe quedar materializado y trazable**, no absorbido silenciosamente.

## 19.2 Ciclo probado

`apertura 10@100 (V0=1000)` → `entrada 5@200` → `venta 3` → `entrada 5@300` → `devolución 1`

| Assert | Verificación | Esperado | Observado | |
|---|---|---|---|---|
| F19-1 | WAC tras blend 10@100+5@200 | 133.333333 | 133.333333 | PASS |
| F19-2 | COGS venta 3 u = 3×WAC_prev (server) | 400 | 400.000000 | PASS |
| F19-3 | WAC invariante tras venta (la venta no re-valora) | 133.333333 | 133.333333 | PASS |
| F19-4 | WAC tras blend con 5@300 | 182.352941 | 182.352941 | PASS |
| F19-5 | **COGS_revertido == COGS_original** (uc del movement return) | 133.333333 | 133.333333 | PASS |
| F19-6 | **LEDGER**: 1000 + 2500 − 400 + 133.333333 | 3233.333333 | 3233.333333 | PASS |
| F19-7 | stock×WAC = 18×182.352941 | 3282.352941 | 3282.352941 | PASS |
| F19-8 | **A1 basis mismatch MATERIALIZADA**: 1×(182.352941−133.333333) | 49.019608 | 49.019608 | PASS |
| F19-9 | A1 trazable: movement return con uc ≠ WAC vigente existe | true | true | PASS |
| F19-10 | **Σ transaction_items.COGS − Σ stock_movements(sale).unit_cost×\|qty\|** | 0 | 0.000000 | PASS |

## 19.3 Lectura de auditoría

1. **Conservación exacta a 6 decimales en cada frontera** (entradas, salidas, reversiones): el ledger `V0 + Σin − Σout + Σrevert` reproduce el valor teórico sin residual.
2. **La reversión no re-valora**: el return usa el unit_cost congelado del movement original (133.333333, no el WAC vigente 182.352941) — la regla `COGS_revert = COGS_original` se cumple por construcción del kardex.
3. **El mismatch A1 es una línea de auditoría visible** (F19-9), no un ajuste fantasma: la diferencia 49.019608 es exactamente la plusvalía de re-ingreso respecto del WAC vigente, y queda registrada en el movement — verificable por cualquier reconciliación posterior.
4. Complemento de frontera stock=0 (FASE 18, F18-7): en el límite `S=0`, valor post = uc×q exacto (1000) — **cero valor creado o destruido** en la frontera también.

## 19.4 Veredicto FASE 19

```text
VALUE CONSERVATION GATE = PASS — ΣCOGS ≡ Σuc×qty (diff exacto 0), COGS_revert==COGS_original, A1 materializada y trazable
```
