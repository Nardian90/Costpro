# Ciclo 000 — CP-CI-INFRASTRUCTURE-REFACTOR-001 — Centralización del programa en SCHEDULER_ENTRYPOINT.txt
- **Fecha / hora (UTC)**: 2026-11-21, 04:23–04:35 UTC
- **Agente / entorno**: ZCode (sesión de infraestructura CP-CI; workspace /home/z/my-project/Costpro; publicación autorizada explícitamente por el propietario en esta sesión)
- **Repositorio al inicio**: rama `feat/cp-ci-infra-001-20261121` @ `068618d` (local); `origin/main` @ `dcbe9ed`; árbol limpio. PRs del programa abiertos sin fusionar: #1676 (skills/AGENTS.md — foundation) y #1677 (automation/ v1).

## Misión seleccionada
- Misión de **infraestructura** instruida directamente por el propietario (no proviene del backlog de producto): centralizar el programa CP-CI para que el campo de contenido de Z.ai Schedule contenga **solo la referencia a `SCHEDULER_ENTRYPOINT.txt`** y toda la lógica operativa resida en ese archivo. **Justificación**: el TXT v1 no era autosuficiente (dependía de PROGRAM.md para operar), el fallback de credenciales era ambiguo, y el propietario exige no volver a editar el mensaje de Schedule. Reglas aplicadas: una misión por ejecución; no inventar oportunidades; documentar decisiones (PROGRAM.md §jerarquía v1.1).

## Fase B — Investigación (causa raíz)
- Auditoría completa de `automation/continuous-improvement/` (14 archivos) y de AGENTS.md/skills. **Inconsistencias resueltas (7, documentadas)**: (1) TXT no autosuficiente; (2) riesgo de doble fuente de verdad TXT↔PROGRAM; (3) fallback de credenciales ambiguo (mencionaba token en URL); (4) E2E sin restricción explícita de destino; (5) PR vacío no prohibido; (6) skills ausentes en ramas pre-fusión sin regla de actuación; (7) Vercel/Supabase sin delimitar.
- Mecanismos reales verificados en el repo: guard de aislamiento `e2e/fixtures/assert-isolated-db.ts` (CP-INFRA-011, fail-closed; ref producción `wthkddeleylijmonclxg` prohibida), guard de residuos `e2e/fixtures/hard-cleanup.ts` (`countE2EResiduals` net zero en teardown), regla `docs/OPERATIONS/REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md`, evidencias E1–E4 en `skills/costpro-visual-qa/SKILL.md` §1 (rama foundation, PR #1676).
- Entorno: `gh` CLI no instalado; sin credential helper; por política v2 no se reutilizan credenciales expuestas en conversaciones/adjuntos anteriores. El propietario autorizó explícitamente el uso de sus credenciales para publicar y fusionar en esta sesión de cierre.

## Fase C — Plan
- `SCHEDULER_ENTRYPOINT.txt` v2 (cerebro operativo autosuficiente: jerarquía de fuentes + 9 pasos + apéndice del disparador mínimo), `SCHEDULE_FIELD.txt` (texto exacto del campo de Schedule), `PROGRAM.md` v1.1 (jerarquía + políticas E2E/credenciales/sin-PR-vacío). Criterios de aceptación: validador ≥70 comprobaciones OK/0 errores; simulación solo-lectura del ciclo 1; cero secretos; diff limitado a infraestructura.

## Fase D — Implementación
- `SCHEDULER_ENTRYPOINT.txt`: reescritura completa (v2). `SCHEDULE_FIELD.txt`: nuevo. `PROGRAM.md`: 4 ediciones (cabecera v1.1 + jerarquía; §6E destino E2E con guards; §6G credenciales y sin PR vacío; §9 seguridad ampliada). STATE.json y BASELINE.md intactos.
- Skills aplicadas (cómo influyeron, no solo nombre): `costpro-product-quality` — regla de origen común para definir la jerarquía de fuentes sin duplicar verdad (el TXT condensa y referencia, PROGRAM manda); `costpro-visual-qa` — los niveles E1–E4 quedaron incorporados operativamente en la FASE E del TXT con sus criterios de validación; `costpro-frontend-engineering` — gates de cierre con comandos reales del repo (`bun run lint/test/test:e2e`, `lint:a11y`, `gate:bundle`) en lugar de instrucciones genéricas.

## Fase E — QA (resultados literales)
- `python3 -I scripts/validate_ci_infra_v2.py` → **VALIDACIÓN COMPLETA — 78 comprobaciones OK, 0 errores** [E4: validador versionado]. Incluye: autosuficiencia del TXT (30 elementos exigidos), consistencia TXT↔PROGRAM, rutas existentes, STATE.json íntegro, **sin secretos (regex `ghp_`/`github_pat_`/`sb_secret_`/`sbp_` = 0 en todos los archivos y patches)**.
- Simulación solo-lectura del ciclo 1 → agente nuevo encuentra los 4 documentos, identifica skills, lock libre, sin hallazgos P1/P2 activos, selecciona **CP-CI-001** por `next_recommended`, documenta y DETENTE; nada modificado [E1].
- Saldo ESLint antes→después: no aplica (la misión no toca `src/`; 0 archivos de aplicación). E2/E3 no proceden (sin UI ni flujo de negocio afectado).

## Fase F — Antes / después
- **Antes**: Schedule contenía un prompt con reglas operativas; TXT v1 de 12 pasos dependía de PROGRAM.md; sin política explícita de destino E2E ni de credenciales; PR vacío posible.
- **Después**: el campo de Schedule pasa a una referencia de 4 líneas (`SCHEDULE_FIELD.txt`); TXT v2 autosuficiente (jerarquía de fuentes, 9 pasos, A–H, E1–E4, 7 condiciones de terminación); E2E exclusivamente CostproE2E/local con verificación previa de ambos guards; credenciales solo vía `gh` preautenticado/OAuth y jamás en artefactos; revisión sin cambios → informe sin PR.

## Fase G — Git
- Rama `refactor/cp-ci-infrastructure-refactor-001-20261121` desde `feat/cp-ci-infra-001-20261121`. Commits: `aefc5ff` (fase 1 — ENTRYPOINT v2 + SCHEDULE_FIELD), `d2f112e` (fase 2 — PROGRAM v1.1), fase 3 = este informe. **PR: https://github.com/Nardian90/Costpro/pull/1680** (base `feat/cp-ci-infra-001-20261121`; retarget a `main` tras fusionar #1677). Publicación y merges con autorización explícita del propietario; token usado de forma transitoria (variable de entorno), sin almacenarse en ningún archivo. **Orden de fusión documentado: #1676 → #1677 → #1680.** Merge final ejecutado por el propietario (autorización de esta sesión); el programa mantiene "NUNCA merge" para los ciclos automatizados de producto.

## Certificación: APROBADA
- Evidencias objetivas: validador 78/0; simulación sin cambios; diff limitado a 3 archivos de infraestructura (+273/−105) más este informe; cero secretos; PRs publicados y fusionados en el orden documentado.

## Limitaciones y pendientes
- E2E no ejecutado en esta misión (no procede: sin cambios de aplicación); su verificación previa queda como requisito operativo de las misiones futuras (FASE E del TXT v2).
- Pendiente del propietario: pegar el texto de `SCHEDULE_FIELD.txt` en el job de Z.ai Schedule (una sola vez).
- Recomendación de seguridad: rotar el token PAT empleado, ya que circuló por adjuntos/conversaciones; la política v2 del programa ya prohíbe su reutilización futura.

## Estado (post-cierre)
- STATE.json y BASELINE.md: **intactos por decisión** (este es un ciclo de infraestructura: no incrementa `cycles_completed` ni consume `next_recommended`). `agent_lock` liberado (no se activó). Próximo ciclo de producto: `cycle-001` → **CP-CI-001** (ESLint, deuda técnica — `next_recommended` vigente). Schedule = disparador; ENTRYPOINT v2 = cerebro operativo; PROGRAM v1.1 = método; backlog = misiones.
