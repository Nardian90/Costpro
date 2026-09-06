# W9.5 — B-10b-OBS-2 · 15-zero-mutation-verification.md
# Verificación CERO MUTACIONES (GATE 15)

Método: snapshot idéntico (`scripts/g15_pre.sql`, 34 métricas incluyendo checksums
md5 ordenados por id de products de la tienda / inventory global / stock_movements
global) ejecutado al inicio de la investigación (PRE 2026-09-06T16:48:49Z) y al cierre
(POST 2026-09-06T16:56:57Z). Raw: `raw/g15_pre.json`, `raw/g15_post.json`.

## Resultado

```text
campos comparados: 34 · diferencias: 0 · ZERO MUTATION ✅
products_checksum  PRE == POST == 6c900fcfcbf2c78870d42cd4a3b0b9ef
inventory_checksum PRE == POST == 007fec6b6c0968bfd3ae2c765fb86fa7
movements_checksum PRE == POST == 39ba7edf0ec53f7a65c2f287b5ed2961
```

Métricas clave invariables (PRE == POST):
products_all 323 · products_store 124 · products_store_stock 6553 ·
inventory_all 141 · inventory_store 0 · stock_movements_all 702 ·
stock_movements_store 0 · kardex_all 702 · transactions_all 520 ·
transactions_store 0 · devolutions_all 13 · devolution_items_all 13 ·
payments_all 366 · payments_store_tx 0 · receipts_all 6 · transfers_all 0 ·
audit_logs_all 7376 · audit_logs_store 365 · restore_sessions_all 53 ·
store_reset_snapshots_all 0 · commissions_all 0 · wac_log_all 14 · wac_log_store 0.

## Alcance

- Todo el SQL emitido por esta fase (archivos en `scripts/*.sql`) es SELECT
  (lectura vía Management API `database/query`).
- 0 UPDATE / 0 INSERT / 0 DELETE / 0 ALTER / 0 TRUNCATE / 0 DROP / 0 RPC de escritura
  / 0 reset_store_data / 0 restore.
- Los únicos artefactos producidos son archivos locales (CSV/MD/SQL/JSON del pack)
  y el test permanente `src/__tests__/integration/iteration-17-b10b-obs2-orphan-ledger.test.ts`.
- Adicionalmente, el estado comparado contra el backup 08-02 demuestra que el estado
  huérfano pre-existía a esta fase (110/114 frozen ya verificado en la primera
  consulta de payload, anterior a cualquier toque posterior de la fase).
