# 00 — BASELINE (FASE 0)

| Campo | Valor |
|---|---|
| HEAD | `d74349ac980eea62ef0fa30b7be70548f765423e` |
| origin/main | `d74349ac980eea62ef0fa30b7be70548f765423e` |
| branch | `main` |
| worktree | CLEAN (0 modificaciones al inicio del gate; artefacto allowScripts de npm en package.json revertido antes del baseline — ver nota) |
| Node | v24.19.0 |
| Bun | 1.3.14 |
| Next.js | ^16.1.1 (repo package.json) |
| Supabase target | proyecto wthkddeleylijmonclxg (PRODUCCIÓN — solo lecturas/probes sin mutación; todo mutativo en PG efímero 18.4 local, port 5433) |
| .env trackeado | NO (solo `.env.example`; `git ls-files .env*` = .env.example) |

**Nota pre-baseline:** `npm approve-scripts` (reactivación de servidor, task anterior) escribió un bloque `allowScripts` en `package.json`. Artefacto de tooling NO relacionado con P-1 → revertido (`git checkout -- package.json`) antes del baseline. node_modules ya instalado no se ve afectado.

**Criterio:** HEAD == origin/main == d74349ac980eea62ef0fa30b7be70548f765423e, WORKTREE CLEAN → **CUMPLE**.

**Baseline funcional heredado (REM-V2-2):** 33 runtime tests PASS, contract 12/12, vitest 2049/33/0, tsc 0, eslint 0 errores, F-03 FIXED, build OOM 137 documentado, verdict CONDITIONAL con P-1 recomendado.
