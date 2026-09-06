# W9.5 — B-10b-OBS-2-R2 · 04-pre-operational.md
# GATE 3 — SNAPSHOT PRE-OPERACIONAL · PASS

Captura (`scripts/r2_gate3.sql` → `raw/r2_gate3_pre.json`) ANTES de cualquier prueba dinámica.

## Estado por fixture (resumen)

| SKU | stock_current | inventory (qty / version) | movements | kardex | business_events |
|---|---:|---|---:|---:|---:|
| CAT-0001 (A) | 19 | 19 / 1 | 1 (initial) | 1 | 2 |
| CAT-0002 (C) | 966 | 966 / 1 | 1 (initial) | 1 | 156 |
| CAT-0087 (B) | 95.5 | 95.5 / 1 | 1 (initial) | 1 | 12 |
| CAT-0088 (B2) | 91.5 | 91.5 / 1 | 1 (initial) | 1 | 12 |

Nota: los business_events de CAT-0002 (156) y CAT-0087/88 (12) son el journal histórico que sobrevivió al purge (descubierto y documentado en la fase de diseño); el movement/kardex/inventory vigente proviene del batch R1.

## 10 productos Test (residuo clasificado, EXCLUDED_FROM_REPAIR)

```text
10/10 fuera del batch (in_batch=false) · 0 inventory rows · Σ stock_current = 126
SKUs: CONC-1786067801, PRODWAC-1786069598, TASA-EXT-1786067764, VOID-1786067801,
      VOIDTRACE-1786068382, WAC-1786067683, WACFINAL-1786069134, WACFIX-1786068956,
      WACFN-1786069224, WACTRACE-1786068302
```

## Contadores de tienda (PRE)

```text
transactions_store=0 · payments vía tienda=0 · movements_store=98 · kardex_store=98
audit_store=366 · wac_log_store=0 · be_store=3.879
```

## Huellas del movimiento initial (GATE 17 — preparación)

```text
98/98 fingerprints md5 capturados:
md5(concat(id, quantity_change, unit_cost, reference_doc, reference_id, created_at, created_by, movement_type))
→ raw/r2_gate3_pre.json (initial_movement_fingerprints)
```

## Veredicto GATE 3

```text
PASS — snapshot PRE sellado; ningún fixture alterado antes de las pruebas
```
