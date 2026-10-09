# Auditoría E2E: reutilización de fixtures, activación inesperada de pruebas y fix de accesibilidad «Ver» (Vales de Salida)

**Fecha:** 2026-10-09 · **Rama:** `fix/e2e-fixture-reuse-creation-separation` · **Base:** `origin/main @ 9bbbf7440`
**Alcance:** (1) investigación de si una operación normal de la app desencadena E2E; (2) reutilización de usuarios/tiendas de prueba en la suite ordinaria; (3) separación de los tests de creación; (4) guardrails UUID-level; (5) inventario de residuos SIN borrados; (6) fix de contraste/coherencia del botón **Ver**.

---

## 1. Estado inicial del repositorio y del entorno

| Elemento | Estado observado |
|---|---|
| Rama de partida | `main` sincronizada con `origin/main @ 9bbbf7440` (merge de PR #1386) |
| Trabajo previo | PR #1386 (mitigación estructural post-incidente) **ya mergeado por el propietario**; también en main: #1384 y #1385 del propietario (botones vales-salida) |
| Procesos activos | PM2: `costpro` (health 200), `telegram-cron-poller`, `whatsapp-cron-poller` — 3 online, 0 reinicios |
| CI | `ci.yml` y `test-coverage.yml`: jobs E2E con `if: false` (deshabilitados por el propietario); `daily-audit.yml` solo ejecuta un script Python de documentación (cron `0 0 * * *`, sin E2E); `security-gate.yml` estático |
| Crons Vercel (`vercel.json`) | 4 crons de negocio (pick3/sync, purge-snapshots, telegram/whatsapp auto-publish) — ninguno ejecuta pruebas |
| Pollers locales | Solo HTTP GET periódico a `/api/cron/*auto-publish` (idempotente, negocio) — no invocan procesos de prueba |
| BD compartida (snapshot read-only FASE 0) | stores=22, auth_users=27, profiles=25, tenants=8, memberships=28 |
| Protegidos verificados por UUID/email | 5 tiendas (Tienda Central, Puerto Padre, ENERVIDA, Piloto A `e711cebc…`, Piloto B `b5fed991…`) y 10 usuarios (Admin CostPro, Admin Demo, Belkis, propietario, seed demo ×4, landing.demo, qa.h1.a) — **todos presentes e intactos** |
| Credenciales | `.env` local (15 vars, no impresas); gobernanza en `e2e/config/protected-resources.json` |

No se encontraron workflows, cron locales (`crontab` no existe en el host), webhooks ni procesos residentes que ejecuten Playwright.

## 2. Investigación: ¿una operación normal desencadena E2E? (FASE 1)

### 2.1 Mecanismos inspeccionados

| Mecanismo potencial | ¿Existe? | Evidencia |
|---|---|---|
| Scripts npm que la app invoque tests | Existe el comando, no hay invocación desde la app | `package.json`: `test:e2e`, `test:e2e:hygiene`, etc. — solo CLI manual/CI |
| `spawn`/`exec` de procesos de prueba en `src/` | NO | Único `child_process` = `execFile('python3', [PARSER_SCRIPT, …])` en `Pick3PdfService.ts` (parser de PDFs, negocio); el resto de coincidencias `exec(` son `regex.exec()` |
| Referencias a GitHub API / workflow_dispatch / GITHUB_TOKEN en la app | NO | `rg` en `src/` = 0 resultados |
| Endpoints del flujo de vales de salida con efectos secundarios de proceso | NO | La creación/emisión viaja por API/RPC de negocio; no hay invocación de procesos externos |
| Workflows CI | Sí, pero E2E apagado | `if: false` en los 2 jobs E2E (firma del propietario en comentarios del propio workflow) |
| Cron / tareas programadas | Solo negocio | `vercel.json` (4 crons negocio) + pollers de mensajería |
| Scripts de seed/setup ejecutables indirectamente | Solo bajo CLI explícita | `provision-pilot-env.cjs`, `landing-demo-provision.cjs` — no referenciados desde la app |
| Playwright config que auto-arranque servidores/pruebas | NO auto-start | `playwright.config.ts`: sin `webServer`; `workers: 1` |

### 2.2 Evidencias de ejecución real (correlación temporal)

* Los recursos residuales de la madrugada del 9-oct llevan **RUN ID del framework** (`E2E-20261009-D0978E`, tenants `E2E-20261009-8DEF57/7DAE03`): fueron creados por el runner E2E (run-env), entre 01:36 y 01:57 UTC.
* `global-setup.ts` solo corre con `npx playwright test` (manual o CI). El CI de E2E estaba apagado → origen = **ejecución manual externa** (entorno del propietario, `main` sin las mitigaciones de #1386, que aún no estaban mergeadas a esa hora).
* Los logs PM2 locales no registran actividad E2E en esa ventana; no existen procesos Playwright en este host.
* Los 3 vales de salida manuales del propietario en tiendas reales fueron creados **después** de la ventana E2E (notas humanas, sin productos de prueba) — no hay correlación causal con la creación de vales.

### 2.3 Tabla de hipótesis (obligatoria)

| Hipótesis | Evidencia encontrada | Evidencia contraria | Conclusión | Confianza |
|---|---|---|---|---|
| Crear/guardar/confirmar un vale de salida inicia E2E | Ninguna ruta de código del flujo de vales invoca procesos de prueba ni GitHub; `src/` sin `spawn/exec` de tests | El flujo de vales solo llama API/RPC de negocio | **Descartada** (ningún mecanismo existe) | Alta |
| Un proceso externo ejecuta E2E simultáneamente | Residuos con RUN ID del framework, timestamps 01:36–01:57 UTC; CI E2E apagado a esa hora | Logs PM2 locales sin actividad E2E | **Confirmada** (ejecución manual externa del propietario sobre `main` sin fix; ya mitigada con #1386 mergeado) | Alta |
| Los tests generan usuarios o tiendas persistentes | 12 specs de la suite ordinaria creaban tiendas efímeras (cleanup en `afterAll` que no resiste fallos del runner); RBAC-008 dejaba usuarios `e2e80-created-*` huérfanos cuando un `expect` abortaba antes del cleanup | El cleanup `afterAll` funcionó en la mayoría de corridas (los residuos no crecieron en cada run) | **Confirmada** (acumulación cuando el runner muere o un test falla a mitad; causa raíz estructural: creación como medio en la suite ordinaria) | Alta |

## 3. Inventario de tests que crean usuarios o tiendas (FASE 2)

### 3.1 Creación de tiendas (`createTestStore` → `POST /api/stores`)

* **En la suite ordinaria (pre-fix):** `flows/pos-checkout`, `flows/transfers-flow` (2 tiendas), `flows/devolutions-flow`, `flows/reverse-sale-flow`, `flows/inventory-integrity` (2), `flows/purchase-orders-flow`, `flows/production-orders-flow`, `flows/catalog-storefront`, `flows/cash-closure-flow`, `accounts-payable`, `fc-automation`, `fc-accessibility` — 12 specs.
* **Objetivo explícito de creación:** `multi-store-comprehensive`, `stores-crud`, `store-lifecycle`, `store-switching`, `store-reset`, `store-create-autoswitch`, `data-hygiene-probe`, `isolation-proof` (8 specs, ya deshabilitados desde #1386).

### 3.2 Creación de usuarios

* `flows/roles-permissions.spec.ts` → **E2E-RBAC-008** (crea usuario real vía `POST /api/users/managed-create`, cleanup inline frágil — origen de 4 huérfanos documentados).
* `security.spec.ts` → `createTestUser()` con service-role (usuario atacante, sin cleanup garantizado).
* `auth.spec.ts` **no crea** (payload vacío → 401/403 siempre).

### 3.3 Clasificación (funcional / creación / mixto)

| Spec | Clasificación | Destino tras la intervención |
|---|---|---|
| RBAC-001..007 (roles-permissions) | Funcional (permisos; creación como medio) | **core**, reutilizando piloto A + identidades demo |
| RBAC-008 (era mixto) | Creación (su objetivo es verificar creación de usuario) | **creation** (`e2e/creation/rbac008-managed-user-creation.spec.ts`) |
| 12 specs de flows con `createTestStore` | Funcional (negocio; creación como medio) | **core**, heredan modo reuse del fixture central |
| 8 specs de creación de tiendas | Creación | **creation** |
| `security.spec` | Creación (usuario atacante) | **creation** |
| `workers-create.spec` | Creación de registros de negocio (workers) | **creation** |
| `auth.spec` | Funcional puro (sin creación) | core (sin cambios) |

## 4. Cambios de reutilización de fixtures (FASE 3)

1. **`e2e/fixtures/session.fixture.ts` — modo centralizado `E2E-FIXTURE-REUSE`:**
   * `STORE_FIXTURE_MODE`: `reuse` (DEFAULT) / `create` (opt-in). En `create` solo si `E2E_STORE_FIXTURE_MODE=create` o proyecto creation activo (`E2E_ALLOW_CREATION=1` ∧ `E2E_ISOLATION=1`).
   * `createTestStore()` en reuse: **no crea ninguna tienda** — devuelve la piloto persistente A (primera llamada del spec) o B (segunda, round-robin), resuelta fail-closed por nombre exacto vía `pilot-env.ts` y **verificada contra `protected-resources.json`** (`isProtectedStore`, aborta si la piloto no está en la gobernanza).
   * `deleteTestStore()` en reuse: no-op protegido con log (jamás borra pilotos).
   * `cleanupProducts()` extendido: elimina además `transaction_items` y las `transactions` que referencian los productos E2E (net-zero dentro del piloto; evita FK-residuos y stock fantasma).
   * `sweepStaleTestStores()` deja de ejecutarse en modo reuse (la limpieza de huérfanos preexistentes exige inventario + autorización — FASE 5).
   * `restoreActiveStore()` restaura al piloto A en legacy (antes caía a Puerto Padre, tienda real).
   * Nuevo guard `requireIsolatedCreation()`: FALLA con instrucción accionable si un spec de creación se invoca fuera del entorno aislado.
2. **`e2e/flows/roles-permissions.spec.ts` reescrito:** RBAC-001..007 usan el piloto A persistente + identidades demo protegidas; la membership temporal del encargado se inserta en `beforeAll` y se **elimina** en `afterAll` (reversible); RBAC-005 verifica autorización y persistencia con un **PATCH no-op** (address = address vigente). Se conserva el skip-by-token UI y las aserciones de seguridad originales.
3. **RBAC-008 extraído** a `e2e/creation/` con `requireIsolatedCreation()` + verificación explícita de `E2E_TEST_STORE_ID` (piloto del RUN aislado).
4. **10 specs de creación:** el `test.skip(true)` permanente (#1386) se reemplazó por banner de gobernanza + `test.beforeAll(() => requireIsolatedCreation())` — las pruebas **siguen existiendo** con sus aserciones, invocables solo por el comando documentado.
5. **`e2e/SCENARIO-INVENTORY.md`:** nota de gobernanza actualizada con el nuevo mecanismo y el comando explícito.

## 5. Guardrails introducidos y sus límites (FASE 4)

* **Fail-closed en la config** (no en el test): el proyecto `creation` **no se registra** sin `E2E_ALLOW_CREATION=1`; el proyecto `core` excluye la lista explícita `CREATION_SPECS` (11 entradas + `e2e/creation/**`). Sin las variables, es imposible ejecutarlos por accidente. `package.json`: `test:e2e` → `--project=core`; `test:e2e:creation` documentado.
* **Guard de entorno por spec**: `requireIsolatedCreation()` lanza error accionable si falta `E2E_ISOLATION=1` (no crea nada, no se salta en silencio).
* **Identidad UUID**: el reuse verifica cada piloto contra la gobernanza por UUID y nombre exacto; `hard-cleanup.ts` (de #1386) mantiene guardas FATAL por UUID/nombre protegido; el guard AFTER del teardown compara residuos UUID-level excluyendo protegidos.
* **Attribución por run**: el modo aislado (creation) persiste `test-results/e2e-run-context-pid-<pid>.json` y los recursos del run llevan el RUN ID en nombre/email; `reconcile-orphan-runs.ts` reconcilia huérfanos por RUN ID (usado en el incidente #2 con 6/6 runs).
* **Límites documentados**: (a) el cleanup extendido cubre productos/inventario/movimientos/transacciones de productos E2E — un `issue_slip` creado por un spec hypothetical de core no es atribuible (sin metadatos de run en el esquema) y quedaría documentado en el guard; (b) la transacción de POS deja brevemente registros mientras el spec corre (se limpian al final del spec con el producto); (c) el guard AFTER falla mientras existan residuos preexistentes sin autorizar — es su función.

## 6. Inventario de residuos detectados — SIN BORRADOS (FASE 5)

Snapshot read-only (Management API, `fase0_snapshot.py`). **No se eliminó nada en esta intervención.** Pendiente de autorización del propietario:

| Tipo | Recurso | created_at | Evidencia de origen E2E |
|---|---|---|---|
| Tienda ×6 | `E2E Multi *` (perm/rls1/blki/blkd2/blkd1/del) | 01:52–01:57 UTC 9-oct | Patrón artefacto de test; ventana de la corrida manual; tenant `E2E-20261009-8DEF57/7DAE03` |
| Tienda ×2 | `E2E PILOT A/B CostPro E2E-20261009-D0978E` (1 producto c/u) | 01:36 UTC 9-oct | RUN ID en nombre (pilotos efímeros de run sin teardown) |
| Usuario ×4 | `e2e-e2e20261009d0978e-{adm,usr,wh,enc}@costpro.test` | 01:36 UTC 9-oct | RUN ID en email (provisión run-env) |
| Tenant ×3 | `E2E TENANT E2E-20261009-{D0978E,8DEF57,7DAE03}` | 01:36–01:57 UTC 9-oct | RUN ID en nombre |
| Preexistentes excluidos (NO E2E, no se tocan) | 9× `*@uberip.com`, `user_c@tenant_b.com`, `auditor@costpro.test`, tiendas QA-H1/landing/archivadas | ≤ 14-sep | Sin evidencia de origen E2E; revisión humana previa los excluyó del plan |

**Vía de limpieza autorizable** (cuando el propietario decida): `node e2e/scripts/reconcile-orphan-runs.ts --run-id E2E-20261009-D0978E` (y para los `Multi`: borrado RPC por UUID tras re-verificación) + guard AFTER. Las tiendas/usuarios protegidos quedan fuera de toda ruta de borrado.

## 7. Fix de accesibilidad del botón «Ver» (FASE 6)

* **Causa raíz:** en `origin/main` el botón **Ver** (tarjeta y tabla) usaba `variant="secondary"` → `--secondary: #475569` (slate de tono azulado) con texto blanco — el propietario lo percibió como «azul claro con texto blanco», insuficientemente contrastado y ajeno al sistema visual verde de CostPro (los equivalentes Devolver/Anular/Recargar usan `outline`).
* **Cambio mínimo** (`ValesSalidaView.tsx`, 2 lugares): `variant="secondary"` → `variant="outline"` (tokens compartidos `border bg-background hover:bg-accent`). Se **conserva** etiqueta «Ver», `title`, `aria-label`, destino (`onVer`) y comportamiento; estados hover/focus-visible/active/disabled los aporta el design system (`button.tsx`), incluido `focus-visible:ring-[3px]` y navegación por teclado nativa.
* **Prueba de regresión** (`vales-salida-view.test.tsx`, tests 15-16): (a) ambos botones «Ver» llevan la firma del variante outline y **no** `bg-secondary`; (b) contraste WCAG 2.2 AA **calculado** (luminancia sRGB) sobre los tokens reales de `tokens.css` con aserciones de consistencia anti-drift: light `#0f172a/#f8fafc` = 14.1:1 y hover `#166534/#f0fdf4` = 7.2:1; dark `#e4e4e7/#121212` = 12.9:1 y hover `#e4e4e7/#1a1a1a` = 11.6:1 — todos ≥ 4.5:1 (AA) en light y dark. El resto de la pantalla no se tocó.

## 8. Resultados exactos de las pruebas (FASE 7)

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | **PASS** (0 errores) |
| `npx eslint <archivos modificados>` | **PASS** (0 errores; 3 warnings preexistentes de toggles `<button>` crudo) |
| `git diff --check` | **PASS** |
| `npx vitest run` (suite completa) | **PASS** — 2724 passed / 24 skipped / 0 failed (143 archivos) |
| `npx playwright test --list` | **PASS** — core: 266 tests en 37 archivos; `E2E_ALLOW_CREATION=1 --list`: 266 core + 124 creation (390 total = igual que antes de la separación, sin pérdidas) |
| E2E `flows/roles-permissions.spec.ts` (core, reuse) | **PASS** — 7/7 en 26.8s; log `[fixture:reuse] → E2E PILOT A (e711cebc…) — NO se crea ninguna tienda` |
| E2E `flows/pos-checkout.spec.ts` (canario reuse) | **PASS** — 9/9 en 43.1s; createTestStore → Piloto A; deleteTestStore → no-op |
| Guard higiene BEFORE/AFTER (`data-hygiene-guard.cjs`) | BEFORE: stores=7 users=4 (límites 12/12) PASS. AFTER: **idéntico** (net-zero de la corrida). El FAIL final del guard es **esperado**: son los residuos preexistentes de la FASE 5 pendientes de autorización — el guardrail está detectando correctamente, no es una regresión |
| Verificación post-E2E por UUID (read-only) | membership temporal encargado→PilotoA = 0 (revertida); address del Piloto A intacto |
| Proyectos `creation` sin autorización | **BLOCKED por diseño** — sin `E2E_ALLOW_CREATION=1` el proyecto no existe; con `--list` sin env: solo `[core]` |
| CI GitHub (jobs E2E) | **NOT RUN** — permanecen `if: false` por decisión del propietario; no se reactivaron |

## 9. Riesgos pendientes y recomendaciones

1. **Residuos de la FASE 5 sin autorizar** (8 tiendas + 4 usuarios + 3 tenants del 9-oct): siguen en BD y harán fallar el guard AFTER hasta su limpieza autorizada. Vía propuesta en §6.
2. **Transacciones de prueba dentro de pilotos**: en modo reuse el spec POS deja el piloto sin productos E2E (cleanup extendido), pero las `transactions` históricas de corridas anteriores del modo efímero ya borrado permanecen dentro de las pilotos (contenidas; no crecen users/stores/tenants). Si se quiere net-zero absoluto histórico, requeriría una operación de limpieza específica autorizada.
3. **RBAC-008 (DEFECT-003)**: la ruta `managed-create` sigue respondiendo 400 con `ERR_EMAIL_ALREADY_EXISTS` pese a crear el usuario correctamente; el test lo documenta con anotación. Corregir la ruta es otro alcance.
4. **`E2E_TEST_STORE_ID` en CI legacy**: si se reactivan los jobs E2E de CI (decisión del propietario), recordar que `core` corre en modo reuse y NO necesita los secrets del entorno `e2e`; el proyecto `creation` sí requiere el entorno aislado completo.
5. **Los toggles «Tarjetas/Tabla»** usan `bg-primary text-primary-foreground` (verde, AA en ambos temas): se inspeccionaron y no requieren cambios.
