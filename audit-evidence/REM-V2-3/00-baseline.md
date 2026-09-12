# 00 — BASELINE (PHASE 0)

| Campo | Valor |
|---|---|
| HEAD / origin/main | `a1c018476db194b5108cd076fc08c329dcc4fce3` |
| Commit | `chore(audit): repair REM-V2-2.1 evidence manifest` (verificado) |
| Branch | `main` |
| Worktree | CLEAN al inicio del gate |
| Node / Bun | v24.19.0 / 1.3.14 |
| Next.js | ^16.1.1 |
| Database target | Supabase `wthkddeleylijmonclxg` = **PRODUCCIÓN — READ ONLY** (solo SELECT vía Management API). Sin reutilización de datos productivos como fixtures. |
| Timestamp | 2026-09-12T22:21:17Z |
| Estado heredado | P-1 V2 checkout = ACTIVE · P-1 V2 reverse = ACTIVE · P-4 = NOT EXECUTED (verificado al inicio) |

**Criterio:** HEAD == origin/main == a1c01847, worktree clean → **CUMPLE**.

**Herencia de proofs runtime efímeros (REM-V2-2 / REM-V2-2.1):** verificada por
`git diff --stat 224ba6f4..a1c01847 -- src/ supabase/ scripts/ package.json` = VACÍO.
El árbol de código es idéntico al que produjo los 33 runtime tests PASS (PG efímero 18.4),
checkout smoke S-01..S-06, reverse V-01/V-02, idempotencia/concurrencia/multi-store y
F-03 FIXED. Los resultados runtime de esos gates son válidos para este árbol.
