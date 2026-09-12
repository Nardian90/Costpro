# FASE 7 — MULTI-TIENDA

M-A cross-store rechazado, M-B SKU duplicado identidad (id,store), M-C SKU exclusivo de otra tienda sin leakage.

**Resultado: 3 PASS / 0 OBSERVATION / 0 FAIL**

| ID | Título | Verdict | Checks |
|---|---|---|---|
| M-A | Store A user → producto de Store B (cross-store) | PASS | ✓ rejected, ✓ err_store_mismatch, ✓ storeB_stock_unchanged |
| M-B | SKU duplicado F-SHARED en A y B: identidad por (id, store) | PASS | ✓ both_ok, ✓ correct_products, ✓ correct_costs |
| M-C | SKU inexistente en A pero existente en B (F-ONLY-B): sin leakage | PASS | ✓ rejected, ✓ storeB_stock_unchanged |

Detalle completo (TEST/INPUT/EXPECTED/ACTUAL/DB DELTA/AUDIT DELTA/IMPACT/VERDICT): `results.jsonl`
