# FASE 6 — R-04 BOUNDARY

B-01..B-03 can_reverse_document (la función que consulta la ruta), B-04 bypass directo RPC (reproducción R-04 heredado, SIN corregir), B-05 can_admin_reverse_transaction (B-8).

**Resultado: 4 PASS / 1 OBSERVATION / 0 FAIL**

| ID | Título | Verdict | Checks |
|---|---|---|---|
| B-01 | R-04 boundary: can_reverse_document(clerkA, tienda A, 'receipt') | PASS | ✓ clerk_blocked |
| B-02 | R-04 boundary: can_reverse_document(mgrA, tienda A, 'receipt') | PASS | ✓ role_allowed |
| B-03 | R-04 boundary: can_reverse_document(whA, tienda A, 'receipt') | PASS | ✓ role_allowed |
| B-04 | R-04: clerk llama reverse_receipt_v2 DIRECTO (sin pasar por /api/reverse) | OBSERVATION |  |
| B-05 | R-04 (ventas): can_admin_reverse_transaction(clerkA, tienda A) | PASS |  |

Detalle completo (TEST/INPUT/EXPECTED/ACTUAL/DB DELTA/AUDIT DELTA/IMPACT/VERDICT): `results.jsonl`
