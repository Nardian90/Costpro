# W9.5 — B-10b-OBS-1 · 16-final-verdict.md
# Veredicto final de la fase

## B-10b-OBS-1
STATUS: **CLOSED** (sin reparación de datos — demostración forense completa; ver matriz §28)
ROOT CAUSE: `reverse_devolution` legacy (v2.2 de 2026-07-26 hasta B-10b) descontaba
stock con `UPDATE products SET stock_current = GREATEST(0, stock_current - q)` +
kardex 'out' costo 0, **sin stock_movements, sin tocar inventory y sin audit**. Para la
única devolución revertida de producción (0b7213e9, producto da1c4090, q=1) el par
creación-pipeline(+1 inventory+products) / reversión-legacy(−1 solo products) dejó el
drift **Caso A: inventory = products + 1**. La fila de inventory fue eliminada
posteriormente por un reset de tienda (`reset_store_data`), que purgó TODO el ledger
de la tienda d1c4ba0e — el drift dejó de existir por un evento externo documentado.
AFFECTED ROWS: 1 devolución revertida (1 item, q=1) + 12 completadas nunca revertidas;
0 filas reparables en el estado actual
AFFECTED PRODUCTS: 1 (da1c4090-3e10-4120-a2bc-24da53cffe16) — dentro de un huérfano
store-wide de 108 productos (SEPARATE_FINDING, no atribuible al reverse)
REPAIR MODEL: **NO_DATA_REPAIR** — reparar fabricaría historial/estado; verificación
atómica read-only A1..A8 ALL PASS en su lugar
DATA REPAIRED: 0 filas (0 UPDATE / 0 INSERT / 0 DELETE / 0 DDL)
FINANCIAL IMPACT: 0 (payment_transactions sin refs a devoluciones; comisiones intactas)
WAC IMPACT: 0 (invariante — cost_average=11.919422583856775 exacto; A6)
KARDEX IMPACT: 0 vivo (0 filas refiriendo devoluciones; el 'out' cost0 histórico fue
purgado con la tienda — no reconstruido para no falsificar)
REGRESSION: PASS — 1989 tests/0 fail, lint 0, tsc 0, build OK, PM2 3/3, HTTP 200 ×2
GIT: commit `fix(w9): repair historical reverse_devolution inventory drift` —
ver SHA256SUMS y raw-git para el hash exacto
PUSH: origin/main == HEAD (verificado tras push; PAT provisto por el usuario)
FINAL VERDICT: el drift histórico estuvo REAL, fue demostrado con la cadena completa
(función→timing→purge) y hoy NO existe nada demostrable que reparar. Los hallazgos
colaterales (tienda d1c4ba0e huérfana, resets sin audit, devoluciones borradas con
audit huérfano) quedan registrados como BACKLOG según §27.

## Matriz de cierre (§28)

| Criterio CLOSED | Estado |
|---|---|
| 0 drift histórico no explicado | ✓ (drift explicado y demostrado; vivo = 0) |
| 0 reparación duplicada | ✓ (0 movimientos/escrituras) |
| 0 impacto financiero | ✓ |
| 0 WAC corruption | ✓ |
| 0 kardex corruption | ✓ (kardex==movements 1:1; 0 refs devoluciones) |
| products.stock_current == inventory.quantity | ✓ (141/141 productos con inventory; para da1c4090 es vacuo: sin fila) |
| ledger == inventory | ✓ (0 productos con movements sin inventory) |
| PRE == POST métricas no afectadas | ✓ (sentinels 21/21 idénticos) |
| POST == EXPECTED métricas reparadas | ✓ (POST==PRE==estado correcto) |
| regression PASS | ✓ |
| SHA PASS | ✓ (17-SHA256SUMS) |
| worktree clean / HEAD == origin/main | ✓ (post GATE 20) |
