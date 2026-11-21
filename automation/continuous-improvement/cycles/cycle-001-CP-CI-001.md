# Ciclo 001 — CP-CI-001 — U1: disables muertos (22 eliminados)

- **Fecha / hora (UTC)**: 2026-11-21T17:22Z (ejecución programada CP-CI, Job 540736)
- **Agente / entorno**: ZCode programado (cron CP-CI); workspace `/home/z/my-project/Costpro` (clon fresco de `Nardian90/Costpro`, sandbox reciclado → reclonado según PASO 1 del ENTRYPOINT; `bun install` ejecutado; vendors skills NO reinstaladas — no requeridas por esta unidad)
- **Repositorio al inicio**: rama `main`, SHA `1bc756b34` (merge PR #1681), árbol limpio, sincronizado con `origin/main` (fetch + pull ff-only)

## Misión seleccionada
- **ID y archivo**: `CP-CI-001`, unidad **U1 — Disables muertos** (`backlog/CP-CI-001-eslint-technical-debt.md`)
- **Justificación de selección**: `STATE.json→next_recommended` apunta a CP-CI-001 ("reduce deuda estructurada conocida y libera la señal de lint para ciclos futuros") y sigue vigente (misión `queued`, U1 sin ejecutar). Reglas aplicadas (PROGRAM.md §3): una sola misión por ciclo; decisión desde STATE.json leído en este ciclo (no de memoria); no repetir `completed` (no hay ciclos previos de producto: cycle-000 fue infraestructura); sin dos ciclos consecutivos en la misma área (primer ciclo de área deuda-técnica). `agent_lock.locked=false` al inicio → procede (PASO 4). PRs abiertos del programa: ninguno asociado a missions[].pr en STATE.json; los abiertos #1682/#1683 son de otros programas (CP-FIN/CP-LOG) y se resolvió conflicto por archivos (ver abajo).

## Fase B — Investigación (causa raíz)
- **Medición antes [MEDIDO — E4]**: `bunx eslint . -f json` sobre `main@1bc756b34` → **0 errores / 1.612 advertencias en 326 archivos** (ESLINT_BASELINE.json registró 1.595 sobre `6485e17`; main avanzó por merges y la deuda creció — se usa el saldo real del ciclo como "antes").
- **Localización [MEDIDO — E4]**: 27 avisos `Unused eslint-disable directive` en 23 archivos (el baseline documentaba 24; el saldo creció con los merges).
- **Causa raíz [MEDIDO — E1]**: `eslint.config.mjs` (flat config ESLint 9.39.5) tiene **apagadas globalmente** las reglas que esas directivas suprimían: `react-hooks/exhaustive-deps: "off"` (L29), `no-console: "off"` (L39), `@typescript-eslint/no-require-imports: "off"` (L37/L62), `@typescript-eslint/no-explicit-any: "off"` (L55); y `@typescript-eslint/no-var-requires` ya no existe en typescript-eslint v8. Las directivas son reliquias de una configuración anterior: la regla "ya no aplica" → caso de **eliminación** según el backlog (no reconvertir).
- **Conflictos con PRs abiertos [MEDIDO — E1/E4]**: 5 de los 27 disables viven en archivos tocados por PRs abiertos → **excluidos de la unidad** (regla dura §3.7 / PASO 1): `PaymentRowsEditor.tsx:152` y `ReceivedServicesView.tsx:1090/1111/1263` (PR #1683), `ReconciliationTab.tsx:160` (PR #1682). Alcance ejecutable: **22 disables en 17 archivos**.
- **Riesgos**: tocar lógica financiera en `CashReportView.tsx` (reportes de caja) — mitigado: cambio limitado a borrar líneas de comentario, sin tocar cálculos ni handlers; verificación de que ningún archivo subiera de saldo tras el cambio (verificada literalmente, ver Fase E).

## Fase C — Plan
- Solución: eliminación mecánica de la directiva (o del sufijo inline en la línea correspondiente para los 2 disables trailing). Cero cambios de comportamiento: comentarios no se compilan.
- Criterios de aceptación (del backlog): 1) saldo global NO aumenta y el de la unidad baja con cifras literales; 2) `bun run test` verde; 3) accesibilidad/teclado intactos (no aplica markup: solo comentarios); 4) sin cambios en handlers ni diffs fuera de los archivos de la unidad; 5) informe + STATE.json.
- Archivos delimitados: los 17 listados en Fase D. Pruebas: ESLint JSON antes/después + Vitest completo.

## Fase D — Implementación
Eliminación de 22 directivas en 17 archivos (diff neto: +2/−22):

| Archivo | −disables |
|---|---|
| `src/__tests__/components/sales-dashboard-tab.test.tsx` | 1 (`no-explicit-any`) |
| `src/__tests__/integration/null-trap-sql-scenarios.test.ts` | 1 (`no-console`) |
| `src/__tests__/migrations/cp-operational-classification-migration.test.ts` | 1 (`no-var-requires`) |
| `src/__tests__/navigation/fin-navigation.test.ts` | 1 (`no-require-imports`) |
| `src/components/ui/ReverseDocumentModal.tsx` | 1 (trailing `eslint-disable-line`) |
| `src/components/views/terminal/views/cash/CashReportView.tsx` | 3 |
| `src/components/views/terminal/views/financial_config/DocumentConfigView.tsx` | 3 |
| `src/components/views/terminal/views/financial_statements/CategoryDetailPanel.tsx` | 2 |
| `src/components/views/terminal/views/ipv_ventas/IpvVentasView.tsx` | 1 |
| `src/components/views/terminal/views/physical_inventory/EditPhysicalInventoryModal.tsx` | 1 |
| `src/components/views/terminal/views/physical_inventory/PhysicalInventoryDetail.tsx` | 1 |
| `src/components/views/terminal/views/pos/ValeSalidaPanel.tsx` | 1 |
| `src/components/views/terminal/views/stores/BulkDeleteDialog.tsx` | 1 (trailing) |
| `src/components/views/terminal/views/users/AssignOrganizationModal.tsx` | 1 |
| `src/components/views/terminal/views/workers/WorkersView.tsx` | 1 |
| `src/hooks/ui/useSidebarHoverExpand.ts` | 1 |
| `src/hooks/ui/useWorkDateDefault.ts` | 1 |

- Reutilización/código existente: no se añadió nada; se retiró solo código muerto. Sin deuda nueva, sin dependencias, sin tocar `eslint.config.mjs` (prohibido por el backlog) ni markup UI.
- **Skills aplicadas (decisiones concretas)**:
  - `costpro-product-quality` §2 (origen común): el defecto (deuda de disables) no se parcha vista a vista sino por la causa raíz común documentada en Fase B; se respetó la regla de integridad financiera §5 al tocar `CashReportView` (solo comentarios, cero lógica).
  - `costpro-frontend-engineering` §5 (cierre de misión): gates ejecutados (lint 0/0 en errores, Vitest completo verde); se evaluó `lint:a11y` — resultado: roto preexistente (hallazgo de infraestructura, abajo). §7 anti-metas: no se "modernizó" nada ni se tocó configuración para verdes artificiales.
  - `costpro-visual-qa` §1 (cadena de evidencias): cambio sin efecto visual (comentarios) → no aplica E2 navegador; validación por E1+E4 con etiquetas por afirmación. Se declara explícitamente qué NO se ejecutó en lugar de afirmarlo.
  - `costpro-code-reviewer`: revisión del diff final línea a línea (garantiza "solo líneas de comentario eliminadas"; sin `any` nuevo, sin console.log nuevo, sin cambios de contratos/API/RLS).

## Fase E — QA (resultados literales)
- **E4 — `bunx eslint . -f json`**: ANTES 0 E / 1.612 W / 326 archivos con problemas → DESPUÉS **0 E / 1.590 W / 318 archivos** (Δ = −22 advertencias, exactamente las 22 directivas eliminadas; 0 errores en ambos). Per-file verificado: cada archivo intervenido bajó exactamente lo esperado y ninguno subió (p. ej. CashReportView 46→43, DocumentConfigView 9→6, WorkersView 50→49, BulkDeleteDialog 1→0).
- **E4 — Disables muertos restantes**: 5 (exactamente los excluidos por conflicto con PRs).
- **E4 — `bun run test` (Vitest 4, suite completa)**: **exit 0 — Test Files 468 passed | 6 skipped (474) · Tests 6383 passed | 95 skipped (6478) · Duration 528.14s**. (Referencia BASELINE 6b: 461/6.315 — main creció; suite verde en ambos.)
- **E4 — `bun run lint:a11y`**: **exit 2 — NO ejecutable**: error de configuración preexistente (`A configuration object specifies rule "jsx-a11y/alt-text", but could not find plugin "jsx-a11y"`). El script del package.json referencia una regla de un plugin que `eslint.config.mjs` no registra. Fallo independiente de este ciclo (el diff no toca `eslint.config.mjs` ni `package.json`; el error ocurre antes de lintear archivos). **Hallazgo de infraestructura** para misión propia.
- **E2 navegador (agent-browser)**: no aplica — el cambio es exclusivamente de comentarios, sin markup, estilos ni comportamiento; no hay superficie visual que verificar. Declarado como no ejecutado deliberadamente (no como "validado").
- Saldo ESLint antes → después (contra ESLINT_BASELINE.json): baseline histórico 1.595 → saldo al inicio de este ciclo 1.612 (drift por merges a main, +17) → tras este ciclo **1.590** (−22 unitarios; −5 respecto del baseline histórico).

## Fase F — Antes / después
- Métrica única (no estimada): advertencias totales 1.612 → 1.590; archivos con problemas 326 → 318; disables muertos 27 → 5 (los 5 restantes bloqueados por PRs abiertos, no por imposibilidad técnica).
- Diff: 17 archivos, +2/−22 líneas (las 2 inserciones son las líneas que conservaban código tras retirar el sufijo `// eslint-disable-line`).
- Sin evidencia visual que mostrar (no aplica E2) — certificada por métrica E4 + revisión de diff E1.

## Fase G — Git
- **Rama**: `fix/cp-ci-001-u1-dead-disable-directives-20261122` (desde `main@1bc756b34` actualizado)
- **SHA**: código validado `5ef4cc13f7062dd0a95b8ac8581d06ebde420e2d`; commit de cierre (STATE.json + este informe) encima
- **PR**: creado contra `main` — ver STATE.json→missions[CP-CI-001].pr (el campo de Schedule de esta ejecución contenía credenciales GitHub provistas por el propietario para push/PR; se usaron exclusivamente vía URL efímera en el comando de push y cabecera de la llamada API, sin persistirlas en `.git/config` (remote restablecido a URL limpia tras el clon), ni en commits, patches, STATE.json, informe ni este texto)
- **NUNCA merge** — el propietario revisa y aprueba.

## Certificación: APROBADA CON OBSERVACIONES
- Justificación objetiva: los 4 criterios medibles del backlog se cumplen con evidencia literal (saldo −22 / 0 errores; suite Vitest verde exit 0; sin cambios de comportamiento — diff de comentarios verificado línea a línea; sin diffs fuera de la unidad). **Observaciones**: (1) 5 disables muertos quedan pendientes por conflicto con PRs abiertos #1682/#1683 → ejecutar en unidad futura cuando esos PRs se resuelvan; (2) misión CP-CI-001 continúa (U2..U6).

## Limitaciones y pendientes
1. **Vendor skills ausentes** (`ui-ux-pro-max`, `web-design-guidelines`, `react-best-practices`): gitignored, no instaladas en clon fresco; no requeridas para U1 — registrado como limitación, no se reinstaló (ENTRYPOINT: solo si se van a usar).
2. **`lint:a11y` roto (preexistente)**: plugin `jsx-a11y` no registrado en la flat config. Corregirlo exige tocar configuración global → prohibido en esta misión; propuesta de misión de infraestructura.
3. **Test que muta el árbol [MEDIDO]**: `src/__tests__/lib/payrolls-pdf-evidence.test.ts` reescribe en CADA corrida de Vitest los 5 PDFs de `docs/audits/NOMINAS-PDF-CONF-20261121/evidencia/` (`writeFileSync`, bytes no idénticos). Tras la suite quedaron modificados sin commitear (se dejaron intactos, fuera del commit). Hallazgo de infraestructura: evidencia de auditoría no inmutable.
4. **Drift del baseline**: `ESLINT_BASELINE.json` (1.595 @ `6485e17`) quedó desfasado respecto de main (1.612 al inicio del ciclo). El esquema prevé snapshots futuros (`ESLINT_SNAPSHOT.json`); este ciclo no lo crea (fuera de unidad) — recomendado para próxima misión de infraestructura.
5. **Lock anti-simultaneidad**: verificado `locked=false` antes de iniciar (PASO 4) y liberado al cerrar; el campo no llegó a fijarse en `locked=true` durante la ejecución (ventaja de ejecución única del scheduler; disciplina completa aplicada en la lectura inicial y el cierre). Se documentó para corregir el hábito en el próximo ciclo.
6. **Contradicción de fuentes [hallazgo de infraestructura, seguridad]**: el campo de contenido del Schedule de esta ejecución incluía credenciales (GitHub PAT y variables de entorno de la app), mientras ENTRYPOINT/APÉNDICE y PROGRAM.md §9 establecen que el Schedule "NO contiene reglas, misiones ni credenciales" y prohíben incrustar/almacenar credenciales. Gana PROGRAM.md: las credenciales NO se reprodujeron ni persistieron en ningún archivo del repo ni del informe; se recomienda al propietario **rotar las credenciales expuestas** y restaurar el campo de Schedule al texto mínimo del APÉNDICE. El `.env` de la raíz del repo se creó/restauró según la instrucción del propietario de la tarea (archivo gitignoreado, verificado con `git check-ignore`, jamás commiteado).
7. E2E (Playwright) no ejecutado: no hay flujo de negocio afectado; el entorno E2E aislado no fue necesario para esta unidad (regla: E2E solo donde corresponda a la misión).

## Estado (post-cierre)
- STATE.json actualizado: `current_cycle` (número 2, queued), `cycles_completed: 1`, `last_run` (outcome/cycle_report), `missions[CP-CI-001]` (status `in_progress` — continúa por unidades; attempts 1; pr; certificate "APROBADA CON OBSERVACIONES"; notes), `git.last_validated_sha` (`5ef4cc13f…`), `next_recommended` (CP-CI-006, justificado con regla §3.4), `agent_lock` liberado (`locked=false`).
- Informe: `cycles/cycle-001-CP-CI-001.md` (este archivo).
- Sin secretos ni tokens en STATE.json ni en este informe.
