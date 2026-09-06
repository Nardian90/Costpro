# W9.5 — B-10b-OBS-2 · REPAIR DESIGN · 08-mathematical-reconciliation.md
# Reconciliación matemática (GATE 3) — evidencia → clasificación → apertura propuesta

## Regla de construcción

`SUM(products.stock_current)` NO se usa como fuente única (prohibido por mandato §G3).
La apertura propuesta se construye con la cadena exigida:

```text
EVIDENCIA (backup 08-02 + journal BE sobreviviente + estado congelado)
  → CLASIFICACIÓN (A FROZEN_MATCH / B DELTA_CONFIRMED_BY_EVENTS / C TEST_RESIDUE)
    → APERTURA PROPUESTA por producto (07-proposed-opening.csv)
```

## Fórmula por producto (mandato §G3)

```text
PROPOSED_REPAIR_STOCK(p) =
    BACKUP_STOCK(p)                      -- solo si p ∈ backup (114)
  + CONFIRMED_POST_BACKUP_DELTA(p)       -- Σ business_events.post-backup(p), solo Set B
  − EXPLICIT_TEST_RESIDUE(p)             -- Set C: 0 en apertura (excluidos)
```

con las equivalencias verificadas por producto:

- Set A: `CONFIRMED_DELTA = 0` y `current == backup` → propuesta = current = backup.
- Set B: `backup + ΣBE_post == current` y `último new_qty == current` → propuesta = current
  (el delta NO se asume: está demostrado evento a evento).
- Set C: propuesta = 0 (exclusión demostrada en 05-test-exclusions.csv).

## Cuadre global (identidades exactas)

```text
Set A (94 con stock>0)      4.961 u   valor ESTIMATED 9.780.688,78
Set B (4, delta +932)       1.466 u   valor ESTIMATED   151.528,16
───────────────────────────────────────────────────────────────────────
APERTURA PROPUESTA          6.427 u   98 productos   9.932.216,94 ESTIMATED

Identidad 1 (incremental):  5.495 (backup) + 932 (deltas confirmados) = 6.427  ✓
Identidad 2 (decremental):  6.553 (declarado actual) − 126 (Test)        = 6.427  ✓
Identidad 3 (valores):      9.780.688,78 + 151.528,16 = 9.932.216,94     ✓
Identidad 4 (OBS-2):        9.932.216,94 + 12.000.481,33 = 21.932.698,27 ✓
```

## Desglose Set B (delta +932, evento a evento)

| id8 | SKU | backup | current | delta | Σ BE post-backup | eventos | último new_qty | confianza |
|---|---|---:|---:|---:|---:|---:|---:|---|
| da1c4090 | CAT-0002 | 32 | 966 | +934 | +934 | 146 | 966 ✓ | CONFIRMED |
| f648c3f8 | CAT-0081 | 501 | 497 | −4 | −4 | 13 | 497 ✓ | CONFIRMED |
| 5dd7ff57 | CAT-0010 | 1 | 2 | +1 | +1 | 3 | 2 ✓ | CONFIRMED |
| 01301a54 | CAT-0021 | 0 | 1 | +1 | +1 | 1 | 1 ✓ | CONFIRMED |
| **Σ** | | **534** | **1.466** | **+932** | **+932** | 163 | | |

Fuente: `04-post-backup-deltas.csv`; raw en `raw/g2_universe.json`
(business_events_for_products). El delta NO era reconstruible en OBS-2 porque ese pack no
exploró business_events; esta fase lo demuestra evento a evento.

## Productos que NO entran en la apertura (trazabilidad completa)

| Grupo | n | Unidades | Motivo documental |
|---|---:|---:|---|
| Set C — Test 08-07 | 10 | 126 | TEST_RESIDUE (creación por scripts 08-07; compras de prueba; WAC inflado) — 05-test-exclusions.csv |
| Set A con stock 0 (0→0) | 16 | 0 | Sin posición que reconocer (backup=0, current=0) |
| **Total excluidos** | **26** | **126** | |

## Verificación por simulación (GATE 15)

`scripts/simulate_repair.js` ejecuta la semántica canónica congelada sobre el universo
congelado y reproduce el cuadre:

```text
RUN1: 98 movimientos 'initial' aplicados
TOTAL_BEFORE_DECLARED 6.553 · TOTAL_BEFORE_RECOGNIZED_LEDGER 0
TOTAL_REPAIR_UNITS 6.427 · TOTAL_REPAIR_VALUE_ESTIMATED 9.932.216,94
TOTAL_AFTER_LEDGER_UNITS 6.427 · TOTAL_AFTER_DECLARED 6.553 (residuo Test 126 intacto)
Invariantes I1–I11: PASS · 2ª ejecución: RECHAZADA (barrera idempotencia)
raw/simulation_result.json (per_product: before/repair/after qty · WAC · valor)
```

## Conclusión

La matemática cuadra EXACTAMENTE por las cuatro identidades y a nivel fila. No queda
ningún remanente sin clasificar en el universo U=124: 98 apertura + 16 stock-0 + 10 Test.
La apertura propuesta consagra únicamente la posición demostrable por evidencia.
