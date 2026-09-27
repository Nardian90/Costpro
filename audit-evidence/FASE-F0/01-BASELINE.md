# FASE F0 — 01 BASELINE (Reconciliación Git)

**Fecha**: 2026-09-27 · **Fase**: F0 (READ-ONLY) · **Mandato**: baseline esperado `cad8e446`

## Comandos ejecutados

```text
$ git status
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean

$ git rev-parse HEAD
892bcd6b58afa0fdff5a2ab72a347085ce1a5db2

$ git rev-parse origin/main
892bcd6b58afa0fdff5a2ab72a347085ce1a5db2

$ git log -5 --oneline
892bcd6b docs(audit): E-SEC-FINAL — CI del commit cad8e446 verificado (TypeCheck+Lint+Unit+Build SUCCESS…)
cad8e446 feat(pos): política definitiva de precio, descuento y autorización D1–D5 — E-SEC-FINAL
b5b48491 docs(audit): E-SEC-R — política definitiva de precio …
dd1e6fb9 docs(audit): E-SEC CI verification (baseline-vs-fix comparison) …
6022ae85 docs(audit): certify E-SEC evidence …

$ git diff --check
(sin salida — limpio)
```

## Discrepancia documentada (protocolo del mandato: detener → verificar → no asumir → documentar)

El mandato esperaba `HEAD = cad8e446`, pero `HEAD = 892bcd6b`.

**Verificación del commit posterior** (`git show --stat 892bcd6b`):

```text
audit-evidence/FASE-E-SEC-FINAL/10-REGRESSION.md    | 4 +++-
audit-evidence/FASE-E-SEC-FINAL/12-FINAL-VERDICT.md | 2 +-
2 files changed, 4 insertions(+), 2 deletions(-)
```

- `892bcd6b` es el **commit de verificación CI** de la fase E-SEC-FINAL (cierre de su FASE 6/11): documenta que el commit `cad8e446` pasó TypeCheck+Lint+Unit+Build en CI (GitHub API check-runs, GET-only).
- **Es docs-only**: `git show --name-only 892bcd6b | grep -vE '^(audit-evidence|docs)/'` → vacío. No toca `src/`, `supabase/`, dependencias ni CI.
- Su padre es exactamente `cad8e446` (implementación D1–D5), ya pusheado por la fase E-SEC-FINAL antes de su cierre.
- **Conclusión**: commit posterior LEGÍTIMO. Discrepancia explicada y documentada; no se revierte ni se reescribe nada.

## Baseline efectivo de F0

```text
HEAD         = 892bcd6b  (docs-only sobre cad8e446)
código producto = cad8e446  (E-SEC-FINAL, sin drift: git diff cad8e446..892bcd6b -- src/ supabase/ = vacío)
origin/main  = 892bcd6b  (== HEAD)
worktree     = limpio (0 cambios)
```

Verificación adicional: `git fetch origin` sin novedades; servidor local (pm2, bun server.ts) sirviendo HEAD para las reproduciones de los análisis 03 y 05.

## Confirmación de fases cerradas (no reabiertas)

```text
C2R          → CERTIFIED (evidencia FASE-C2R)
E-SEC-FINAL  → CERTIFIED (audit-evidence/FASE-E-SEC-FINAL/12-FINAL-VERDICT.md, veredicto CERTIFIED)
```

F0 no modificó ninguno de sus artefactos (ver 08-ESEC-INTEGRITY.md).
