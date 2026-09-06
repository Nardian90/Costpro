# W9.5 — B-10b-OBS-2-R1 · 03-pre-snapshot.md
# §3 PRE-EXECUTION SNAPSHOT + §4/§5/§6/§7/§8 revalidaciones

## PRE snapshot (34 métricas) — capturado ANTES de cualquier escritura

Script idéntico al del pack de diseño (`r1_snapshot34.sql`, heredado de g21_pre.sql).
Resultado: `raw/r1_pre_snapshot.json` — **34/34 idénticas al PRE congelado del diseño**
(únicamente `ts` difiere, por diseño). Productos:
`6c900fcfcbf2c78870d42cd4a3b0b9ef` · inventory: `007fec6b6c0968bfd3ae2c765fb86fa7` ·
movements: `39ba7edf0ec53f7a65c2f287b5ed2961`.

Valores clave PRE: products_store 124 · products_store_stock **6.553** ·
products_store_cost 6.132.624,960555917 · inventory_store 0 · movements_store 0 ·
kardex_store 0 · transactions_store 0 · payments_all 366 · audit_logs_store 365 ·
wac_log_store 0.

## Revalidación atómica del universo (§4) — 14/14 PASS

| Check | Resultado |
|---|---|
| A1/A8: 124/124 filas == frozen_universe (id, stock, WAC, status, is_active, **updated_at**) | PASS — 0 escrituras desde la congelación |
| A9: 98/98 opening_qty y opening_unit_cost exactos vs DB | PASS |
| Σ opening_qty == 6427 | PASS (exacto) |
| Σ(qty×WAC) == simulación 9.932.216,938816005 | PASS (Δ=0) |
| §5: 10 Test excluidos del batch, 126 u intactas | PASS |
| §5: 0 inventory / 0 movements para los Test | PASS |
| §6: ledger tienda vacío (inventory/movements/kardex/transactions = 0) | PASS |
| §8: barrera B1 — 0 movimientos con prefijo `B10B-OBS2-RECON-OPENING:%` | PASS |
| §8: 0 movimientos con prefijo `B10B-OBS2-RECON-ROLLBACK:%` | PASS |
| §8: barrera B4 — 0 filas `STOCK_RECONCILIATION_OPENING` | PASS |
| A12: sonda actor (auth.uid/is_admin/has_store_access) | PASS true/true/true |
| A12: perfil válido (admin@costpro.com, role=admin, tenant 5364ccf8) | PASS |

Detalle: `raw/r1_universe_verdict.json` · script: `scripts/r1_check_universe.js`.

## Hallazgo de precisión decimal (documentado, sin desviación de valores)

`products.cost_average` es numeric **sin límite**; el CSV congelado registró su
representación float64 (JSON). Ejemplo: DB `489.9999999999999700` ↔ CSV
`489.99999999999994` — **el mismo double float64**, distinto texto decimal. Para
cumplir G1 (`p_unit_cost == cost_average` EXACTO, 09-wac-model.md §2.4) los literales
SQL se generaron desde el texto decimal exacto de la DB
(`raw/r1_exact_decimals.json`), con aserción float64 contra el CSV 98/98. Las
cantidades aprobadas NO cambian; cambia únicamente la representación literal.

Evidencia del hallazgo (sin mutación): los dos primeros ensayos abortaron con
`ERR_UNIVERSE_DRIFT` — ver 05-execution.md.
