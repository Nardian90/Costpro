# FASE F2 — 12 FINAL VERDICT (CONFIRMADO POST-CI)

**Fecha**: 2026-09-27 · Commits: `041d5c3e` (remediación nanoid) + `53e3d655` (pin bun 1.3.14) · CI: run `36292453246` (quality SUCCESS; Capa A SUCCESS 0 vulns; Capa B preexistente) · Patrón docs-only del repo.

## F2 — NANOID SECURITY REMEDIATION

### Baseline
- commit: `b10919d6` (HEAD == origin/main, worktree limpio)
- Node: v24.21.0 local / **22 en CI**
- Bun: **1.3.14 local y CI** (pin introducido por F2; antes CI usaba latest=1.4.2)
- package manager: Bun (`bun install --frozen-lockfile` = autoridad de CI) + npm 11.19.0 para `npm audit`/lockfile npm

### Hallazgo
- advisory: **GHSA-2v37-7h3g-55p8** — nanoid, CWE-835 (custom generators loop infinito con size 0), HIGH, CVSS 5.9
- versiones vulnerables: v3 `<3.3.18` (y v4/v5 `[4.0.0, 5.1.6)` — nanoid 5.1.16 de docx ya corregido)
- árbol: 2 instancias vulnerables — `postcss/nanoid@3.3.16` (raíz, sirve a @tailwindcss/postcss y vite) y `next/postcss/nanoid@3.3.17` (postcss pin exacto de next 16.3.3); 0 usos de nanoid en `src/`
- aplicabilidad: **no explotable en CostPro** (postcss usa `nanoid/non-secure` con size fijo 6 en build-time; condición = mal uso del API, inalcanzable) — se remedió igualmente (el mandato prohíbe "build-only → ignorar" como única razón)

### Remediación
- estrategia: **Opción A — override declarativo** `"nanoid@^3.3.16": "3.3.18"` (mínima corregida; la clave no alcanza a `docx›nanoid ^5.1.3`)
- cambios: package.json +1 línea; bun.lock 2 versiones + metadato + cosmética bin; package-lock.json **0 cambios**; ci.yml/test-coverage.yml 5 líneas (pin bun 1.3.14 — configuración necesaria por skew de tooling descubierto)
- versiones finales: `postcss/nanoid = 3.3.18`, `next/postcss/nanoid = 3.3.18`, `nanoid (docx) = 5.1.16` (intacto) — deduplicación física verificada (mismo inode; 1318 vs 1319 paquetes)
- mecanismo bun documentado: overrides anidados no soportados; range-scoped no re-resuelve locks existentes; unscoped re-resuelve → re-resolución en 2 pasos 100% declarativa (sandbox G validado antes de aplicar)

### Auditoría

```text
bun audit:  1 high (nanoid)  →  No vulnerabilities found  (local exit 0)
            y en CI: step "Audit dependencies" → SUCCESS, "No vulnerabilities found"
npm audit:  0 → 0 (permanece limpio; lockfile byte-idéntico)
```

| Advisory | F1 | F2 |
|---|---|---|
| GHSA-2v37-7h3g-55p8 (nanoid ×2 instancias) | 1 high | **CLOSED (0)** |
| 8 advisories R-DEPS-1 (next ×2, sharp, js-yaml, csv-parse, vitest ×2, mdxeditor) | CLOSED | **siguen CLOSED (pins intactos)** |

### Tests

```text
Unit:       2278 passed / 0 failed / 24 skipped (1:1 con baseline y F1) — local y CI SUCCESS
TypeCheck:  0 errors — local y CI SUCCESS
Lint:       0 errors / 1294 warnings preexistentes (mismo stock) — CI SUCCESS
Build:      local exit 137 (R-INFRA-1 preexistente, firma idéntica a F1, sin ajustar memoria)
            → CI Build SUCCESS (autoridad; árbol modificado ejercitado por el build de CI)
CI:         quality SUCCESS · Test Coverage unit SUCCESS · E2E cancelled (idéntico al baseline)
            Run 1 (041d5c3e): fallo tooling bun 1.4.2 vs lock v1 — resuelto con pin 1.3.14 (53e3d655)
```

### Security Audit (capas separadas — mandato §11)

```text
Dependency audit (Capa A):  bun audit = 0 vulnerabilidades, step CI SUCCESS → CERRADA
Security contract (Capa B): step security-contract-static FAILURE por las MISMAS 9 funciones
                            [LOW] SEARCH_PATH_NOT_SET del baseline (1:1: cleanup_old_aggregates/1,
                            close_service_order_as_sale/6, fn_audit_stock_reception/0,
                            fn_audit_transaction_voiding/0, purge_old_reset_snapshots/1,
                            receive_production_output/4, snapshot_commission_rule/0,
                            upsert_usage_aggregate/7, withdraw_production_item/4)
                            → PREEXISTING — OUT OF SCOPE (idénticas al baseline; F2 no tocó
                              migrations, src/app/api/**, allowlist ni scanner)
```

Las 9 funciones `SEARCH_PATH_NOT_SET` **permanecen fuera de alcance** y continúan idénticas al baseline.

### E-SEC-FINAL
- intacto: **SÍ** — diff `cad8e446..working` en src/server.ts/next.config.ts/supabase/e2e = vacío; migración `20260927000001` = vacío; símbolos D1–D5 = conteos exactos F0/F1 (9/3/6/5/14/5); smoke subset 22/22 dentro del Gate A
- smoke: landing 200 · CSS (salida postcss/Tailwind) 200 · `GET /api/stores` sin auth = 401
- cambios de producto: **NINGUNO** (solo dependency/config + evidencia)

### Zero-touch
- ENER-VIDA: **ZERO TOUCH**
- PUERTO PADRE: **ZERO TOUCH**
- TIENDA CENTRAL: **ZERO TOUCH**
- (cero mutaciones, cero fixtures, cero migraciones aplicadas; solo smoke local sin credenciales)

### Git
- commits: `041d5c3e` `security(deps): close nanoid advisory` + `53e3d655` `fix(ci): pin bun 1.3.14 …`
- origin/main: **== HEAD == 53e3d655** (push verificado por salida y por API; worktree limpio)
- diff total: package.json (+1), bun.lock (7 líneas), ci.yml+test-coverage.yml (5 líneas), evidencia F2

## Veredicto

```text
F2 — CONDITIONAL
```

El objetivo técnico de F2 está **cumplido al 100%**: GHSA-2v37-7h3g-55p8 cerrada en el árbol efectivo de Bun (verificado local y en el step CI "Audit dependencies" = SUCCESS "No vulnerabilities found"), `npm audit` permanece 0, sin ninguna regresión atribuible (unit 1:1, tsc 0, lint 0, Build CI SUCCESS, E-SEC intacto, zero-touch) y todos los gates técnicos del mandato en verde. El veredicto NO es CERTIFIED exclusivamente por las condiciones siguientes — ninguna es una vulnerabilidad abierta ni una regresión de F2:

```text
CONDICIÓN 1 — Capa B del Security Audit CI sigue en failure (deuda SQL preexistente)
BLOCKER:     ninguno para F2 (la capa que F2 debía mover — dependency audit — está en SUCCESS con 0 vulns)
EVIDENCE:    run 36292453246 falla SOLO por las mismas 9 funciones [LOW] SEARCH_PATH_NOT_SET,
             probadas 1:1 contra baseline 36285993203 y F1 36287866995; mandato §11: PREEXISTING — OUT OF SCOPE
IMPACT:      nulo sobre F2; el repo arrastra este rojo desde antes de F1
NEXT ACTION: fase propia de remediación SQL (SET search_path en 9 funciones) o revisión del
             allowlist ci-gate-allowlist.json — decisión del owner (fuera de F2)

CONDICIÓN 2 — decisión de tooling pendiente de ratificación: pin CI bun 1.3.14
BLOCKER:     ninguno (era la condición para que CI pudiera instalar: bun 1.4.x rechaza el lock v1
             con override nueva; re-save a lock v3 rompería bun 1.3.x local)
EVIDENCE:    run 36291895501 (todos los jobs fallaron en Install dependencies) → pin aplicado en
             53e3d655 → run 36292453246: install/audit SUCCESS; engines bun >=1.3 satisfecho
IMPACT:      CI queda determinista local==CI; el repo queda efectivamente en bun 1.3.x hasta decisión
NEXT ACTION: owner ratifica el pin O estandariza bun >=1.4 (local+CI) y commitea lock v3 —
             modernización documentada, fuera del mínimo de F2

CONDICIÓN 3 — R-E2E-1 (deuda preexistente no relacionada, igual al baseline)
BLOCKER:     ninguno para F2
EVIDENCE:    E2E cancelled en ci.yml (idéntico a baseline y F1); E2E de Test Coverage failure
             (idéntico al run de Test Coverage de F1, comparación 1:1 por API)
IMPACT:      nulo sobre F2; sin fallos nuevos de clase alguna
NEXT ACTION: fase E2E ya priorizada por F0 (secrets/fixtures/test.supabase.co — R-E2E-1)
```

NO se corrigieron las 9 funciones SQL, R-E2E-1, R-UX-DATE ni R-A11Y-1 (mandato). La siguiente fase se decidirá leyendo este resultado real.
