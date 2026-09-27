# FASE F2 — 01 BASELINE

**Fecha**: 2026-09-27 · **Fase**: F2 — Cierre controlado de nanoid y reconciliación del Security Audit · **Mandato**: cerrar exclusivamente R-DEPS-2/GHSA-2v37-7h3g-55p8; cero cambios funcionales; NO reabrir R-DEPS-1 ni E-SEC-FINAL.

## Estado Git verificado antes de modificar nada

```text
$ git status --short          → (vacío)
$ git rev-parse HEAD          → b10919d6dd61ddf83fdffa22047ab62c120e0167
$ git rev-parse origin/main   → b10919d6dd61ddf83fdffa22047ab62c120e0167
$ git log -5 --oneline
b10919d6 docs(audit): FASE F1 — CI verificado sobre 9423aa1d … VEREDICTO FINAL: F1 — CONDITIONAL
9423aa1d security(deps): remediate F1 dependency advisories
1272a32f docs(audit): FASE F0 — reconciliación global post E-SEC …
892bcd6b docs(audit): E-SEC-FINAL — CI del commit cad8e446 verificado …
cad8e446 feat(pos): política definitiva de precio, descuento y autorización D1–D5 — E-SEC-FINAL
$ git diff --check            → OK (sin errores)
```

**HEAD == origin/main == b10919d6** (baseline declarado por el mandato) → sin discrepancias, sin reset, sin force-push. Worktree limpio. Sin commits posteriores que analizar.

## Entorno

| Componente | Versión |
|---|---|
| Node (local) | v24.21.0 |
| Node (CI, ci.yml) | 22 (`actions/setup-node@v4`, `node-version: '22'`) |
| Bun | 1.3.14 (CI: `bun-version: latest` — 1.4.2 en run F1) |
| npm | 11.19.0 |
| pm2 | 7.0.4 (apps detenidas durante re-instalación limpia; reiniciadas para smoke) |
| package manager declarado | Bun (`bun install --frozen-lockfile` = autoridad de CI; `engines`: node >=22, bun >=1.3) |
| Lockfiles | `bun.lock` (autoridad CI) + `package-lock.json` (sin cambios en F2 — ver 06) |

## Punto de partida heredado de F1 (verificado, no asumido)

- F1 veredicto **CONDITIONAL** con 2 condiciones: (1) Security Audit CI job en failure por deuda SQL preexistente (9 funciones `SEARCH_PATH_NOT_SET`, probada 1:1 vs baseline); (2) nanoid GHSA-2v37-7h3g-55p8 restante **solo en DB de bun audit**.
- R-DEPS-1 cerrado 8/8 advisories: next 16.3.3, sharp 0.35.4, js-yaml 4.3.2, csv-parse 7.0.2, vitest 4.1.11, @vitest/coverage-v8 4.1.11 (pins exactos, intactos en b10919d6).
- Evidencia F1 leída completa: 01-BASELINE, 02-ADVISORIES-BEFORE, 03-DEPENDENCY-MATRIX, 05-PACKAGE-DIFF, 06-LOCKFILE-DIFF, 07-AUDIT-AFTER, 09-CI, 12-FINAL-VERDICT. Los análisis de F1 relevantes para F2 (rutas bun audit, clasificación nanoid) fueron **re-verificados con comandos propios** en esta fase (02, 03, 04).

## Vulnerabilidad objetivo (PRE-F2, reproducida antes de tocar nada)

```text
$ bun audit  →  exit 1
nanoid  <3.3.18
  docx › nanoid
  @tailwindcss/postcss › postcss › nanoid
  next › postcss › nanoid
  vitest › @vitest/mocker › vite › postcss › nanoid
  high: nanoid: custom generators can loop indefinitely when size is zero
        - https://github.com/advisories/GHSA-2v37-7h3g-55p8
1 vulnerabilities (1 high)

$ npm audit   →  found 0 vulnerabilities (exit 0)
```

Crudos: `scripts/f2-bun-audit-pre.txt`, `scripts/f2-bun-audit-pre.json` (fuera del repo).
