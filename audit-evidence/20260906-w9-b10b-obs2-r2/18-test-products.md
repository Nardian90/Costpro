# W9.5 — B-10b-OBS-2-R2 · 18-test-products.md
# GATE 18 — TEST PRODUCTS · PASS

Los 10 productos Test (set C de la fase de diseño, `EXCLUDED_FROM_REPAIR`) NO fueron incorporados al flujo de reparación y NO participan de esta fase.

## Verificación (r2_gate2.json / r2_gate3_pre.json / r2_post_global.json)

| Producto (id8) | SKU | stock | inventory rows | movement rows | ¿En el batch? |
|---|---|---:|---:|---:|---|
| 5bf782be | CONC-1786067801 | 15 | 0 | históricos propios | **NO** |
| 530e198c | PRODWAC-1786069598 | 10 | 0 | históricos propios | **NO** |
| aa5e148b | TASA-EXT-1786067764 | 11 | 0 | 0 | **NO** |
| 94e53fd4 | VOID-1786067801 | 10 | 0 | 0 | **NO** |
| 185f1c6f | VOIDTRACE-1786068382 | 10 | 0 | 0 | **NO** |
| 7049d300 | WAC-1786067683 | 15 | 0 | 0 | **NO** |
| 7dbff68e | WACFINAL-1786069134 | 15 | 0 | 0 | **NO** |
| b7bd618c | WACFIX-1786068956 | 15 | 0 | 0 | **NO** |
| e9541bb4 | WACFN-1786069224 | 10 | 0 | 0 | **NO** |
| 8f4e2708 | WACTRACE-1786068302 | 15 | 0 | 0 | **NO** |

```text
in_batch (algún movement con reference_doc LIKE 'B10B-OBS2-RECON-OPENING:%') = 0/10   ✓
Σ stock_current Test = 126 (idéntico al congelado del diseño y al POST de R1)          ✓
```

## Demostración de que EXCLUDED_FROM_REPAIR ≠ incorporación accidental

1. El batch contiene exactamente 98 distinct product_ids — los 10 Test NO están entre ellos (comparación por id completa, no por SKU).
2. `repair_batch_id no aparece en sus movimientos`: 0 filas de stock_movements de los Test con el prefijo del batch.
3. Los Test conservan su estado pre-reparación EXACTO (stock y ausencia de inventory/movements/kardex del batch) — verificado PRE y POST.
4. **No se vendieron**: ningún transaction_item referencia a los Test (las ventas sintéticas usaron A/B/B2/C exclusivamente); el Fixture D fue pasivo.
5. Los 10 son, además, los únicos 10 "mismatches" de la reconciliación tienda-completa (GATE 21) — exactamente el residuo clasificado esperado, nada nuevo.

## Tratamiento futuro

Su corrección/regularización queda para una fase independiente (ya registrada como pendiente en el pack OBS-2). No se eliminaron, no se corrigieron, no se incluyeron.

## Veredicto GATE 18

```text
PASS — Test 10/10 fuera del batch y fuera del alcance operativo de R2; estado intacto
```
