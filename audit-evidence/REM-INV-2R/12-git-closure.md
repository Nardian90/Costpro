# 12 — GIT CLOSURE (REM-INV-2R, fases 18-21)

## Diff forense (fase 18)

Cambios totales del gate respecto al baseline `f027d4ea`:

| Archivo | Tipo | Categoría del mandato |
|---|---|---|
| `scripts/security-contract-test.cjs` | M (+27) | test pin / contract — pin permanente de ausencia |
| `src/__tests__/integration/rem-inv-2r-receive-purchase-retirement.test.ts` | A (83) | test pin / contract — ausencia en src+supabase |
| `audit-evidence/REM-INV-2R/**` | A (15 archivos + SHA256SUMS) | evidence |

Verificaciones de no-toxicidad:

```text
supabase/ (migraciones, configs):        0 archivos modificados
src/ fuera del nuevo pin:                0 archivos modificados
receive_against_po / register_reception /
confirm_pending_reception / checkout /
reverse / inventory / WAC:               0 modificaciones (verificado por
                                         diff forense + hashes PRE/POST de
                                         definiciones byte-idénticos)
Cambios no relacionados (UNRELATED):     0
Cambios unstaged al hacer commit:        0
```

El DDL ejecutado no genera migración en el repo: la base de datos es la fuente de verdad
y la documentación íntegra del DDL queda en `05-ddl-execution.md` (evita drift con el
historial de migraciones de Supabase; precedente REM-V2-3/REM-INV-2).

## Commit (fase 19)

- Subject: `fix(db): retire orphaned receive_purchase RPC`
- Parent: `f027d4ea` (baseline verificado)
- Sin mezcla de otros findings; sin cambios funcionales.

## Push + remote verification (fase 20)

- `git push origin main` ejecutado → push range `f027d4ea..HEAD`.
- `git fetch origin` posterior.
- `HEAD == origin/main` verificado por `git rev-parse` (ambos punteros idénticos).
- El commit remoto contiene: pins (contract + ausencia), evidence pack completo, SHA256SUMS.
- Cierre NO solo local: verificado contra el remoto.

## Reset survival (fase 21)

Procedimiento seguro heredado (dry-run primero, luego real):

```text
git clean -nd            (dry-run: sin sorpresas)
git reset --hard origin/main
git clean -fd
```

Post-reset verificado:

| Check | Resultado |
|---|---|
| HEAD unchanged (== commit del gate == origin/main) | PASS |
| worktree limpio (`git status --short` vacío) | PASS |
| `.env` sobrevive (untracked) con NEXT_PUBLIC_USE_V2_CHECKOUT=true y NEXT_PUBLIC_USE_V2_REVERSE=true | PASS |
| PM2 `costpro` online / HTTP 200 | PASS |
| contract test permanece (pin REM-INV-2R en árbol) | PASS |
| `receive_purchase` continúa ausente en DB (SELECT-only re-check) | PASS |
| canonical reception functions continúan presentes | PASS |
| evidence íntegra: `sha256sum -c SHA256SUMS` → todas OK | PASS |
| `.env` no entra en Git (gitignored, untracked) | PASS |

## Estado final

```text
HEAD == origin/main == commit REM-INV-2R
worktree: clean
baseline ancestro f027d4ea: verificado en el historial
```
