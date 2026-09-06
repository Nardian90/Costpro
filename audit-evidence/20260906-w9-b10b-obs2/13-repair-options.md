# W9.5 — B-10b-OBS-2 · 13-repair-options.md
# Opciones de reparación — modelos A/B/C (GATE 14) — NO EJECUTAR EN ESTA FASE

Base normativa: mandato §17-18. Esta fase es READ-ONLY: aquí solo se EVALÚA.
Decisión y ejecución: fase posterior con aprobación humana explícita.

## Universo a reparar (desde 07/08/10-*.csv)

| Grupo | Productos | Unidades | Naturaleza demostrada |
|---|---:|---:|---|
| G1 — frozen 110 (de los cuales 97 con stock>0 al 08-02 + delta real) | 110 | (ver CSV) | stock comercial REAL con ledger que existió y fue purgado |
| G2 — mutados post-backup | 4 | — | stock real, delta 08-04..08-17 no reconstruible 1:1 |
| G3 — Test 08-07 | 10 | 126 | TEST_DATA (scripts, stock directo) |
| (16 productos stock=0 | — | 0 | N/A) |

Nota: G1 incluye productos con stock>0 y stock=0; solo los >0 son huérfanos vivos
(108 huérfanos totales = G1 con stock>0 + G2 + G3).

## MODELO A — RECONSTRUIR LEDGER (movimientos históricos)

```text
MODEL:            A — REBUILD_LEDGER_FROM_BACKUP
PRECONDITION:     evidencia exacta por producto de cantidad/fecha/origen.
CUMPLIMIENTO:     PARCIAL — exacto para el corte 08-02 (payload: 242 movements con
                  quantity_change, unit_cost, movement_date, reference), IMPOSIBLE
                  1:1 para 08-04..08-17 (audit solo guarda metadata agregada de
                  ventas, sin items; 4 productos mutados).
AFFECTED_ROWS:    ~114 inventory rows + ~250+ movements (replay) + sync products.
EXPECTED_RESULT:  inventory.quantity == stock_current restaurado; movements/kardex
                  reproducidos hasta 08-02 + apertura por delta 08-02..08-17.
ACCOUNTING_IMPACT: kardex reconstruido con costos del payload (verificable contra
                  cost_average actual — que NO se tocaría).
INVENTORY_IMPACT: total (rellena el ledger).
AUDIT_IMPACT:     requiere marcar movimientos reconstruidos como repair/replay con
                  reference_doc al pack; riesgo de "falsificar" historial si se
                  presentan como originales.
ROLLBACK:         posible solo con snapshot pre-reparación completo + transacción.
RISK:             ALTO — mezclar replay 07-30..08-02 + aperturas 08-02..08-17 crea
                  UNA TERCERA versión del historial; cualquier error es otro drift.
```

## MODELO B — RECONCILIACIÓN FORMAL (apertura única, auditada)

```text
MODEL:            B — OPENING_BALANCE_RECONCILIATION
PRECONDITION:     (1) decisión de negocio de que el stock congelado es el punto de
                  partida contable; (2) mecanismo canónico: register_stock_movement
                  con movement_type de ajuste/apertura (p. ej. 'adjustment' in) por
                  producto, reference_doc = 'B10B-OBS2-OPENING', fecha = fecha de
                  ejecución (NO retro-fechada); (3) snapshot PRE completo; (4) audit
                  explícito por lote.
CUMPLIMIENTO:     SÍ — el pack DEMUESTRA cantidad/tienda/producto por fila
                  (07-ledger-reconstruction.csv); el "origen" es la decisión de
                  apertura documentada, no una falsificación de compras/ventas.
AFFECTED_ROWS:    108 inventory rows (upsert) + 108 movements + 108 products sync
                  (vía trigger) + 10 productos Test EXCLUIDOS (van a C).
EXPECTED_RESULT:  products.stock_current == inventory.quantity == Σ movements para
                  los 108; Test fuera (C).
ACCOUNTING_IMPACT: ninguno sobre payments/commissions (intactos); WAC invariante
                  (apertura no debe pasar unit_cost ≠ cost_average vigente).
INVENTORY_IMPACT: ledger vuelve a tener fuente de verdad operativa; ventas dejan de
                  chocar con prevent_negative_inventory.
AUDIT_IMPACT:     limpio: un movimiento de apertura POR PRODUCTO, fecha real,
                  referencia al pack y SHA256SUMS.
ROLLBACK:         DELETE de los movements 'B10B-OBS2-OPENING' + revert inventory a
                  estado vacío (documentado en pre-snapshot).
RISK:             MEDIO-BAJO — no reconstruye historial; consagra el estado actual
                  como apertura (incluye cualquier error del estado congelado: los
                  4 G2 quedan consagrados con su delta no verificado).
SUBCASO G3:       los 10 Test NO se reconcilian: se descartan (ver C) o se dejan
                  clasificados (decisión humana).
```

## MODELO C — DESCARTAR COMO RESIDUO

```text
MODEL:            C — DISCARD_RESIDUE
PRECONDITION:     demostración de test/residue/inválido. PROBADA solo para G3
                  (10 productos "…Test" creados por scripts 08-07, 126 u) y para el
                  stock=0 (N/A). NO PROBADA para G1/G2: es stock comercial real
                  (cables, tornillos, discos… con WAC y 242 movimientos reales
                  respaldados por el payload) de una tienda ACTIVA — descartarlo
                  destruiría valor económico real (~21,9 M ESTIMATED).
AFFECTED_ROWS:    G3: 10 productos (stock_current→0 vía ajuste auditado, NO DELETE
                  de filas de catálogo) o archivo de los productos.
EXPECTED_RESULT:  huérfanos G3 eliminados; G1/G2 seguirían huérfanos (no resuelve).
RISK:              BAJO para G3; PROHIBITIVO para G1/G2 (pérdida patrimonial).
```

## Recomendación

```text
RECOMMENDED_MODEL: B (para los 108 huérfanos vivos) + C restringido a G3 (10 Test),
                   ejecutados en fase posterior atómica con snapshot, assertions,
                   sentinels y tests permanentes (extensión del detector de GATE 16).
                   ALTERNATIVA si el negocio exige historial 1:1: A para el tramo
                   07-30..08-02 (payload exacto) + B para el delta 08-02..08-17 —
                   costo/riesgo mayores, beneficio principalmente documental.
HUMAN_DECISION_REQUIRED: SÍ — conforme §18: la consagración de 6.553 u como
                   inventario de apertura (y el tratamiento de los 10 Test y de los
                   4 productos G2 con delta no verificado) es DECISIÓN EMPRESARIAL/
                   CONTABLE, no técnica.
```

Precondiciones transversales para cualquier modelo (fase de ejecución futura):
congelar writers LEGACY vivos identificados en 05-stock-writers.md (reverse_receipt_v2,
reverse_transfer/production, duplicate_adjustment), re-correr el detector global
(10-global-orphan-scan.csv) PRE/POST, y 21+ sentinels de invarianza (payments,
commissions, WAC, otras tiendas).
