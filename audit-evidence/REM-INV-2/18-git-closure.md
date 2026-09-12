# REM-INV-2 — 18: GIT CLOSURE

Cadena del protocolo ejecutada:

```text
AUDIT ✓ → REPRODUCE ✓ (staging aislado) → ROOT CAUSE ✓ (ausencia estructural de guardas)
→ GATE REVIEW ✓ (SAFE TO RETIRE; CONDITIONAL) → FIX ✓ (solo autorizado: pin permanente;
0 callers que migrar; REVOKE/DROP diferidos) → TEST ✓ → EVIDENCE ✓ → COMMIT → PUSH
→ FETCH → VERIFY REMOTE → WORKTREE CLEAN → RESET SURVIVAL → VERDICT
```

## 1. Procedimiento de cierre (comandos exactos)

```bash
git add audit-evidence/REM-INV-2 src/__tests__/integration/rem-inv-2-dynamic-reachability.test.ts
git commit -m "audit(rem-inv-2): certify F-01 purchase-reception gate — V1 receive_purchase retired at app layer, canonical path proven"
git push origin main
git fetch origin
git rev-parse HEAD origin/main   # invariant: idénticos
git status --short               # invariant: vacío
git clean -nd                    # dry-run (seguro) → reset survival:
git reset --hard origin/main && git clean -fd
# re-verificación: HEAD unchanged, worktree clean, .env sobrevive (untracked), manifest 100% OK
sha256sum -c audit-evidence/REM-INV-2/SHA256SUMS   # desde la raíz del repo
```

## 2. Invariantes de cierre

| Invariante | Criterio | Verificación |
|---|---|---|
| Baseline preservado | `90dce25f` es ancestro del commit del gate | `git merge-base --is-ancestor 90dce25f HEAD` |
| HEAD == origin/main | idénticos tras push | ejecutado post-push (resultado en worklog del gate) |
| Worktree clean | `git status --short` vacío tras push y tras reset survival | ejecutado post-push |
| Reset survival | HEAD unchanged; `.env` (untracked) sobrevive; flags V2 true; manifest 100% OK | ejecutado post-push |
| Commits locales huérfanos | ninguno (todo pusheado) | `git rev-parse HEAD == origin/main` |
| Diff del gate §REGLAS | solo archivos REQUIRED BY REM-INV-2 (evidence pack + 1 test pin) — cero archivos UNRELATED | revisado en commit |
| SHA256SUMS | determinístico (`git ls-files` del pack, LC_ALL=C sort, auto-excluido); bidireccional manifest↔files sin stale | ejecutado post-commit |

## 3. Contenido exacto del commit del gate

```text
src/__tests__/integration/rem-inv-2-dynamic-reachability.test.ts   (REQUIRED — pin dinámico permanente)
audit-evidence/REM-INV-2/00-baseline.txt … 18-git-closure.md        (REQUIRED — evidence pack)
audit-evidence/REM-INV-2/VERDICT.md                                 (REQUIRED — veredicto)
audit-evidence/REM-INV-2/SHA256SUMS                                 (REQUIRED — manifiesto)
audit-evidence/REM-INV-2/assets/*                                   (REQUIRED — evidencia primaria)
```

Ningún otro archivo. Cero cambios funcionales de negocio (el único código añadido es un test que no altera runtime).

## 4. Resultados de ejecución

Los resultados de la ejecución real de COMMIT→PUSH→VERIFY→RESET SURVIVAL de este gate se registran en el worklog compartido del proyecto (`worklog.md`, Task ID REM-INV-2) y en el informe final al operador — el SHA final del commit es por construcción no auto-contenible dentro de su propia evidencia y es observable con `git log --format='%H %s' -1` (invariante: debe igualar `origin/main`).
