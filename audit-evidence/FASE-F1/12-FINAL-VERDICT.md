# FASE F1 — 12 FINAL VERDICT (CONFIRMADO POST-CI)

**Fecha**: 2026-09-27 · Commit de remediación: `9423aa1d` · CI: run `36287866995` (quality SUCCESS) · Este archivo sustituye el veredicto provisional del commit 1 (patrón docs-only del repo: cad8e446 → 892bcd6b).

## F1 — DEPENDENCY SECURITY REMEDIATION

### Baseline
- commit: `1272a32f` (HEAD == origin/main, worktree limpio)
- Node: v24.21.0 local / **22 en CI** (ambos dentro de engines de todos los paquetes aplicados)
- Bun: 1.3.14 (CI: bun 1.4.2 en runners)
- package manager: Bun (`bun install --frozen-lockfile` = autoridad de CI) + npm 11.19.0 para `npm audit`/lockfile npm

### Cambios (pins exactos, mínimo cambio compatible)
- next: 16.3.0 → **16.3.3** (mínima corregida; existían 16.3.4–16.3.6 y NO se tomaron)
- sharp: 0.35.3 → **0.35.4**
- js-yaml: 4.3.1 → **4.3.2** (override `$js-yaml` propaga a @mdxeditor/editor → flag HIGH desaparece)
- csv-parse: 7.0.1 → **7.0.2**
- vitest: 4.1.10 → **4.1.11** (+ @vitest/mocker 4.1.11 transitivo)
- otras: **@vitest/coverage-v8 4.1.10 → 4.1.11** (peer EXACTO de vitest 4.1.11 — coherencia del ecosistema de la advisory, no higiene). Subida indirecta documentada: `@swc/helpers` 0.5.15→0.5.23 anidado de next (dep declarada por next@16.3.3), 26 binarios `@img/*` y 8 `@next/swc-*` version-locked.

### Security Audit (advisory por advisory)

| Advisory | Paquete | Antes | Después | Estado |
|---|---|---|---|---|
| GHSA-p293-qw3h-jr36 (CRITICAL) | next | vulnerable | fixed 16.3.3 | **CLOSED** |
| GHSA-2xp9-vwfh-vxw4 (CRITICAL) | next | vulnerable | fixed 16.3.3 | **CLOSED** |
| GHSA-rgj7-g3m4-5g8c (HIGH) | sharp | vulnerable | fixed 0.35.4 | **CLOSED** |
| GHSA-2883-xcg3-v3hh (HIGH) | js-yaml | vulnerable | fixed 4.3.2 | **CLOSED** |
| flag @mdxeditor/editor (HIGH) | js-yaml prop. | vulnerable | flag ausente | **CLOSED** |
| GHSA-8cw4-87c7-c6xx (MODERATE) | csv-parse | vulnerable | fixed 7.0.2 | **CLOSED** |
| GHSA-82fw-gwwq-j7x9 (MODERATE) | vitest | vulnerable | fixed 4.1.11 | **CLOSED** |
| GHSA-82fw-gwwq-j7x9 (MODERATE) | @vitest/mocker | vulnerable | fixed 4.1.11 | **CLOSED** |

`npm audit`: **7 → 0** (exit 0). `bun audit` (CI step SUCCESS): 1 high restante = nanoid (NO R-DEPS-1 — ver condición 2).

### Tests
```text
Unit:          2278 passed / 0 failed / 24 skipped (idéntico al baseline) — local y CI SUCCESS
TypeCheck:     0 errors — local y CI SUCCESS
Lint:          0 errors / 1294 warnings preexistentes (F1 no toca fuentes) — CI SUCCESS
Build:         local OOM (R-INFRA-1 preexistente, 2 intentos documentados con dmesg) → CI Build SUCCESS (autoridad; 2× confirmado: quality + e2e jobs)
Security Audit: CI job FAILURE por deuda preexistente NO relacionada (security-contract-static, 9 funcs SQL [LOW] — idéntico 1:1 al baseline 1272a32f); el STEP "Audit dependencies" = SUCCESS (7 vulns → 1 nanoid)
CI:            quality SUCCESS · Test Coverage unit SUCCESS · E2E cancelled (idéntico al baseline, R-E2E-1, continue-on-error)
```

### No regresión
- E-SEC-FINAL: **INTACTO** — diff `cad8e446..9423aa1d` en src/server.ts/next.config.ts/supabase/e2e = vacío; símbolos D1–D5 = conteos exactos de F0 (9/3/6/5/14/5); smoke 22/22; 401 en /api/stores sin auth.
- POS: sin cambios funcionales (0 líneas de producto); smoke startup/routing/API OK.
- imágenes: optimizer `/_next/image` 200 con resize real (128×72) sobre asset local; `images.remotePatterns` intacto.
- CSV: csv-parse 7.0.2 smoke OK (columns:true uso real + error controlado) + tests de integración verdes.
- YAML: js-yaml 4.3.2 smoke OK (load válido + error controlado).
- protected stores: **ZERO TOUCH** (solo GETs; fixtures en memoria; 11-ZERO-TOUCH.md).

### Git
- commit: `9423aa1d` (`security(deps): remediate F1 dependency advisories`, 15 archivos: 3 deps + 12 evidencia) + commit docs-only de este veredicto
- origin/main: **== HEAD** (ff 1272a32f..9423aa1d verificado en remoto; `git push` confirmado por la API y por salida del push)
- worktree: limpio

## Veredicto

```text
F1 — CONDITIONAL
```

R-DEPS-1 queda CERRADO en su totalidad (8/8 advisories), sin ninguna regresión atribuible a F1 y con todos los gates técnicos en verde (unit/tsc/lint/build en CI). El veredicto NO es CERTIFIED exclusivamente por las dos condiciones siguientes, ninguna de las cuales es una vulnerabilidad de R-DEPS-1 ni una regresión de F1:

```text
CONDICIÓN 1 — CI Security Audit job = failure (deuda preexistente no relacionada)
BLOCKER:   ninguno para F1 (el gate que F1 debía mover — audit de dependencias — está en SUCCESS)
EVIDENCE:  run 36285993203 (baseline 1272a32f) falló por las MISMAS 9 funciones
           [LOW] SEARCH_PATH_NOT_SET del step security-contract-static (log 1:1);
           el step "Audit dependencies" pasó y su salida mejoró de 7 vulns a 1
IMPACT:    nulo sobre F1; el repo arrastraba este rojo antes de F1
NEXT ACTION: fase propia de remediación SQL (SET search_path en 9 funciones) o
           revisión del allowlist ci-gate-allowlist.json — decisión del owner

CONDICIÓN 2 — nanoid GHSA-2v37-7h3g-55p8 (HIGH, solo DB de bun audit) permanece
BLOCKER:   ninguno para F1 (fuera de R-DEPS-1; mandato §6 exclusividad + §9 Bun=análisis sin modificar deps)
EVIDENCE:  preexistente (lockfiles old==new: postcss/nanoid 3.3.16, next/postcss/nanoid 3.3.17);
           0 usos de nanoid en src/; instancias vulnerables build-time only (postcss/vite);
           docx usa la línea 5.1.16 (fuera del rango <3.3.18); no explotable como se usa
IMPACT:    teórico DoS de build por mal uso del API (size 0); cero exposición runtime
NEXT ACTION: fase siguiente — override declarativo nanoid@^3 → 3.3.18 (trivial, ya
           diseñado) y decisión de endurecer el gate bun audit (hoy continue-on-error)
```

NO se corrigieron R-E2E-1, R-UX-DATE ni R-A11Y-1 (mandato). La siguiente fase se decidirá leyendo este resultado real.
