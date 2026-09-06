# W9.5 — B-10b-OBS-2 · REPAIR DESIGN · 01-baseline.md
# Línea base de la fase de diseño (GATE 0)

## Verificación de baseline

```text
Verificado: 2026-09-06 (sesión de diseño; sandbox verificado tras posible reinicio)
Repo:       /home/z/my-project/Costpro
HEAD:       7dfcaeea5f9ee3c72e9a25c109a0be677a185c17
origin/main:7dfcaeea5f9ee3c72e9a25c109a0be677a185c17
worktree:   clean (git status --short vacío)
Commit base: audit(w9): forensic analysis of orphan inventory ledger  (OBS-2)
PM2:        3/3 online (costpro, telegram-cron-poller, whatsapp-cron-poller)
HTTP:       verificado en fase (GATE 22 de esta fase re-verifica)
```

**GATE 0 = PASS.** `HEAD == origin/main == 7dfcaeea`, worktree limpio.

## Mandato de esta fase

Diseño técnico definitivo de la reparación del residuo huérfano (W9.5 OBS-2),
SIN ejecutar ninguna mutación. Producto: pack `20260906-w9-b10b-obs2-repair-design/`
+ test permanente `iteration-18-b10b-obs2-repair-design.test.ts` + decisión humana pendiente.

## Regla absoluta

READ-ONLY sobre DB: 0 UPDATE / 0 INSERT / 0 DELETE / 0 ALTER / 0 TRUNCATE / 0 DROP /
0 CREATE / 0 RPC de escritura / 0 reset_store_data / 0 cambio de código productivo.
Solo SELECT, EXPLAIN, inspección de funciones/triggers/constraints, análisis Git,
CSV/JSON/MD, test de diseño sin escritura, cálculo y simulación en memoria.

## Captura PRE (GATE 21 — captura temprana)

Ejecutada inmediatamente tras GATE 0, ANTES de cualquier análisis:
`raw/g21_pre.json` (script `scripts/g21_pre.sql`, runner Management API, HTTP 201).

```text
ts:                       2026-09-06T18:21:25.251007+00:00
products_all:             323      products_store: 124
products_store_stock:     6,553    products_store_cost: 6,132,624.960555917
inventory_all:            141      inventory_store: 0     inventory_sum: 4,978.6289
stock_movements_all:      702      stock_movements_store: 0
kardex_all:               702      kardex_store: 0
transactions_all:         520      transactions_store: 0   transaction_items_all: 555
devolutions_all:          13       devolutions_store: 13   devolution_items_all: 13
payments_all:             366      payments_store_tx: 0
receipts_all:             6        receipts_store: 0
transfers_all:            0        transfers_store: 0
audit_logs_all:           7,376    audit_logs_store: 365
restore_sessions_all:     53       store_reset_snapshots_all: 0
commissions_all:          0        wac_log_all: 14         wac_log_store: 0
products_checksum:        6c900fcfcbf2c78870d42cd4a3b0b9ef
inventory_checksum:       007fec6b6c0968bfd3ae2c765fb86fa7
movements_checksum:       39ba7edf0ec53f7a65c2f287b5ed2961
```

El estado de la tienda `d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576` es IDÉNTICO al congelado
por OBS-2 (124 productos / 6.553 u / ledger 0): el universo no cambió desde el pack forense.

## Convenciones de la fase

- Runner SQL: `scripts/obs2_query.js` (reutilizado del pack OBS-2; Management API, HTTP 201).
- Capture cruda: `raw/*.json` — ningún dato inventado; todo número de esta fase es
  reproducible desde `raw/` + `scripts/`.
- Cálculo y clasificación: `scripts/build_repair_universe.js` (determinista, sin DB).
- Simulación: `scripts/simulate_repair.js` (semántica canónica congelada en `raw/g5_*.json`).
