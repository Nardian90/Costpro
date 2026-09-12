# FASE 9 — F-03 REGRESSION GUARD

G-01 COGS=WAC server-side, G-02 costo malicioso cliente ignorado (sesión service_role = supabaseAdmin de la ruta), G-03 opening sin cost base + recepción + venta → blend ≠ 0.

**Resultado: 3 PASS / 0 OBSERVATION / 0 FAIL**

| ID | Título | Verdict | Checks |
|---|---|---|---|
| G-01 | F-03 guard: venta V2 con WAC válido → cost_at_sale=WAC (no 0) | PASS | ✓ cost_at_sale_wac, ✓ movement_unit_cost_wac, ✓ cogs_extended, ✓ wac_unchanged, ✓ no_zero_cost |
| G-02 | F-03 guard: costo malicioso del cliente IGNORADO (server = única autoridad) | PASS | ✓ client_cost_ignored, ✓ movement_server_cost |
| G-03 | F-03 guard: opening sin cost base + recepción + venta V2 → cost_at_sale=blend≠0 | PASS | ✓ reception_accepted, ✓ wac_blended, ✓ sale_accepted, ✓ cost_nonzero, ✓ cost_eq_blend |

Detalle completo (TEST/INPUT/EXPECTED/ACTUAL/DB DELTA/AUDIT DELTA/IMPACT/VERDICT): `results.jsonl`
