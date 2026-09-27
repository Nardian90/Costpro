# FASE F1 — 01 BASELINE

**Fecha**: 2026-09-27 · **Fase**: F1 — Remediación controlada de dependencias de seguridad (R-DEPS-1) · **Mandato**: exclusivamente R-DEPS-1; cero cambios funcionales.

## Estado Git verificado antes de modificar nada

```text
$ git status --short          → (vacío)
$ git rev-parse HEAD          → 1272a32f7d9e4a6097065b692a36a84af7b46fd6
$ git rev-parse origin/main   → 1272a32f7d9e4a6097065b692a36a84af7b46fd6
$ git log -5 --oneline
1272a32f docs(audit): FASE F0 — reconciliación global post E-SEC …
892bcd6b docs(audit): E-SEC-FINAL — CI del commit cad8e446 verificado …
cad8e446 feat(pos): política definitiva de precio, descuento y autorización D1–D5 — E-SEC-FINAL
b5b48491 docs(audit): E-SEC-R — política definitiva de precio …
dd1e6fb9 docs(audit): E-SEC CI verification …
$ git diff --check            → OK (sin errores)
```

**HEAD == origin/main == 1272a32f** (baseline F0 declarado) → sin discrepancias, sin reset, sin force-push. Worktree limpio.

## Entorno

| Componente | Versión |
|---|---|
| Node (local) | v24.21.0 |
| Node (CI, ci.yml) | 22 (`actions/setup-node@v4`, `node-version: '22'`) |
| Bun | 1.3.14 |
| npm | 11.19.0 |
| pm2 | 7.0.4 (apps detenidas durante re-instalación limpia; reiniciadas para smoke) |
| package manager declarado | Bun (`engines`: node >=22, bun >=1.3; CI usa `bun install --frozen-lockfile`) |
| Lockfiles | `bun.lock` (autoridad CI) + `package-lock.json` (base de `npm audit`) |

## Baseline de vulnerabilidades (PRE-F1, `npm audit --json` en 1272a32f)

```text
7 vulnerabilidades: 1 critical (next ×2 advisories), 3 high, 3 moderate
```

Detalle completo en `02-ADVISORIES-BEFORE.md`. Guardado crudo en `scripts/audit-pre-f1.json` (fuera del repo).

## Realidad operativa conocida (heredada, no re-evaluada)

- R-INFRA-1: build local OOM (máquina 4041 MB RAM, 0 swap) — ver 08-TESTS.md Gate D.
- R-E2E-1: deuda E2E preexistente (3 causas raíz, 0 bug de producto, F0) — CI e2e job `continue-on-error: true`.
- E-SEC-FINAL CERTIFIED en cad8e446/892bcd6b — F1 no reabre (ver 10-ESEC-INTEGRITY.md).
