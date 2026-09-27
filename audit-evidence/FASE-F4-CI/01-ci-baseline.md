# FASE F4-CI — 01 CI Baseline

## Repositorio

- Repo: `Nardian90/Costpro`
- BASELINE_MAIN_SHA: `9327ee33b8582adedc22bfda4440c7e75c9fb2bb` (Merge PR #1325, 2026-09-27T16:53:11Z)
- F4_SHA inicial: `9327ee33` (rama `audit/f4-create-sale-v2-reconciliation` creada desde este SHA — la rama `audit/f4-create-sale-v2-reconciliation` NO existía en origin al inicio de la fase; el trabajo F4 previo nunca se pushó)
- Estado del working tree al inicio: limpio; rama local previa: `feat/e2e-80-coverage` (mergeada como PR #1325)

## Workflows activos (`.github/workflows/`)

| Workflow | Archivo | Trigger |
|---|---|---|
| CI | `ci.yml` | push + pull_request |
| Test Coverage | `test-coverage.yml` | push + pull_request |
| Security CI Gate | `security-gate.yml` | pull_request |
| Daily AI System Audit | `daily-audit.yml` | schedule |

## Jobs del workflow CI (`ci.yml`)

1. `quality` — "TypeCheck + Lint + Unit Tests + Build": `bunx tsc --noEmit`, `bun run lint`, `bun run test`, `NODE_OPTIONS=--max-old-space-size=4096 bun run build`
2. `e2e` — "E2E Tests (Playwright)": `bun run test:e2e` (requiere `secrets.NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` con fallback a placeholders)
3. `security` — "Security Audit": hardcoded-secrets grep, `node scripts/bola-contract-test.cjs`, `node scripts/security-contract-test-static.cjs`

## Estado CI al inicio de la fase (runs verificados vía API)

| Run | Workflow | Ref | SHA | Estado |
|---|---|---|---|---|
| 36334881755 | CI | main | 9327ee33 | **failure** (Security Audit + E2E) — quality success |
| 36334881828 | Test Coverage | main | 9327ee33 | success |
| 36334135431 | CI | main | 7b63b347 | in_progress (post-merge #1324) |
| 36334584354 | Security CI Gate | feat/e2e-80-coverage (PR) | 01287e2b | **failure** (TypeScript Security Checks) |
| 36334584316 | CI | feat/e2e-80-coverage (PR) | 01287e2b | **failure** (E2E + Security Audit) — quality success |
| 36297405234 | CI | **main** | **9d220a36** (pre-merge E2E) | **failure (Security Audit)** — E2E cancelled, quality success |

## Dato crítico de baseline

El job **Security Audit** ya fallaba en `main@9d220a36` (2026-09-27T05:30Z) — **ANTES** del merge del PR #1325 (E2E) — con el mismo error exacto (`BODY_DRIFT_FROM_MIGRATION` sobre `create_sale_v2/21`). El fallo de CI objeto de esta fase NO fue introducido por el merge E2E.

Deuda conocida al baseline (fuera de alcance F4, según mandato §7):
- 74 TS checks históricos (job "TypeScript Security Checks" del Security CI Gate — 55 endpoints sin Zod, 19 sin auth middleware)
- 17 funciones ⚪ baseline en Capa A/B del contract estático (SEARCH_PATH_NOT_SET, ANTI_SPOOFING_GUARD_MISSING)
- E2E en CI no ejecutable por secrets ausentes (categoría D — infra CI)
