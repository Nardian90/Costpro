# FASE 5 — REVERSE SMOKE

V-01 reversión atómica de recepción vía reverse_receipt_v2 (forma exacta /api/reverse), V-02 replay de la misma reversión.

**Resultado: 2 PASS / 0 OBSERVATION / 0 FAIL**

| ID | Título | Verdict | Checks |
|---|---|---|---|
| V-01 | Reverse smoke: recepción → /api/reverse (reverse_receipt_v2) atómica | PASS | ✓ reversal_ok, ✓ receipt_status_reversed, ✓ stock_restored, ✓ movements_negative, ✓ audit_action, ✓ wac_recalculated |
| V-02 | Reverse replay: repetir la misma reversión | PASS | ✓ rejected_or_idempotent, ✓ safe_error, ✓ stock_not_double_reversed, ✓ single_reverse_movement_set |

Detalle completo (TEST/INPUT/EXPECTED/ACTUAL/DB DELTA/AUDIT DELTA/IMPACT/VERDICT): `results.jsonl`
