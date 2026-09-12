# FASE 8 — OFFLINE/REPLAY

O-01 replay offline→queue→reconnect sobre create_sale_v2 con dedup por idempotency_key; binding estático sync/batch/route.ts:148 → create_sale_v2 (contract test).

**Resultado: 1 PASS / 0 OBSERVATION / 0 FAIL**

| ID | Título | Verdict | Checks |
|---|---|---|---|
| O-01 | Offline → queue → reconnect → replay termina en V2 (create_sale_v2) con dedup | PASS | ✓ original_success, ✓ replay_idempotent, ✓ replay2_idempotent, ✓ single_document, ✓ stock_once |

Detalle completo (TEST/INPUT/EXPECTED/ACTUAL/DB DELTA/AUDIT DELTA/IMPACT/VERDICT): `results.jsonl`
