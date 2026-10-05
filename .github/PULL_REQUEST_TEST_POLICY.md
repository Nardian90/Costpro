# CostPro — Política oficial de pruebas por PR basada en riesgo

> **SOURCE OF TRUTH.** Este documento es la fuente de verdad para decidir qué
> pruebas debe ejecutar cada Pull Request según su riesgo y el área afectada.
> En caso de conflicto entre esta política y la práctica de cualquier agente o
> contribuidor, gana esta política.

| Campo | Valor |
|---|---|
| Versión | 1.0 |
| Estado | Vigente |
| Baseline del repo al redactarla | `70bd70a0ea023842885ed6eaede6a8a085148e0f` (main) |
| Denominador E2E oficial | `e2e/SCENARIO-INVENTORY.md` (128 escenarios hoy: 113 automatizados) |
| Excepciones de seguridad | `ci-gate-allowlist.json` (formato: reason / added_by / expires) |

---

## 1. Propósito

Establecer una política formal y versionada que determine **qué nivel de
pruebas debe ejecutar cada Pull Request según el riesgo y el área afectada**.

La política evita dos extremos igualmente nocivos:

1. Ejecutar la suite E2E completa de CostPro para absolutamente cada PR,
   incluso cambios triviales de documentación o copy (coste real: la suite E2E
   corre contra Supabase real, `workers: 1`, ~30 min de CI).
2. Permitir que un agente decida arbitrariamente que un cambio importante
   necesita solamente unas pocas pruebas.

El objetivo es que:

> **cada PR ejecute automáticamente el nivel de validación proporcional a su
> riesgo, mientras que las certificaciones y releases mantienen una validación
> transversal completa.**

---

## 2. Reglas invariables

* No modificar lógica de negocio para cumplir esta política.
* No modificar Supabase, RLS ni APIs.
* No cambiar la suite funcional existente salvo que sea necesario para
  integrar esta política.
* No eliminar tests. No reducir cobertura existente.
* No marcar como "flaky" un test sin evidencia reproducible (§12).
* No hacer que una prueba obligatoria sea opcional simplemente para conseguir
  CI verde.
* No crear un segundo sistema de clasificación si ya existe infraestructura
  equivalente (§3.5).
* No ejecutar cambios directamente sobre `main`.
* No mezclar esta tarea con remediaciones de producto.

---

## 3. Auditoría del sistema actual (a la fecha de esta política)

Esta sección describe el estado **real** del sistema de pruebas y CI. Debe
actualizarse cuando cambien los workflows (§17).

### 3.1 Suites existentes

| Tipo | Comando | Config | Alcance actual |
|---|---|---|---|
| TypeCheck | `bunx tsc --noEmit` | `tsconfig.json` | todo el repo |
| Lint | `bun run lint` | ESLint (`eslint .`) | todo el repo |
| Unit / integration / component | `bun run test` | `vitest.config.ts` (jsdom) | 137 archivos `src/**/*.test.{ts,tsx}` |
| Cobertura | `bun run test:coverage` | umbrales en `vitest.config.ts` | ver `docs/branch-protection.md` |
| E2E | `bun run test:e2e` | `playwright.config.ts` | 34 specs en `e2e/`, proyecto chromium, `workers: 1`, contra Supabase real vía `e2e/global-setup.ts` |
| Security contract (estático, CI-safe) | `node scripts/security-contract-test-static.cjs` | `ci-gate-allowlist.json` | surface LIVE certificado (`supabase/security-contract/contract-surface.sql`) + replay de migraciones |
| BOLA contract | `node scripts/bola-contract-test.cjs` | — | guards de `store_id` en endpoints multi-tenant |
| Security Gate TS | `node scripts/ci-gate-ts-checks.js` | — | endpoints API (auth middleware, Zod) |
| Security Gate SQL | `node scripts/ci-gate-sql-checks.js` + `ci-gate-checks.sql` | requiere secret `DATABASE_URL` | RLS / SECURITY DEFINER |
| Security contract (LIVE) | `node scripts/security-contract-test.cjs` | requiere `SUPABASE_ACCESS_TOKEN` | **NUNCA en CI** (comentario REM-INV-5 del propio repo); reservado a certificación con credenciales dedicadas |
| Build | `bun run build` (`next build`) | `next.config.ts` | app completa |
| E2E aislamiento | `bun run test:e2e:isolation-proof` | `e2e/scripts/concurrency-proof.cjs` | prueba de aislamiento de runs |

### 3.2 Workflows existentes y su rol efectivo

| Workflow | Disparador | Jobs | Efecto |
|---|---|---|---|
| `ci.yml` (CI) | push + PR → `main`, `master`, `develop` | `quality` (TypeCheck + Lint + Unit + Build) · `e2e` (Playwright) · `security` (audit + secretos + BOLA + contract estático) | `quality`: gate de facto (pasa consistentemente) · `e2e`: **advisory** (`continue-on-error: true`) · `security`: gate de facto pero con **fallo histórico** (§3.4) |
| `test-coverage.yml` (Test Coverage) | push + PR → `main`, `develop` | `unit-tests` (Vitest con cobertura) · `e2e-tests` (needs unit-tests) | `unit-tests`: gate de facto · `e2e-tests`: **advisory** (`continue-on-error: true`, duplicado del e2e de CI ya existente — no se añaden más duplicados, §11) |
| `security-gate.yml` (Security CI Gate) | PR que toca `supabase/migrations/**`, `src/app/api/**`, `ci-gate-allowlist.json`, `scripts/ci-gate-*.js` | `ts-security-checks` · `sql-security-checks` (solo si hay migraciones) · `allowlist-review` | **Selección automática por rutas ya existente** para seguridad (§3.5) |
| `daily-audit.yml` | cron diario + manual | audit agent | Ajeno a PRs |

### 3.3 Checks required reales

* **Branch protection de `main` NO está activada** en GitHub (verificado vía
  API a la fecha de esta política: *"Branch not protected"*).
  `docs/branch-protection.md` documenta la configuración **deseada**, con
  nombres de checks desactualizados (`code-quality`, `test-coverage`,
  `security-scan`, `build-check` no coinciden con los nombres reales de jobs).
* Efecto práctico: ningún check es *required* para GitHub; los gates efectivos
  son los jobs que pasan consistentemente (`quality`, `unit-tests`) y la
  revisión manual del mantenedor.
* Esta política **no depende** de que branch protection esté activa: define
  qué debe ejecutar el agente; el CI define qué se ejecuta automáticamente.
  Si en el futuro se activa, §14 indica los contexts reales recomendados.

### 3.4 Fallos históricos conocidos (baseline `70bd70a0e`)

| Check | Estado en main | Naturaleza |
|---|---|---|
| CI → `Security Audit` | **failure persistente** | Deuda preexistente documentada en iteraciones REM-INV: endpoints legacy sin middleware de auth (p. ej. `pick3/*`, `academy/*`, `wallet/*`, `legal/incidents`, `billing/webhook`, `bot/chat`, `logs`, `telegram/webhook`) y endpoints sin validación Zod. Se detecta igual en PRs que no tocan esas rutas. |
| CI → `E2E Tests (Playwright)` | failure / cancelled frecuente | Advisory (`continue-on-error: true`). Causas históricas: dependencia de Supabase real, timeouts, memoria del runner. |
| Security CI Gate → `TypeScript Security Checks` | failure en PRs que tocan `src/app/api/**` o migraciones | Misma deuda de baseline (auth middleware / Zod). El allowlist existe para excepciones revisadas, no para ocultar deuda nueva. |

Regla operativa: un fallo en estos checks **no se ignora ni se etiqueta
automáticamente como preexistente** — se acredita contra baseline con
evidencia (§12).

### 3.5 Mecanismos de clasificación ya existentes (no duplicar)

| Mecanismo | Qué clasifica | Uso en esta política |
|---|---|---|
| `e2e/SCENARIO-INVENTORY.md` | **Escenarios E2E** por riesgo P0–P3, denominador oficial (128 hoy, 113 automatizados) | Fuente del denominador FULL E2E (§7); esta política clasifica PRs, no escenarios — conceptos complementarios |
| `security-gate.yml` | Selección automática de checks de seguridad **por rutas** | Ya implementa la automatización por paths para seguridad; no se crea otro |
| `ci-gate-allowlist.json` | Excepciones de seguridad con `reason` / `added_by` / `expires` | Formato a imitar para excepciones (§13) |
| `docs/E2E_TEST_PLAN.md`, `docs/REGRESSION_SMOKE_TEST_REPORT.md` | Plan y reportes E2E manuales | Referencia para regresión transversal manual |
| **No existen**: PR template, CODEOWNERS, labels automation, tooling de affected-tests, Playwright projects por módulo (solo `chromium`) | — | Esta política crea solo el PR template mínimo (§10/§16) y no construye el resto (§14) |

---

## 4. Niveles de riesgo y matriz oficial

### 4.1 Niveles

| Nivel | Definición |
|---|---|
| **LOW** | El cambio no puede alterar comportamiento observable del producto: documentación, copy, estilos aislados sin interacción, assets no funcionales. |
| **MEDIUM** | UI interactiva, navegación, estados compartidos de cliente, responsive, componentes compartidos. Puede afectar cómo se usa el producto, no cómo se calculan/conservan los datos. |
| **HIGH** | Lógica de negocio de un dominio: ventas/POS, inventario, caja, devoluciones, pagos dentro de un flujo, multi-tienda, sincronización de datos, flujos que afectan varias áreas. |
| **CRITICAL** | Auth, autorización, RLS, Supabase, RPC, migraciones, inventario source-of-truth, movimientos de stock, seguridad, cambios transversales de arquitectura. |
| **RELEASE** | No es un nivel de PR: es el **modo de validación transversal** obligatorio para certificaciones y releases (§8). |

### 4.2 Matriz riesgo → pruebas

**OBL** = obligatorio · **REC** = recomendado · **—** = no requerido.
La CI base (§11) ejecuta automáticamente TypeCheck, Lint, Unit y Build en todo
PR; la columna "obligatorio" se satisface con esos jobs salvo que el agente
necesite el feedback antes de push o el job falle.

| Prueba | LOW | MEDIUM | HIGH | CRITICAL |
|---|---|---|---|---|
| TypeCheck (`tsc --noEmit`) | OBL | OBL | OBL | OBL |
| Lint (`bun run lint`) | OBL | OBL | OBL | OBL |
| Build (`bun run build`) | OBL | OBL | OBL | OBL |
| Tests Vitest afectados por los archivos tocados | OBL si existen | OBL | OBL | OBL |
| Suite Vitest completa (`bun run test`) | — | — | REC | OBL |
| Cobertura (`bun run test:coverage`) | — | — | — | OBL si toca `src/` |
| E2E focalizada del módulo (`bunx playwright test e2e/<spec>.spec.ts`) | Cuando corresponda | OBL | OBL | OBL |
| E2E de regresión del módulo afectado | — | OBL | OBL | OBL |
| E2E de regresión transversal (módulos conectados) | — | — | OBL | OBL |
| Verificación de integridad de datos (scripts/queries sobre datos de prueba) | — | — | Cuando corresponda | OBL cuando corresponda |
| Security contract estático + BOLA (ya corren en CI `security`) | — | — | — | OBL + el agente debe revisar el resultado, no solo el job |
| **FULL E2E** (`bun run test:e2e` completo) | **NO** | **NO** | Solo si el alcance es amplio (≥3 módulos de negocio) | **OBL** si el cambio es transversal |

Regla de oro: **Full E2E no es obligatoria para todo PR**; sí lo es para
releases/certificaciones y para los PR que la matriz clasifique como
críticos/transversales (§8).

### 4.3 Ejemplos por nivel (con rutas reales de este repo)

* **LOW**: `docs/**`, `**/*.md`, textos/copy de UI, `public/**` (assets no
  funcionales), estilos puntuales sin lógica, comentarios.
* **MEDIUM**: `src/components/**` — incluidos los sidebars reales
  (`src/components/views/terminal/Sidebar.tsx`,
  `SidebarFocusMode.tsx`, `MobileTabBar.tsx`,
  `views/help/HelpSidebar.tsx`), `src/components/ui/**`, vistas Dashboard /
  Help Center / filtros / formularios, `src/hooks/**`, `src/store/**`
  (salvo sesión), responsive.
* **HIGH**: vistas de dominio
  `src/components/views/terminal/views/{pos,sales,cash,cash_closure,devolutions,inventory,inventory_count,lots,receptions}/**`,
  `src/app/api/**` (dominios de negocio),
  `src/lib/{inventory-logic,commission-engine}.ts`,
  `src/lib/cost-engine/**`, `src/lib/cost-sheets/**`,
  `src/store/session-store.ts` (multi-tienda), sincronización.
* **CRITICAL**: `src/lib/auth.ts`, `src/lib/auth-middleware.ts`,
  `src/lib/auth-rate-limit.ts`, `src/lib/cron-auth.ts`, `src/lib/csrf.ts`,
  `src/lib/db.ts`, `src/app/api/auth/**`, `src/app/api/{payments,billing}/**`,
  `supabase/migrations/**` (SIEMPRE crítico: 452 migraciones y contando),
  `supabase/security-contract/**`, `ci-gate-allowlist.json`, RLS /
  SECURITY DEFINER, inventario source-of-truth (movimientos de stock),
  cambios transversales de arquitectura.

La ruta da el nivel **por defecto**. El alcance real puede escalarlo (§6);
nunca reducirlo sin justificación conforme a esta política.

---

## 5. Mapa de clasificación por rutas (descubierto, no inventado)

Los patrones siguientes corresponden a la estructura **real** del repositorio
verificada al redactar esta política. Si la estructura cambia, este mapa se
actualiza en el mismo PR que la cambie.

| Ruta modificada | Riesgo por defecto | E2E asociada (specs reales en `e2e/`) |
|---|---|---|
| `docs/**`, `**/*.md` | LOW | — |
| `public/**` (assets no funcionales) | LOW | — |
| `src/components/views/terminal/Sidebar*.tsx`, `MobileTabBar.tsx`, `Header.tsx`, `views/help/HelpSidebar.tsx` | MEDIUM (navegación) | `home-page.spec.ts`, `accessibility.spec.ts`, `mobile-viewport-audit.spec.ts` según alcance |
| `src/components/**`, `src/components/ui/**` | MEDIUM | specs de la vista afectada + `accessibility.spec.ts` |
| `views/{dashboard,management_hub,reports,abc_analysis}/**` | MEDIUM/HIGH | `reports.spec.ts` |
| `views/{help,academy,rss,legal,labels,calculator,chat}/**` | MEDIUM | `academy.spec.ts`, `legal.spec.ts`, `ai-chat.spec.ts` |
| `views/{pos,sales,cash,cash_closure,devolutions}/**` | HIGH | specs de ventas/caja/devoluciones del módulo |
| `views/{inventory,inventory_count,lots,receptions,received_services}/**` | HIGH | `inventory.spec.ts`, `import.spec.ts` |
| `src/hooks/**`, `src/store/**` | MEDIUM | según vista consumidora |
| `src/store/session-store.ts` (multi-tienda / active store) | HIGH | `store-switching.spec.ts`, `multi-store-comprehensive.spec.ts`, `stores-crud.spec.ts`, `store-lifecycle.spec.ts`, `store-reset.spec.ts`, `store-create-autoswitch.spec.ts` |
| `src/app/api/**` (dominios de negocio) | HIGH | `api-routes.spec.ts` + specs del dominio |
| `src/app/api/{auth}/**`, `{payments,billing}/**` | CRITICAL | `auth.spec.ts`, `rate-limit.spec.ts`, `security.spec.ts` |
| `src/lib/auth*.ts`, `csrf.ts`, `cron-auth.ts`, `db.ts` | CRITICAL | `auth.spec.ts`, `security.spec.ts`, `security-headers.spec.ts` |
| `src/lib/inventory-logic.ts` | HIGH (CRITICAL si toca movimientos de stock source-of-truth) | `inventory.spec.ts`, `sync-batch.spec.ts` |
| `src/lib/cost-engine/**`, `commission-engine.ts`, `cost-sheets/**` | HIGH | `cost-engine.spec.ts`, `cost-sheet-flow.spec.ts`, `commissions-payments.spec.ts` |
| `src/services/pick3/**`, `src/app/pick3` | MEDIUM (módulo legacy aislado) | specs pick3 si existen |
| `supabase/migrations/**` | **CRITICAL (siempre)** | Security Gate SQL + contract estático; FULL E2E según alcance |
| `supabase/security-contract/**`, `ci-gate-allowlist.json` | CRITICAL | security contract |
| `e2e/**`, `vitest.config.ts`, `playwright.config.ts`, `scripts/ci-gate-*`, `.github/workflows/**` | Infraestructura de testing | Suite base completa + evaluación explícita de que el cambio no debilita la validación (§9) |
| `README.md`, `.gitignore`, editor config | LOW | — |

---

## 6. Cómo determinar el riesgo de un PR

Procedimiento obligatorio (lo ejecuta el agente en el paso 1 del §10):

1. Listar archivos modificados: `git diff --name-only origin/main...HEAD`.
2. Clasificar cada archivo con el mapa §5 y quedarse con el **nivel máximo**.
3. **Escalar** (nunca reducir) el nivel si el alcance real lo amerita:
   el cambio toca ≥3 módulos de negocio, es transversal a la arquitectura,
   afecta al source-of-truth de datos, o toca multi-tienda/active store.
4. Ante duda entre dos niveles, elegir el superior y documentar el motivo.
5. Declarar en el PR: `PR RISK`, `REQUIRED TESTS`, `FULL E2E REQUIRED`
   (§10).

---

## 7. Reglas para E2E

### 7.1 Qué es FULL E2E aquí

FULL E2E = **la suite E2E completa actualmente definida por el repositorio**:
`bun run test:e2e` sobre `e2e/**`, cuyo denominador oficial de escenarios es
`e2e/SCENARIO-INVENTORY.md` (hoy 34 archivos de specs y 128 escenarios
documentados, 113 automatizados).

> El número NO está codificado en esta política: hoy son 128 escenarios; si
> mañana existen 141, serán 141; si después existen 180, serán 180. El
> denominador es siempre el conjunto dinámico `e2e/**` +
> `SCENARIO-INVENTORY.md`, nunca una cifra fija.

### 7.2 Cuándo se exige

* FULL E2E **no es obligatoria para todo PR**. Ejecutarla por rutina en
  cambios triviales está explícitamente desaconsejado (coste: workers=1,
  Supabase real, ~30 min de runner).
* FULL E2E **sí es obligatoria** para releases/certificaciones y para los PR
  que la matriz clasifique como críticos/transversales (§8, §4.2).

### 7.3 E2E focalizada y por módulo

* Focalizada: `bunx playwright test e2e/<spec>.spec.ts` (o `--grep "<patrón>"`).
* La selección de specs por módulo está en el mapa §5.
* Hoy el job E2E de CI es **advisory** (`continue-on-error: true`): por eso la
  ejecución focalizada con evidencia por parte del agente es parte de la
  matriz — no se delega ciegamente en CI.
* Un fallo E2E advisory no se ignora: se clasifica con evidencia según §12.

---

## 8. Release / Certificación

La suite completa **sí es obligatoria** en:

* Certificación de fase.
* Release candidate.
* Release de producción.
* Auditoría final.
* Cambios críticos transversales (CRITICAL con alcance ≥2 módulos o
  arquitectura).

Para CostPro, la validación de release incluye, cuando corresponda:

```text
FULL E2E  (suite completa actual — 128 escenarios hoy, conjunto dinámico)
bun run test            (suite Vitest completa)
bun run test:coverage   (umbrales de cobertura)
bunx tsc --noEmit && bun run lint && bun run build
node scripts/security-contract-test-static.cjs
node scripts/bola-contract-test.cjs
node scripts/security-contract-test.cjs   (LIVE, con credenciales dedicadas, NUNCA en CI)
```

> **Full E2E no es obligatoria para todo PR.**
> **Full E2E sí es obligatoria para releases/certificaciones y para los PR
> que la matriz clasifique como críticos/transversales.**

---

## 9. Cambios críticos — reglas especiales

* Cambios de **auth / RLS / Supabase / migraciones**: nivel CRITICAL siempre.
  `security-gate.yml` se dispara solo por rutas; además el agente debe
  revisar su resultado y el de `quality`.
* **Prohibido** añadir entradas a `ci-gate-allowlist.json` para "arreglar" el
  gate sin remediar la causa. Toda nueva entrada requiere `reason`,
  `added_by` y `expires` (formato existente) y justificación en el PR.
* **Prohibido** mezclar cambios de RLS/migraciones dentro de PRs que añaden
  features de producto: los cambios críticos van en PR propio.
* Cambios en **infraestructura de testing** (workflows, configs de Playwright/
  Vitest, `e2e/**` global-setup/teardown) requieren, además de la suite base,
  una evaluación explícita por escrito de que **no debilitan la validación**
  (no reducen retries que oculten fallos, no excluyen specs, no relajan
  umbrales de cobertura sin justificación).

---

## 10. Agent PR Testing Protocol (obligatorio para todo agente)

Cada agente que trabaje en un PR debe:

### 1. Determinar

```text
archivos modificados      → git diff --name-only origin/main...HEAD
áreas afectadas           → mapa §5
riesgo                    → procedimiento §6
```

### 2. Declarar antes de cerrar el PR

```text
PR RISK = LOW / MEDIUM / HIGH / CRITICAL
```

### 3. Declarar

```text
REQUIRED TESTS        → las pruebas obligatorias de la matriz §4.2 para ese nivel
RECOMMENDED TESTS     → las pruebas recomendadas
FULL E2E REQUIRED = YES / NO
```

### 4. Ejecutar todas las pruebas obligatorias

* Las de CI base (TypeCheck, Lint, Unit, Build) quedan satisfechas con los
  jobs automáticos; el agente las ejecuta localmente cuando necesita feedback
  antes de push o cuando el job falla.
* El resto (E2E focalizada, regresiones, integridad, security manual) se
  ejecuta localmente **con evidencia**: comando ejecutado + resultado
  (extracto del log), anotados en la sección Testing del PR.

### 5. Si una prueba obligatoria no puede ejecutarse

**NO declarar CERTIFIED.** Debe informar:

```text
BLOCKED
```

o la clasificación que corresponda (§12), indicando qué prueba falta, por qué
no pudo ejecutarse y qué se necesita para desbloquear.

> **El agente no puede declarar que una suite no es necesaria solamente
> porque considera que el cambio es pequeño. Debe justificar la
> clasificación conforme a esta política.**

---

## 11. Responsabilidad del CI

* El CI ejecuta **automáticamente en todo PR**, sin acción del agente:
  TypeCheck, Lint, Unit tests y Build (jobs `quality` y `unit-tests`);
  checks de seguridad por rutas (`security-gate.yml`); la suite E2E completa
  en modo advisory.
* El CI **no** ejecuta hoy selección automática de E2E por módulo ni gates
  diferenciados por nivel de riesgo (decisión documentada en §14).
* Los jobs advisory y los fallos históricos de main (§3.4) **no eximen** al
  agente de la matriz: la evidencia local cubre exactamente lo que el CI no
  bloquea.
* Consolidación: los jobs E2E de `ci.yml` y `test-coverage.yml` ya están
  duplicados en el repo; esta política no añade nuevos workflows ni jobs
  redundantes (§14).

---

## 12. Tratamiento de tests flaky, INDETERMINATE y PREEXISTING

* Un test fallido **NO** se clasifica automáticamente como flaky.
* Para declarar `FLAKY` se necesita **evidencia reproducible**, por ejemplo:
  * pasa en reintentos controlados (≥3 ejecuciones limpias);
  * falla sin relación con el cambio del PR;
  * reproduce también en baseline (mismo commit de `main` sin el cambio);
  * existe historial documentado (caso conocido: `ai-command-center.test.tsx`
    "estado inicial", timing-flaky documentado en PRs anteriores).
* Si no existe evidencia, el resultado es `INDETERMINATE` y se trata como
  fallo real hasta demostrar lo contrario: un PR con un `INDETERMINATE` en
  una prueba obligatoria **no puede declararse CERTIFIED**.
* `PREEXISTING` **no es una etiqueta automática**: se acredita comparando el
  mismo test contra el baseline (`origin/main` / `BASE_COMMIT`) y citando el
  SHA + la evidencia (link al check run de main o log local de main).
* Formato de evidencia en el PR (tabla en la sección Testing):

| Test | Resultado | Comando | Comparación con baseline | Conclusión |
|---|---|---|---|---|
| `e2e/auth.spec.ts > login` | fail | `bunx playwright test e2e/auth.spec.ts` | también falla en `main@<SHA>` (check-run <url>) | PREEXISTING acreditado |

---

## 13. Procedimiento para excepciones

* Toda excepción a esta política se documenta **por escrito en el PR**
  (sección Testing → Blockers/Excepciones) con el formato inspirado en
  `ci-gate-allowlist.json`:

```json
{
  "what": "prueba o regla exceptuada",
  "reason": "por qué no puede ejecutarse/aplicarse",
  "added_by": "PR #<n> / agente / persona",
  "expires": "fecha límite de la excepción o 'permanent-justified'"
}
```

* Prohibido usar excepciones para omitir una prueba obligatoria disponible
  localmente.
* Las excepciones que exijan cambiar workflows se rigen además por §9
  (infraestructura de testing) y requieren revisión del mantenedor.

---

## 14. Automatización: qué quedó automatizado y qué no

### 14.1 Ya automatizado (existente, sin duplicación)

* CI base en todo PR: TypeCheck + Lint + Unit + Build (`ci.yml`/`quality`,
  `test-coverage.yml`/`unit-tests`).
* Selección de checks de seguridad **por rutas** (`security-gate.yml`):
  migraciones, `src/app/api/**`, allowlist, scripts de gate.
* Excepciones de seguridad con expiración (`ci-gate-allowlist.json`).

### 14.2 Decisión deliberada: NO construir más automatización ahora

Seleccionar E2E automáticamente por paths/labels/riesgo exigiría crear un
segundo mecanismo de clasificación (duplicaría el mapa §5), tooling de
affected-tests inexistente en el repo, y tocaría una suite E2E que corre
contra Supabase real con `workers: 1` — complejidad y riesgo innecesarios
para esta tarea. Por tanto:

* **Se documenta la matriz** (§4, §5) como procedimiento del agente.
* **Se mantiene el CI base obligatorio** tal cual existe.
* **Se prescribe el comando E2E** que el agente debe ejecutar según la
  clasificación (§7.3 + mapa §5).

### 14.3 Si en el futuro se activa branch protection

Los contexts recomendados son los nombres **reales** de jobs (no los
desactualizados de `docs/branch-protection.md`):

```text
TypeCheck + Lint + Unit Tests + Build     (ci.yml / quality)
Unit & Integration Tests                  (test-coverage.yml / unit-tests)
Allowlist Review                          (security-gate.yml)
TypeScript Security Checks                (security-gate.yml — cuando la deuda de baseline esté remediada)
```

---

## 15. Validación de la política (casos de prueba)

Casos de comprobación que validan la matriz contra ejemplos reales:

| Caso | Cambio | Clasificación esperada según esta política |
|---|---|---|
| **A** | Cambio puramente visual de un botón (`src/components/ui/**`, sin interacción) | **LOW** — TypeCheck+Lint+Build (CI base); tests afectados si existen; Full E2E: **NO** |
| **B** | Cambio del Sidebar (`src/components/views/terminal/Sidebar.tsx`) | **MEDIUM** — CI base + Vitest afectados + E2E navegación (`home-page.spec.ts`) + E2E responsive (`mobile-viewport-audit.spec.ts`) + `accessibility.spec.ts`; Full E2E: NO |
| **C** | Cambio de Dashboard (`views/dashboard/**`) | **MEDIUM/HIGH** — E2E Dashboard/reports (`reports.spec.ts`) + E2E de navegación afectada; Full E2E: NO |
| **D** | Cambio de venta + inventario (`views/pos/**` + `src/lib/inventory-logic.ts`) | **HIGH** — unit/integration + E2E ventas + E2E inventario (`inventory.spec.ts`) + E2E regresión transversal + integridad de datos; Full E2E: solo si el alcance es amplio |
| **E** | Cambio de RLS / migración / auth (`supabase/migrations/**`, `src/lib/auth*.ts`) | **CRITICAL** — todo lo anterior + Security (contract estático + BOLA + security-gate) + integration + E2E críticas (`auth.spec.ts`, `security.spec.ts`); Full E2E: YES si transversal |
| **F** | Release / certificación de fase | **FULL E2E** (suite completa actual, conjunto dinámico) + Vitest completa + cobertura + security estático/BOLA (+ LIVE fuera de CI) |

---

## 16. PR template

Se crea `.github/pull_request_template.md` (mínimo, en español) con la
sección `## Testing` obligatoria, que materializa la declaración del §10.
Es el único artefacto nuevo además de este documento. El template debe
mantenerse corto: la política detallada vive aquí, no en el template.

---

## 17. Compatibilidad con CostPro y gobernanza

### 17.1 Funcionalidades respetadas

Esta política **no modifica ninguna funcionalidad**; solo define qué
validación exige cada PR. Respeta explícitamente las particularidades
existentes:

* **Multi-Tienda / active store**: todo cambio que toque `session-store`,
  selector de tienda o contexto de tienda se clasifica como mínimo HIGH con
  regresión `store-*.spec.ts` / `multi-store-comprehensive.spec.ts`.
* **Ventas / Vender / Inventario / Caja / Auditoría**: dominios HIGH; sus
  specs son la regresión de módulo obligatoria.
* **Auth / RLS / Supabase**: dominios CRITICAL (§9).
* **Help Center / Dashboard / Performance mode / responsive**: dominios
  MEDIUM con sus specs asociadas (`accessibility.spec.ts`,
  `mobile-viewport-audit.spec.ts`, specs de la vista).

### 17.2 Gobernanza de esta política

* Este archivo es el source of truth; los cambios a la política viajan en un
  PR propio (clasificado como mínimo MEDIUM, por ser infraestructura de
  validación — §9).
* La sección §3 se actualiza cuando cambien los workflows.
* El conteo de escenarios E2E **vive únicamente** en
  `e2e/SCENARIO-INVENTORY.md`; esta política nunca replica cifras más allá
  del contexto puntual.
