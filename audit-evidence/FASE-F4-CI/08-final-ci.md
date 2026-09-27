# FASE F4-CI — 08 CI final (post-push, verificación §24)

## Push

- Rama: `audit/f4-create-sale-v2-reconciliation`
- Commit del fix: `a6cdfb38` — `fix(security): F4 — reconcile create_sale_v2/24 source-of-truth`
- Push: `git push -u origin audit/f4-create-sale-v2-reconciliation` (2026-09-27T17:22Z) — nunca a main (§21)
- PR: **#1326** — https://github.com/Nardian90/Costpro/pull/1326 (abierto; sin merge, sin cierre — §23)

## Runs de CI sobre el PR (SHA a6cdfb38)

| Workflow | Run | Estado | Jobs |
|---|---|---|---|
| **CI** (`ci.yml`) | 36336731519 | **SUCCESS** | ✅ **Security Audit — SUCCESS** (el job que fallaba: exit 0) · ✅ TypeCheck+Lint+Unit+Build — SUCCESS · ❌ E2E Tests (Playwright) — FAILURE con `continue-on-error: true` (no bloquea) |
| Test Coverage | 36336731530 | **SUCCESS** | — |
| Security CI Gate (`security-gate.yml`) | 36336731587 | FAILURE | ❌ TypeScript Security Checks (74 checks históricos) · ✅ Allowlist Review · ⏭ SQL Security Checks (skipped) |

## Clasificación de cada fallo remanente (§24)

### E2E Tests (Playwright) — FAILURE (no bloqueante, `continue-on-error: true`)

- Workflow: CI · Job: E2E Tests (Playwright) · Step: Run E2E tests
- Error: `Error: [global-setup] Faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY en .env` (e2e/global-setup.ts:93)
- Root cause: secrets de GitHub Actions no configurados en el repo; el workflow inyecta fallbacks (`https://test.supabase.co` / `test-anon-key`) que el global-setup rechaza.
- Baseline comparison: **idéntico fallo en main@9327ee33** (job 108663716217), en el PR #1325 (job 108662883241) y en todos los runs desde el merge E2E. **PREEXISTENTE / CI-INFRA (categoría D)** — no causado por F4 (el diff F4 no toca TS/e2e), no absorbido (§7). Acción requerida (fuera de fase): configurar los secrets `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` en el repo.

### TypeScript Security Checks (Security CI Gate) — FAILURE

- Workflow: Security CI Gate · Job: TypeScript Security Checks
- Error: `74 check(s) FAILED` (55 endpoints sin Zod, 19 sin auth middleware)
- Baseline comparison: mismo fallo en el PR #1325 (36334584354) y en el PR F3 (36296366966). **PREEXISTENTE (categoría C/B — deuda histórica)** — explícitamente excluido del alcance por el mandato §7 ("74 TS checks históricos"). No modificado.

## Resultado de la secuencia obligatoria

```text
CI FALLA (Security Audit, BODY_DRIFT) → JOB/STEP/ERROR identificados → REPRODUCIDO (local exit 1)
→ MAIN vs F4 comparados (mismo fallo preexistente; causa = F4 incompleto) → ROOT CAUSE determinado
→ ¿F4 LO CAUSÓ? SÍ (era su entregable pendiente) → FIX MÍNIMO aplicado (detector intacto)
→ REGRESSION PASS (static PASS · LIVE PASS · 19/19 §20 · unit 2269 · E2E-POS-001 PASS)
→ PUSH A BRANCH → CI VERIFICADO → Security Audit: SUCCESS
```
