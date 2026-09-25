# FASE C2R — 01 BASELINE · POST-INCIDENT INTEGRITY & CLOSURE GATE

AUDIT MODE: **READ-ONLY** (cero escrituras: sin INSERT/UPDATE/DELETE/UPSERT/RPC mutativo/migración/ALTER/RLS/código/tests/commits/push/regeneración de tracked).

## 1. Identificación

| Campo | Valor |
|---|---|
| Fecha de auditoría | 2026-09-25 (UTC+8 sesión; consultas LIVE ~21:52 UTC) |
| SHA auditado | `00a7c9a7458d9fd9ae80fe84a854371ee9a88ad6` |
| Gate anterior | C2 (código `ca3a019f572ea2bb6d7ac6f8ad3cb5d666ada99c`, docs CI `00a7c9a7`) |
| Entorno LIVE | Supabase `wthkddeleylijmonclxg` (misma instancia de C0/C1/C1R/C2) |
| Método DB | PostgREST REST — **solo GET**; service role únicamente para censo de lectura (diagnóstico, precedentes C1R/C2); probe anon con anon key; secretos nunca impresos ni registrados |

## 2. Gate C2R-0 — baseline git

| Verificación | Comando | Resultado |
|---|---|---|
| HEAD | `git rev-parse HEAD` | `00a7c9a7458d9fd9ae80fe84a854371ee9a88ad6` |
| origin/main | `git rev-parse origin/main` | `00a7c9a7458d9fd9ae80fe84a854371ee9a88ad6` |
| Branch | `git status --short --branch` | `## main...origin/main` (sin ahead/behind) |
| Worktree | `git status --short` | limpio (solo `.env` gitignored) |
| Log | `git log --oneline --decorate -n 12` | `00a7c9a7 (HEAD -> main, origin/main, origin/HEAD)` → `ca3a019f` → `bbb74f4c` → … |

**Gate C2R-0: PASS** — HEAD == origin/main == `00a7c9a7`, worktree limpio. El código auditado ES el cierre C2.

Nota de entorno: el workspace fue reconfigurado entre C2 y C2R (repo re-clonado resolviendo al mismo SHA; ninguna modificación local).

## 3. Evidencia previa inventariada (§2 del mandato)

Leída al 100%:

```text
audit-evidence/FASE-C2/ (11/11 archivos, commiteada en ca3a019f)
  00-baseline.md · 00-preimplementation-map.md · 01-implementation-map.md
  02-writer-fix.md · 03-contract-filter.md · 04-save-semantics.md
  05-tests.md · 06-fc-regression.md · 07-security.md · 08-diff-review.md
  FINAL-REPORT.md
```

### MISSING EVIDENCE (registrado, no inventado)

| Item esperado | Estado | Compensación |
|---|---|---|
| `audit-evidence/FASE-C1R/` (5 docs: baseline, decisiones, censo, scope, FINAL-REPORT) | **NO existe en el repo ni en el workspace** — nunca fue commiteada (queda como untracked en C2 00-baseline §1: `?? audit-evidence/FASE-C1R/`) y el reset del workspace la perdió | Sus invariantes quedaron registrados en evidencia commiteada de C2 (00-baseline: censo idéntico a C1R al inicio; 07-security: par `0024c883`/`6dd35833` certificado por C1R doc 04). C2R re-deriva el censo LIVE directamente |
| `audit-evidence/FASE-C/` y `FASE-C1/` | Igual destino (untracked, perdidas) | Igual compensación |
| `scripts/fasec2-e2e.py` v1/v2 + `fasec2-e2e-results.json` | Estaban **fuera del repo por diseño** (§07-security: «scripts fuera del repo leen .env local») — perdidos con el reset | Diseño del script v2 endurecido documentado en C2 07-security §3; protección permanente replicada EN REPO por tests unitarios (409/404/CREATE-sin-store_id) |
| `scripts/fasec2-restore-0024c883.py` + `fasec2-recovery-0024c883.json` | Ídem (fuera del repo, perdidos) | La recuperación quedó documentada en C2 07-security §3 y es re-verificable contra LIVE (hecho en 04-0024c883-comparison.md) |
| Hashes per-row de los 7 FC capturados durante C2 | Los valores numéricos no constan en los docs C2 (se refieren al JSON perdido) | C2R captura AHORA los hashes canónicos de los 8 rows (02-live-census.md) y los ancla a los invariantes documentados |

Ningún dato fue inventado: todos los valores de C2R provienen de consultas LIVE o de archivos commiteados.

## 4. Comandos utilizados (todos de lectura)

```text
git status --short --branch · git rev-parse HEAD/origin/main · git log --oneline --decorate
git show --stat <sha> · git diff <range> [-- path] · git log <range> -- public/fc/
python3 scripts/fasec2r-db-readonly.py   (GET-only: OpenAPI, probe 42703, probe anon, censo, comparación de par)
python3 scripts/fasec2r-ci-check.py      (GitHub API GET-only: check-runs y workflow runs por SHA)
curl -I GET /fc/FC.html · /fc/sw.js      (servidor local del entorno)
grep sobre fuentes (store_id, isCostSheetDocument, validatedSet)
```

Artefactos C2R fuera del repo: `~/scripts/fasec2r-db-readonly.py` → `fasec2r-db-results.json`; `~/scripts/fasec2r-ci-check.py` → `fasec2r-ci-results.json`. Esta carpeta `FASE-C2R/` queda **untracked** (no se incluye en ningún commit durante la auditoría).
