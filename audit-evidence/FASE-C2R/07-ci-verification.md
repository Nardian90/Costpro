# FASE C2R — 07 CI VERIFICATION (§18/§19) — GitHub API, solo lectura

Método: `~/scripts/fasec2r-ci-check.py` — GET a `api.github.com/repos/Nardian90/Costpro` (commits/{sha}/check-runs + actions/runs?head_sha={sha}). Token de lectura usado desde la config git local, nunca impreso ni registrado. Resultado crudo: `~/scripts/fasec2r-ci-results.json`.

## 1. CI del SHA FINAL `00a7c9a7` (el SHA auditado)

| Workflow / Job | Attempt | Conclusión | Nota |
|---|---|---|---|
| **CI — «TypeCheck + Lint + Unit Tests + Build»** | 1 | **completed: SUCCESS** | Incluye **BUILD PASS** en el SHA final |
| **Test Coverage — «Unit & Integration Tests»** | 1 | **completed: SUCCESS** | Suite completa verde en el SHA final |
| Test Coverage — «E2E Tests (Playwright)» | 1 | failure | **Tolerado**: `continue-on-error: true` preexistente del workflow; `git diff bbb74f4c..00a7c9a7 -- e2e/` = vacío (C2 no tocó specs E2E); el job corre contra supabase de prueba con datos vivos, no es criterio del gate |
| Security Audit / audit / Daily AI System Audit | 1 | SUCCESS | — |
| Run-level CI | 1 | cancelled | Cancelación operativa del RUN (actividad concurrente del propietario en el repo); los JOBS individuales quedaron `completed:success` — idéntico patrón ya documentado en C2 FINAL-REPORT §7 |

**Los resultados corresponden AL SHA auditado** — no se acepta CI de otro commit como evidencia del cierre: el job TypeCheck+Lint+Unit+Build y el job Unit&Integration pasan directamente sobre `00a7c9a7`.

## 2. CI del commit de código `ca3a019f` (referencia)

| Job | Attempt | Conclusión |
|---|---|---|
| TypeCheck + Lint + Unit Tests + Build | — | **SUCCESS** |
| Unit & Integration Tests | 2 (de Test Coverage) | **SUCCESS** (attempt 1 = flaky, ver §3) |
| E2E Tests (Playwright) | — | failure/cancelled tolerado (mismo `continue-on-error`; e2e/ intocado) |
| Security Audit / audit / Daily AI System Audit | — | SUCCESS |

## 3. FLAKY TEST INCIDENT (§19) — `sprint1.integration.test.ts` · `computeFullQuantReport`

| Pregunta | Verificación | Resultado |
|---|---|---|
| ¿El fallo inicial correspondía a código modificado por C2? | `git diff --stat bbb74f4c..00a7c9a7 -- src/services/pick3` → **vacío**; `git diff --stat bbb74f4c..00a7c9a7 -- '*sprint1*'` → **vacío**. Dominio pick3/backtest: 0 líneas tocadas por C2 | NO — ajeno a C2 |
| ¿El rerun corresponde al mismo commit? | Evidencia commiteada de C2 (05-tests §6): re-ejecución sobre `ca3a019f` exacto; API muestra Test Coverage attempt 2 = success para ese SHA | SÍ |
| ¿Resultado final exitoso? | attempt 2 SUCCESS (en `ca3a019f`) + suite completa SUCCESS attempt 1 en `00a7c9a7` | SÍ |
| ¿Existe un segundo fallo oculto? | En `00a7c9a7` (SHA final) Unit & Integration = SUCCESS en attempt 1 — sin fallo alguno oculto en el cierre | NO |

Clasificación: **flaky preexistente de entorno, NO introducido por C2** — la clasificación no se apoya solo en «luego pasa», sino en (a) diff vacío del dominio, (b) rerun del mismo commit verde, (c) SHA final verde en attempt 1.

## 4. Build local

La limitación OOM local (documentada desde FASE B/C0) queda **resuelta por CI**: Build SUCCESS en el SHA final. Nada que reclasificar.
