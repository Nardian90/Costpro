# PROGRAM.md — Programa de Mejora Continua de COSTPRO (CP-CI)

**Documento rector — versión 1.1 (2026-11-21; v1.0 misión CP-CONTINUOUS-IMPROVEMENT-001, v1.1 refactor CP-CI-INFRASTRUCTURE-REFACTOR-001).** Referencia estable del sistema. Cualquier cambio aquí requiere misión propia documentada. El registro operativo vivo vive en `STATE.json`; el cerebro operativo de cada ejecución es `SCHEDULER_ENTRYPOINT.txt` (v2), cuyo campo de Schedule contiene solo la referencia a ese archivo.

**Jerarquía de fuentes (decisión de la refactor v1.1, sin dos verdades):** `PROGRAM.md` es NORMATIVO (método, prioridades, políticas, seguridad); `SCHEDULER_ENTRYPOINT.txt` es OPERATIVO (pasos del ciclo; puede condensar reglas, sin alterarlas); `backlog/` define misiones; `STATE.json` conserva la memoria. Si el ENTRYPOINT y este documento contradicen: **gana PROGRAM.md**, se ejecuta según él y la inconsistencia se registra en el informe del ciclo como hallazgo de infraestructura para corregirse en una misión de infraestructura propia.

## 1. Objetivo

Que cada ciclo programado deje COSTPRO técnicamente mejor, visualmente más consistente, funcionalmente más fiable y más cerca de un SaaS profesional — mediante misiones pequeñas, verificables y con Pull Request. Se trabaja sobre 14 áreas: calidad de código, arquitectura frontend, consistencia del design system, calidad de componentes, UX, accesibilidad, responsive, microinteracciones, rendimiento, seguridad, integridad financiera/contable, fiabilidad funcional, calidad de reportes/documentos y prevención de regresiones.

## 2. Filosofía

- **Mejora real, no cosmética**: nada de cambios por preferencia subjetiva ni rediseños continuos. Referencia de calidad: plataformas como Linear, Stripe y Vercel (criterios profesionales, NO sus interfaces ni elementos que contradigan la identidad de COSTPRO).
- **Progresiva y medible**: unidades pequeñas, antes/después cuando exista métrica, etiquetas [MEDIDO]/[ESTIMADO]/[INFERIDO] (AGENTS.md).
- **Basada en evidencias**: ninguna certificación por criterio subjetivo del agente (ver §8).
- **Con memoria**: el estado vive en `STATE.json` y los informes en `cycles/`; ninguna decisión depende de recordar conversaciones pasadas.
- **Con control humano**: nunca merge, nunca despliegue, nunca migraciones: decide el propietario.

## 3. Prioridades de selección (orden de evaluación)

1. **P1 — Crítico**: seguridad, aislamiento multi-tenant, integridad financiera/contable, corrupción de datos.
2. **P2 — Errores funcionales**: afectan funciones existentes o pueden provocar pérdida de información.
3. **P3 — UX/Accesibilidad/Fiabilidad**: problemas importantes de experiencia, accesibilidad y fiabilidad.
4. **P4 — Consistencia**: design system y responsive.
5. **P5 — Deuda técnica**: calidad de componentes y advertencias ESLint.
6. **P6 — Rendimiento/mantenibilidad**: optimizaciones y refactor que no afecta comportamiento.

Las prioridades pueden ajustarse SOLO con evidencia documentada en la misión correspondiente.

### Reglas de selección

1. **Una sola misión por ciclo.** 2. Consultar `STATE.json` antes de seleccionar (nunca desde memoria). 3. No repetir misiones `completed` salvo evidencia nueva. 4. No trabajar dos ciclos consecutivos en la misma área si existen otras de importancia comparable. 5. Los hallazgos críticos nuevos (P1/P2) se convierten en misión inmediata (crear archivo en `backlog/` con prefijo `CP-CI-0xx` nuevo y estado `queued`). 6. Misiones grandes → dividir en archivos independientes de backlog. 7. Dos ejecuciones nunca modifican simultáneamente los mismos archivos (ver lock en §7/ENTRYPOINT). 8. **No crear tareas artificiales para "mantener ocupado" al agente**: si no hay oportunidad justificada, registrar el ciclo como revisión sin cambios (`cycles/` con `certificate: "APROBADA — revisión sin cambios necesarios"`), sin incrementar misiones completadas.

## 4. Backlog

Cada archivo `backlog/CP-CI-0XX-*.md` es una misión autocontenida: objetivo, criterios de entrada, límites de alcance (qué NO tocar), procedimiento, pruebas y criterios de aceptación. El backlog inicial (CP-CI-001..008) cubre áreas; las misiones específicas nacen de hallazgos reales (p. ej. BASELINE/ESLINT_BASELINE). Una misión nueva puede nacer en cualquier ciclo; debe registrarse en `STATE.json` al crearse.

## 5. Uso obligatorio de skills (por ciclo)

Antes de ejecutar: leer `AGENTS.md` + `costpro-product-quality` + su referencia `references/costpro-design-system.md` + `costpro-visual-qa` + `costpro-frontend-engineering`, y las skills pertinentes a la misión (code-reviewer, security-auditor, mobile-first-auditor, sql-performance-optimizer; vendors: web-design-guidelines, react-best-practices, ui-ux-pro-max). Su aplicación debe ser demostrable en decisiones concretas del informe (validar que la mejora resuelve un problema real; reutilizar el sistema visual existente; respetar patrones canónicos; obtener evidencias verificables). Mencionar nombres sin aplicarlos NO cuenta.

## 6. Procedimiento de cada ciclo (fases A–H)

- **A — Diagnóstico**: repo, estado Git (fetch + status), skills, alcance, comprobar que no hay otra ejecución pendiente incompatible (lock + PRs abiertos del programa).
- **B — Investigación**: localizar archivos, causa raíz, dependencias, componentes afectados, riesgos.
- **C — Plan**: solución, criterios de aceptación, pruebas, archivos y funcionalidades delimitados.
- **D — Implementación**: solo cambios necesarios; reutilizar código existente; sin duplicar lógica; sin deuda adicional; sin tocar funcionalidades ajenas.
- **E — QA**: ejecutar solo las pruebas pertinentes con los comandos EXISTENTES del repo (`bun run lint` 0/0 objetivo en archivos intervenidos, `bun run test` Vitest, `bun run test:e2e` specs de zona, `lint:a11y`, `test:security`, `gate:bundle`, axe, verificación visual E2). **No afirmar que una prueba pasó si no se ejecutó correctamente** — niveles E1–E4 de costpro-visual-qa. **Destino de las pruebas E2E (v1.1): EXCLUSIVAMENTE el entorno aislado CostproE2E o Supabase local — nunca producción (regla `docs/OPERATIONS/REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md`). Antes de cualquier E2E, verificar aislamiento con el guard `e2e/fixtures/assert-isolated-db.ts` (CP-INFRA-011, fail-closed; `E2E_ALLOWED_REMOTE_REF` ≠ ref de producción `wthkddeleylijmonclxg`) y el guard de residuos `e2e/fixtures/hard-cleanup.ts` (hard delete del tenant del run + `countE2EResiduals` net zero en teardown).**
- **F — Evidencias**: problema inicial, causa raíz, solución, archivos, antes/después, resultados de pruebas, limitaciones → informe en `cycles/`.
- **G — Git**: rama específica por misión `feat|fix/cp-ci-0XX-<slug>-YYYYMMDD` desde base actualizada; commits descriptivos; **Push + PR** (título `fix|feat(ci): CP-CI-0XX — <resumen>`; body con evidencias). Sin credenciales: commits locales + `git format-patch` + documento de la limitación. **No simular un PR.** Autenticación GitHub (v1.1): SOLO GitHub CLI previamente autenticado (`gh`) o credencial OAuth provista por el entorno; PROHIBIDO recuperar/reutilizar credenciales expuestas en conversaciones o adjuntos anteriores, y PROHIBIDO incrustar o almacenar credenciales en TXT, prompts, STATE.json, informes, commits, patches o URLs. Si la revisión del ciclo concluye "sin cambios necesarios": informe sí, rama y PR NO (nunca un PR vacío).
- **H — Cierre**: actualizar `STATE.json` (§7) y escribir el informe del ciclo en `cycles/` (un informe por ejecución, formato en `cycles/README.md`).

## 7. STATE.json — reglas de actualización (esquema estable)

Estados permitidos por misión: `queued`, `in_progress`, `completed`, `blocked`, `rejected`. Reglas duras:

1. Una misión fallida **NO** se marca `completed`; pasa a `blocked` (con causa) o `rejected` (si se demostró que no debía hacerse), y queda en el registro para siempre.
2. Un ciclo bloqueado **no desaparece del backlog** y no incrementa `cycles_completed`.
3. `cycles_completed` solo sube con una ejecución satisfactoria (misión `completed` + certificación).
4. Al iniciar una misión: `status=in_progress`, `current_cycle.n`, `current_mission.id`, `started_at`, `agent_lock` (ver abajo). Al cerrar: `completed_at`, `pr.url`, `last_validated_sha`, `certificate`, y `current_mission=null`.
5. **Evitar ejecuciones simultáneas**: antes de empezar, el agente comprueba/crea el lock `agent_lock` (campo con `locked_at` + `locked_by`); si existe un lock con fecha <24h que no es el suyo y no hay informe de ciclo correspondiente, el ciclo se detiene como `blocked` sin modificar nada. El lock se libera SIEMPRE al cerrar (éxito o bloqueo).
6. `next_recommended` mantiene la siguiente misión recomendada y su justificación, para que el siguiente ciclo no parta de cero.

## 8. Certificación y criterios de calidad

Cada misión termina en UNO de: **APROBADA / APROBADA CON OBSERVACIONES / RECHAZADA / BLOQUEADA**. Reglas: una mejora visual no se certifica si rompe funcionalidad; una mejora técnica no se certifica si degrada accesibilidad o UX; una mejora de rendimiento no se certifica solo porque "parece más optimizado" (requiere medición antes/después); los cambios financieros requieren pruebas de integridad específicas; y ningún ciclo se certifica solo con el criterio subjetivo del agente — exige evidencias E2/E3/E4 de costpro-visual-qa y los gates de costpro-frontend-engineering.

### Política de deuda técnica ESLint (control incremental)

- Ningún ciclo introduce advertencias nuevas sin justificación; las existentes no pueden aumentar como consecuencia de los cambios.
- Priorizar reducir advertencias en los archivos intervenidos; corregir causas comunes de forma estructural.
- **Prohibido**: `eslint-disable` masivo, desactivar reglas para mejorar métricas, cambiar la configuración global para ocultar problemas, o modificar reglas sin justificación documentada.
- Cada ciclo registra el saldo antes/después contra `ESLINT_BASELINE.json` (y su snapshot vigente). Contexto real del baseline (21-nov-2026, sha `6485e17`): **0 errores / 1595 advertencias**; 1571 (98,5%) son la política deliberada `no-restricted-syntax` "V2.12.25" (migración incremental de `<button>` crudo a `<Button>`) y 24 son directivas `eslint-disable` sin uso. La deuda es un backlog estructurado — se ataca en unidades pequeñas (ver `backlog/CP-CI-001`), no bloqueando la plataforma.
- Si el saldo crece en miles, dividir en unidades identificables y revisables.

## 9. Restricciones de seguridad (innegociables)

No modificar datos de producción (ver AGENTS.md: guard `assert-not-production`, producción no es banco de pruebas; E2E exclusivamente contra CostproE2E o local con los guards de aislamiento y de residuos verificados — §6E); no ejecutar migraciones de producción; no alterar registros financieros históricos; no modificar políticas RLS sin misión específica justificada; no exponer secretos ni commitear credenciales (los tokens viven fuera del repo y NUNCA en `STATE.json`, informes, prompts, patches o URLs; autenticación GitHub solo vía `gh` preautenticado u OAuth del entorno; prohibido reutilizar credenciales expuestas en conversaciones o adjuntos anteriores); no ejecutar despliegues (Vercel no forma parte de este programa); Supabase solo cuando la misión lo justifique con configuración segura; **no hacer merge** (el propietario revisa y aprueba); no modificar configuraciones de seguridad para conseguir verdes artificiales; no trabajar sobre ramas ajenas sin autorización; no sobrescribir cambios del propietario. En módulos financieros/contables, prohibido modificar reglas (fórmulas de costos, valoración de inventarios, cálculos de ventas, caja, contabilidad, redondeos Decimal.js, moneda, comisiones, documentos comerciales) — lista completa en AGENTS.md; si una mejora las requiere, separar propuesta de implementación. Si existe un PR automatizado anterior abierto: NO iniciar otra misión independiente hasta determinar su situación (mergeado, cerrado o pendiente de revisión) y evitar conflictos — el ENTRYPOINT lo comprueba en FASE A.
