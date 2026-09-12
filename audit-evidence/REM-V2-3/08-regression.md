# 08 — REGRESSION (PHASE 12)

Baseline comparativo: contract 12/12 → 16/16 (REM-V2-1 pins + 4 nuevos REM-V2-3) ·
tsc 0 · eslint 0 · vitest 2058/24/0 (REM-V2-2.1, con credenciales) → 2064/24/0 · build 137 OOM.

| Suite | Resultado | Comparación con baseline |
|---|---|---|
| `node scripts/v2-only-contract-test.cjs` | **16/16 PASS** (✅ V2-ONLY CONTRACT: PASS) | +4 pins REM-V2-3, 12 previos intactos |
| `tsc --noEmit` | **0 errores** (exit 0) | igual a baseline |
| `eslint src scripts --quiet` | **0 errores** (exit 0) | igual a baseline |
| `vitest run` | **2064 passed / 24 skipped / 0 failed** (98 files) | +6 passed: exactamente el nuevo test `reverse-route-v1-retirement.test.ts` (6 casos). Delta explicado, 0 fallos nuevos |
| `next build` | **exit 137 (SIGKILL del kernel)** — anon-rss ~3GB en box de 4GB | **INFRASTRUCTURE LIMITATION** idéntica a REM-V2-2/2.1 (documentada, NO contada como PASS). Compilación de inicio observada normal; kill en fases tardías. Sin cambio atribuible al retiro (misma limitación pre-existente) |
| Security suite (e2e/spec + herencia) | 0 fallos; spoofing/RLS pins intactos (iteration-19, iteration-rls) | igual a baseline |
| E2E relevantes | reverse/checkout cubiertos por contract + interceptación + herencia efímera (PG no disponible en este entorno — limitación documentada en 03) | — |

## Invariantes verificados post-retiro

- Contract: «sync offline usa create_sale_v2 (nunca V1)» ✓ — offline/replay sin V1.
- Contract: allow-list create_sale sin cambios ✓ (useTransactions.ts intacto).
- Contract: flags/FEATURES sin cambios ✓ (retiro no toca fail-closed defaults).
- Tests de pipelines canónicos (iteration-19: create_sale_v2/void_transaction ACL) ✓.
- Tests de no-modificación (PT-RLS.6.5 «no se modifica void_transaction») ✓ — 0 migraciones nuevas.

**No se aceptan new P0/P1/P2: 0 encontrados.** El 137 es la limitación de infraestructura
pre-existente, documentada y no oculta; no confunde build unavailable con build PASS.
