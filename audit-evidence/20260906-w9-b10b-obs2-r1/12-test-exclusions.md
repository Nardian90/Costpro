# W9.5 — B-10b-OBS-2-R1 · 12-test-exclusions.md
# §25 TEST PRODUCTS — PASS (exclusión registrada e intacta)

## Estado POST de los 10 productos Test (EXCLUDED_FROM_REPAIR)

| product_id (id8) | SKU | stock | inventory rows | movement rows |
|---|---|---:|---:|---:|
| 7049d300 | WAC-1786067683 | 15 | 0 | 0 |
| aa5e148b | TASA-EXT-1786067764 | 11 | 0 | 0 |
| 94e53fd4 | VOID-1786067801 | 10 | 0 | 0 |
| 5bf782be | CONC-1786067801 | 15 | 0 | 0 |
| 8f4e2708 | WACTRACE-1786068302 | 15 | 0 | 0 |
| 185f1c6f | VOIDTRACE-1786068382 | 10 | 0 | 0 |
| b7bd618c | WACFIX-1786068956 | 15 | 0 | 0 |
| 7dbff68e | WACFINAL-1786069134 | 15 | 0 | 0 |
| e9541bb4 | WACFN-1786069224 | 10 | 0 | 0 |
| 530e198c | PRODWAC-1786069598 | 10 | 0 | 0 |
| **Σ** | | **126** | **0** | **0** |

- [x] Ninguno aparece en el batch (0 de los 98 movimientos apunta a estos ids — I14)
- [x] Sus 126 unidades permanecen EXACTAMENTE fuera de la reparación
- [x] NO fueron eliminados ni modificados (stock bit a bit == frozen CSV 05)
- [x] La exclusión quedó REGISTRADA en la fila de auditoría del lote:
      `metadata.excluded_test = "10 products / 126 units EXCLUDED_FROM_REPAIR"`
- [x] Los 16 productos stock-0 también permanecen sin filas de ledger (sin efecto)

Su decisión de archivo/limpieza futura permanece fuera del alcance (residuo
clasificado y visible para el detector permanente — design 22-final-verdict.md).
