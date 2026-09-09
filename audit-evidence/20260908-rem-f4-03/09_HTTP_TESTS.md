# 09 — HTTP TESTS (camino real: endpoint de producción)

**Fuente:** `evidence/remf403-test-suite-output.txt` + `-results.json`
(67 asserts PASS / 0 FAIL, `exit_clean: true`).

## F4-03.1 Valid production withdrawal (P1) — REAL HTTP PATH

Fixture: producto nuevo `AUDIT F403 Material` en STORE A, seed por
recepción HTTP real (10 @ 100 → WAC=100 server-side), orden `in_progress`
con item budgeted_qty=5 (service harness documentado).

| Verificación | Resultado |
|---|---|
| `POST /api/production-orders/{id}/withdraw` (con `unit_cost=0.01` forjado) | PASS — HTTP **200** |
| `result.unit_cost_used == 100` (WAC, no 0.01) | PASS |
| item `actual_qty == 1`, `actual_unit_cost == 100` | PASS |
| item `withdrawn_at` set | PASS |
| movimiento `production_out` qty −1 @ 100 | PASS |
| stock 10 → 9 | PASS |

## Controles de contrato de la ruta

| Control | Resultado |
|---|---|
| Route llama `_v3` con firma correcta (7 args, sin `p_unit_cost`) | PASS (P1 200 real) |
| `unit_cost` del body aceptado pero **ignorado** (compatibilidad UI) | PASS (P3/P4) |
| `idempotency_key` pass-through al registry oficial | PASS (P10) |
| Manejo de errores nuevos (OVERCONSUMPTION → 400, etc.) | PASS (P12) |

## Remediación del camino real

ANTES: `POST /withdraw` → 500 (RPC muerta) — operación de producción muerta.
DESPUÉS: `POST /withdraw` → 200, retiro contabilizado con costo server-side.
