# Ciclo 002 — CP-CI-006 — U1: estados canónicos en vistas de datos (cxc/cxp via StateRenderer)

- **Fecha / hora (UTC)**: 2026-11-24T00:10Z → 2026-11-24T00:36Z (ejecución programada CP-CI, Job 540736; disparo manual del propietario)
- **Agente / entorno**: ZCode programado (cron CP-CI); workspace `/home/z/my-project/Costpro` (clon fresco de `Nardian90/Costpro`, sandbox reciclado → reclonado según PASO 1 del ENTRYPOINT; `bun install` 1.233 paquetes; vendors skills NO reinstaladas — no requeridas por esta unidad)
- **Repositorio al inicio**: rama `main`, SHA `029d40165` (merge PR #1695), árbol limpio, sincronizado con `origin/main` (fetch + pull ff-only)

## Misión seleccionada
- **ID y archivo**: `CP-CI-006`, unidad **U1 — Cobertura de estados con StateRenderer** (`backlog/CP-CI-006-interaction-quality.md`), módulo elegido: **cuentas por cobrar/pagar** (`accounts_payable/` + `accounts_receivable/`)
- **Justificación de selección**: `STATE.json→next_recommended` apunta a CP-CI-006 con "primera unidad = cobertura de estados (vacío/error/carga) en vistas de datos" y sigue vigente (misión `queued`, attempts 0). Reglas aplicadas (PROGRAM.md §3): una sola misión por ciclo; decisión desde STATE.json leído en este ciclo (no de memoria); no repetir `completed` (CP-CI-006 no tiene ciclos previos); **sin dos ciclos consecutivos en la misma área** (ciclo 1 = deuda-tecnica/CP-CI-001 → ciclo 2 = interaccion/CP-CI-006, regla §3.4). `agent_lock.locked=false` al inicio → procede (PASO 4), y en esta ejecución el lock **sí se fijó** en `locked=true` al iniciar (corrección de la observación del ciclo 1) y se liberó al cerrar. PRs del programa: el PR del ciclo 1 (#1684) está **mergeado**; los PRs que bloqueaban 5 disables (#1682, #1683) también mergeados → sin conflictos. PR abierto ajeno #1694 (CP-UX-POLISH-002) verificado por archivos [MEDIDO — E1]: toca `Sidebar.tsx`, `TerminalShell.tsx`, `ChatBot.tsx`, `POSExpressMode.tsx`, `ReceptionExpressMode.tsx`, `store/index.ts` y un test — **sin solape** con los archivos de esta unidad (módulo cxc/cxp).

## Fase B — Investigación (causa raíz)
- **Cobertura global [MEDIDO — E1]**: `StateRenderer` aparece en 24 archivos dentro de `src/components/views/terminal/views/` (grep literal); el BASELINE documentaba 22/57 vistas de negocio al 21-nov. Tras los merges del propietario la deuda sigue siendo la misma naturaleza: la mayoría de vistas de datos no usa el canon de estados.
- **Alcance del módulo [MEDIDO — E1]**: `accounts_payable/` (3 componentes) y `accounts_receivable/` (1 vista) — **0 de sus componentes usa `StateRenderer`/`Skeleton`/`ViewLoadingSplash`**:
  - `AccountsPayableView.tsx` (619 líneas): loading = texto plano `Cargando...` (L312); error = bloque inline sin botón de reintento (L305–309) pese a que el hook expone `refetch`; empties duplicados e inconsistentes dentro de `GroupedTableView` y `ListView`; KPIs sin estado de carga.
  - `AccountsReceivableView.tsx` (462 líneas): loading = spinner ad-hoc (border-success); error = tarjeta propia (con retry, no canónica); empty = tarjeta propia contextual.
- **Causa raíz [INFERIDO — E1]**: ambas vistas se construyeron fuera (o antes) del canon de estados del repo; cada una inventó su propia representación de los 4 estados → caso de libro de `costpro-product-quality` §2 (origen común): migrar al componente canónico `StateRenderer` en vez de pulir instancias.
- **Forma de datos [MEDIDO — E1]**: `useAccountsPayable` devuelve `data: UnifiedPayable[] | GroupedPayable[]` según `mode` y `error: string | null` (no `Error`); `StateRenderer` espera `error?: Error | null` → adaptación puntual `error ? new Error(error) : null` en el punto de uso, sin modificar el contrato del hook (integridad: contratos API intactos).
- **Riesgos**: vistas contables (cxp/cxc) — mitigado: el diff no toca handlers, cálculos, monedas ni redondeos; solo la capa de presentación de estados (verificación línea a línea en Fase E).

## Fase C — Plan
- Solución: envolver el contenido de cada vista en `<StateRenderer isLoading error onRetry data emptyComponent>` (patrón idéntico al consumidor canónico `InventoryView.tsx` L1102); default canónico para loading (`ViewLoadingSplash` "CARGANDO") y error (tarjeta destructiva con **Reintentar** funcional); empty contextual preservado (iconografía y mensajes originales de cada vista) vía `emptyComponent`; el branch `viewMode` (grouped/list) pasa a los `children` de StateRenderer.
- Criterios de aceptación: 1) las 2 vistas muestran los 4 estados canónicos (cargando/vacío/error/datos) — verificados a nivel E4 (render de componente; ver limitación E2); 2) saldo ESLint global no aumenta y 0 errores; 3) `tsc --noEmit` 0 errores; 4) `bun run test` (Vitest) verde; 5) sin diffs fuera de los archivos de la unidad; 6) informe + STATE.json.
- Archivos delimitados: `AccountsPayableView.tsx`, `AccountsReceivableView.tsx`, nuevo `src/__tests__/components/accounts-cxc-cxp-estados.test.tsx`. **NO se toca**: `PaymentModal.tsx` ni `PaymentHistoryRow.tsx` (efectos de pago/eliminación con llamadas financieras → fuera de U1), hooks, API routes.

## Fase D — Implementación
| Archivo | Cambio |
|---|---|
| `accounts_payable/AccountsPayableView.tsx` | +1 import `StateRenderer`; bloque `{error && …}` + ternario `loading ? texto : error ? null : …` → `<StateRenderer isLoading={loading} error={error ? new Error(error) : null} onRetry={refetch} data emptyComponent>` con branch grouped/list en children; eliminados los 2 empties internos (quedaron muertos al subir el empty al canon) con comentario de origen |
| `accounts_receivable/AccountsReceivableView.tsx` | +1 import; ternario de 4 ramas (spinner ad-hoc / error propio / empty propio / contenido) → `<StateRenderer onRetry={fetchData} data={filteredData} emptyComponent>` con branch grouped/list en children; el vacío contextual "Sin cobros pendientes" (CheckCircle2) se conserva como `emptyComponent` |
| `__tests__/components/accounts-cxc-cxp-estados.test.tsx` | NUEVO: 9 casos E4 (4 estados × 2 vistas + dualidad de datos del hook y cambio de modo) siguiendo las convenciones del repo (`vi.hoisted`, mock de `@/store` con `getState()`, mock de hijos con efectos de red) |

- Reutilización: cero componentes nuevos — se consume el canónico existente (`StateRenderer` + `ViewLoadingSplash` internos). Sin deuda nueva, sin dependencias, sin tocar `eslint.config.mjs`, sin markup fuera de la unidad.
- **Skills aplicadas (decisiones concretas)**:
  - `costpro-product-quality` §2 (origen común): un solo patrón de estados para ambas vistas del módulo en lugar de parchear cada estado suelto; §3 (tabla de datos): "estados vacío/cargando/error presentes" ahora cumplido con el canon; §5 (integridad financiera): diff verificado — cero cambios en handlers, monedas, redondeos o documentos.
  - `costpro-visual-qa` §1 (cadena de evidencias): cada afirmación etiquetada E1/E4; §5 (regla dura): el entorno no permite E2 → se declara explícitamente (abajo) en lugar de simularlo.
  - `costpro-frontend-engineering` §4 (arquitectura): componente transversal ya existente con ≥2 consumidores — no se creó abstracción nueva; §5 (gates de cierre): lint 0/0, Vitest verde, tsc 0; §7 anti-metas: no se "modernizó" nada ajeno (p. ej. el `confirm()` nativo detectado se REGISTRA para U2, no se toca aquí).
  - `costpro-code-reviewer`: revisión del diff completo línea a línea (sin lógica financiera alterada, sin `any` nuevo en producción, comentarios-id `CP-CI-006 U1` siguiendo el formato de comentarios-historia del repo).

## Fase E — QA (resultados literales)
- **E4 — `bunx eslint . -f json`**: ANTES (main@029d40165) **0 E / 1.624 W / 328 archivos** → DESPUÉS **0 E / 1.623 W / 328 archivos** (Δ = −1 W; 0 errores en ambos). Por archivo intervenido: `AccountsPayableView.tsx` 9W→9W, `AccountsReceivableView.tsx` 5W→4W, test nuevo 0W — **ningún archivo subió**.
- **E4 — Test nuevo** (`accounts-cxc-cxp-estados.test.tsx`): **9/9 PASS** — cargando (splash "CARGANDO", sin tabla), error (tarjeta canónica + `Reintentar` que invoca `refetch`/reintenta el fetch literalmente), vacío (mensajes contextuales), datos (agrupado y lista). 
- **E4 — `bun run test` (Vitest 4, suite completa)**: **exit 0 — Test Files 483 passed | 6 skipped (489) · Tests 6.574 passed | 95 skipped (6.669) · Duration 557,62 s** (BASELINE 6b: 461/6.315; el repo creció por merges del propietario; suite verde).
- **E4 — `bunx tsc --noEmit`**: **exit 0, 0 errores** (con `--skipLibCheck` y heap 3.072 MB; la primera tentativa con heap 6.144 MB fue OOM-killed en la sandbox de 4 GB — limitación de entorno, ver Limitaciones).
- **E4 — `bun run lint:a11y`**: **exit 2 — NO ejecutable** (preexistente, idéntico al ciclo 1): `could not find plugin "jsx-a11y"` — el script referencia un plugin que `eslint.config.mjs` no registra. Hallazgo de infraestructura (repetido).
- **E2 navegador (agent-browser)**: **NO ejecutado deliberadamente** — no hay credenciales de sesión en el entorno (`.env` del propietario con `ENABLE_DEV_BYPASS=false`) y la regla madre prohíbe usar producción CostproBD como banco de pruebas. Regla visual-qa §5 aplicada: se declara la auditoría como **E1+E4 con E2 no ejecutado**; la verificación en navegador real (light/dark) queda como observación para el propietario.
- **E2E (Playwright)**: no corresponde — no hay flujo de negocio afectado (solo presentación de estados); el entorno aislado no fue requerido.

## Fase F — Antes / después
- Métrica única: vistas del módulo cxc/cxp con los 4 estados canónicos **0/2 → 2/2**; saldo ESLint 1.624 → 1.623 W; +1 archivo de test (9 casos).
- Diff: 3 archivos, +262/−67 (incluye el test nuevo). Las vistas: cxp −16 líneas netas (eliminación de duplicación de estados), cxc −11.
- Sin evidencia visual E2 (no ejecutado, declarado) — certificada por métrica E4 + revisión de diff E1.

## Fase G — Git
- **Rama**: `feat/cp-ci-006-u1-canonical-states-20261124` (desde `main@029d40165` actualizado)
- **SHA**: código validado `65f7eb8ed2ca284ad895bb6c42bc75132d6f336a`; commit de cierre (STATE.json + este informe) encima
- **PR**: creado contra `main` — ver STATE.json→missions[CP-CI-006].pr. Autenticación: credenciales GitHub provistas por el propietario en el campo de contenido de esta ejecución, usadas **exclusivamente de forma efímera** (helper de credenciales por-invocación en el push — el PAT no queda en `.git/config` ni en URLs ni en commits, patches, STATE.json, informe ni este texto; el remote quedó en URL limpia tras el clon)
- **NUNCA merge** — el propietario revisa y aprueba.

## Certificación: APROBADA CON OBSERVACIONES
- Justificación objetiva: los criterios medibles se cumplen con evidencia literal (saldo −1 W / 0 errores; test nuevo 9/9; suite completa verde exit 0; tsc 0; diff confinado a la unidad; cero lógica financiera tocada). **Observaciones**: (1) la verificación E2 en navegador (light/dark) no fue ejecutable en este entorno — pendiente de mirada humana en una sesión con credenciales; (2) `confirm()` nativo en `handleBulkPay` (cxp) y `alert()` en errores de export/bulk-pay detectados → unidades U2/U3 de esta misma misión; (3) misión CP-CI-006 continúa por unidades (U1 cerrada; restantes: U2 confirmaciones destructivas, U3 feedback de acciones, U4 animaciones).

## Limitaciones y pendientes
1. **Vendor skills ausentes** (`ui-ux-pro-max`, `web-design-guidelines`, `react-best-practices`): gitignored, no instaladas en clon fresco; no requeridas para esta unidad — registrado como limitación.
2. **`lint:a11y` roto (preexistente, repetido del ciclo 1)**: plugin `jsx-a11y` no registrado en la flat config. Corregirlo exige tocar configuración global → prohibido en esta misión; pendiente de misión de infraestructura.
3. **`tsc --noEmit` OOM en sandbox 4 GB**: primera tentativa (heap 6.144 MB) fue OOM-killed (exit 137); segunda tentativa con `--skipLibCheck` y heap 3.072 MB completó con exit 0. El tamaño del proyecto (599 migraciones, ~8k archivos) excede la memoria disponible para un typecheck completo sin ajustes — candidato a misión de infraestructura (CI runner con más RAM o partición del typecheck).
4. **Suite Vitest muta el árbol (repetido del ciclo 1)**: `payrolls-pdf-evidence.test.ts` reescribe los 5 PDFs de `docs/audits/NOMINAS-PDF-CONF-20261121/evidencia/` en cada corrida (fechas/IDs no deterministas). Tras la suite quedaron modificados → restaurados a HEAD con `git checkout --` (ninguno commiteado). Hallazgo de infraestructura vigente: evidencia de auditoría no inmutable.
5. **Contradicción de fuentes [hallazgo de infraestructura, seguridad — repetido del ciclo 1]**: el campo de contenido del Schedule sigue incluyendo credenciales (GitHub PAT y variables de la app), mientras ENTRYPOINT/APÉNDICE y PROGRAM.md §9 establecen que el Schedule "NO contiene reglas, misiones ni credenciales". Gana PROGRAM.md: las credenciales NO se reprodujeron ni persistieron en ningún archivo del repo; se reitera al propietario **rotar las credenciales expuestas** y restaurar el campo de Schedule al texto mínimo del APÉNDICE.
6. **E2E no ejecutado**: sin flujo de negocio afectado; no aplica para esta unidad.

## Estado (post-cierre)
- STATE.json actualizado: `current_cycle` (número 3, queued), `cycles_completed: 2`, `last_run` (outcome/cycle_report), `missions[CP-CI-006]` (status `in_progress` — continúa por unidades; attempts 1; pr; certificate "APROBADA CON OBSERVACIONES"; notes), `git.last_validated_sha` (`65f7eb8ed…`), `next_recommended` (CP-CI-001 U2a, justificado con regla §3.4), `agent_lock` liberado (`locked=false`).
- Informe: `cycles/cycle-002-CP-CI-006.md` (este archivo).
- Sin secretos ni tokens en STATE.json ni en este informe.
