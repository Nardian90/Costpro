# COSTPRO-E2E-REACTIVATION-001 — Reactivación segura del E2E (CostproE2E)

**Misión:** `COSTPRO-E2E-REACTIVATION-001` · **Fecha:** 2026-11-03 · **Rama candidata:** `ci/reactivate-costpro-e2e-safe`

---

## 1. Resumen ejecutivo

_(se completa al cierre — veredicto, corridas, PR)_

## 2. Estado inicial del E2E

Inventario verificado sobre `origin/main` (`806e66e09`, PR #1542 integrado):

| Elemento | Estado al inicio de la misión |
| --- | --- |
| Specs E2E | 61 archivos `.spec.ts` en `e2e/` |
| Tests declarados (grep `test(`) | 463 |
| Skips/fixme/todo declarados | 153 (condicionales a entorno, mayoritarios) |
| Proyectos Playwright | `core` (siempre) + `creation` (solo con `E2E_ALLOW_CREATION=1` + `E2E_ISOLATION=1`) |
| Ejecución | `workers: 1`, `fullyParallel: false` (Supabase real no es paralelo-safe) |
| `retries` en config | `CI ? 1 : 0` — el workflow aislado fuerza `--retries=0` |
| Workflows | `ci.yml`, `e2e-isolated.yml`, `test-coverage.yml`, `daily-audit.yml`, `security-gate.yml`, `sql-security-gate.yml`, `exchange-rates-capture.yml` |

El job `e2e` de `ci.yml` (environment `e2e`, el E2E **antiguo**) está deshabilitado con `if: false` y además usa `continue-on-error: true` (defecto heredado: habría ocultado fallos). El job equivalente en `test-coverage.yml` está igualmente congelado con `if: false`. Ambos bloques se dejaron **intactos** (el propio código fuente los declara bloques del propietario que no deben eliminarse).

## 3. Análisis del historial reciente de commits

Cifra declarada por el propietario: ~196 commits en 8 días. Verificación contra Git real:

- Rango medido: `--since="2026-10-25 00:00"` (UTC) sobre `origin/main`.
- **Resultado: 211 commits** (mínimo 210 en la ventana estricta de 8 días: 1 commit del 24-10 cae dentro por zona horaria). 69 son merges. Pico: 78 commits el 2026-10-25.
- Distribución diaria: 24/10: 1 · 25/10: 78 · 26/10: 24 · 27/10: 5 · 28/10: 10 · 29/10: 16 · 30/10: 28 · 31/10: 12 · 01/11: 37.
- Delimitadores del rango: primer commit del rango `39c682dfb` (2026-10-25, fix(sec) CP-ORG-001) · HEAD de la auditoría `25ce6648f` (2026-11-01 19:02 -0500, merge PR #1541). Durante la misión se integró además el PR #1542 (`806e66e09`), sobre el que se basa la rama candidata.

**Conclusión:** la cifra del propietario (~196) es consistente con la realidad (211 reales en la ventana); el ritmo de integración es alto y sostenido, lo que confirma la necesidad del control de regresiones.

## 4. Causa de la desactivación del E2E

Determinada con evidencia textual en `.github/workflows/ci.yml` (job `e2e`):

> «⛔ DESHABILITADO POR EL PROPIETARIO (2026-10-09) — NO ELIMINAR ESTE BLOQUE. Los E2E crean tiendas/usuarios en el Supabase compartido y contaminaron datos de negocio (48 tiendas + 26 usuarios + 6 tenants el 2026-10-09; evidencia: docs/audits/e2e-contamination-cleanup-20261009.md). Solo reactivar bajo petición EXPLÍCITA del propietario (quitar `if: false`).»

Es decir: **no fue una decisión arbitraria ni un problema de configuración del workflow** — fue una intervención de seguridad del propietario tras un incidente real de contaminación del Supabase compartido (el E2E antiguo apuntaba al mismo proyecto que producción). El sustituto (CP-INFRA-011, `e2e-isolated.yml`) ya implementaba la infraestructura de aislamiento (BD `CostproE2E` dedicada, guard fail-closed, identidad sintética por run) pero quedó **solo manual (`workflow_dispatch`)** a la espera de exactamente este proceso: tres corridas verdes consecutivas + orden explícita del propietario para activar en PR.

Esta misión constituye esa orden: la reactivación se hace **sobre la infraestructura aislada**, no sobre el job antiguo contaminante, que permanece intacto y deshabilitado.

## 5. Arquitectura y configuración de `CostproE2E`

- **Proyecto Supabase aislado:** ref `lguovmvrozxgssupkwpf` (URL `https://lguovmvrozxgssupkwpf.supabase.co`).
- **Producción (prohibida):** ref `wthkddeleylijmonclxg`.
- **Guard fail-closed:** `e2e/fixtures/assert-isolated-db.ts` — rechaza la URL de producción, exige que el ref de la URL coincida EXACTAMENTE con `E2E_ALLOWED_REMOTE_REF` y exige que el centinela `public.e2e_is_isolated_db()` devuelva `true`. Ejecuta antes de CUALQUIER operación en `global-setup`, `global-teardown` y `data-hygiene-guard.cjs`.
- **Identidad sintética por run (E2E_ISOLATION=1):** `e2e/fixtures/run-env.ts` provisiona por ejecución usuarios + tenant + tiendas piloto A/B + productos propios; exporta el bloque `E2E_*` que heredan los workers. Los usuarios/datos nunca provienen de datos reales.
- **Ciclo de datos:** Preparación (provisión por run) → Ejecución → Limpieza (`global-teardown` → `teardownRunEnv` por id exacto desde context file; `hardDeleteRunTenantStores` + `deleteRunTenantIfEmpty`) → Validación (`countE2EResiduals`: si quedan residuos, la corrida NO es verde).
- **Exclusión mutua:** `concurrency: { group: e2e-isolated, cancel-in-progress: false }` — las ejecuciones del mismo entorno se **encolan**; nunca se cancela una ejecución activa ni dos suites operan simultáneamente sobre los fixtures.

## 6. Evidencia de aislamiento respecto a producción

1. **Identidad de credenciales (JWT):** decodificación del payload de `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en uso → claim `ref: lguovmvrozxgssupkwpf` en ambos. La URL activa apunta al mismo ref. Cero credenciales de producción en el entorno de pruebas.
2. **Centinela REST:** `public.e2e_is_isolated_db()` → `true` vía REST con la anon key (spec `isolated-db-sentinel.spec.ts` + `scripts/e2e/verify-remote-e2e.mjs` → «Base aislada PREPARADA», ref verificado, REST 200).
3. **Guard activo en los tres puntos de entrada** (setup, teardown, guard de higiene) — fail-closed, sin fallbacks.
4. **App bajo prueba:** tras el swap del `.env`, la app local sirve exclusivamente el ref aislado (verificación del HTML servido: 2 apariciones de `lguovmvrozxgssupkwpf`, 0 de `wthkddeleylijmonclxg`).
5. **Verificación de escrituras:** todas las escrituras de la suite ocurren vía la app/API sobre la URL pública del proyecto aislado o vía service-role del ref aislado; el guard aborta antes de escribir si el destino no coincide.
6. **Recursos protegidos:** `e2e/config/protected-resources.json` inventaría las pilotos legacy del entorno compartido (`allowedProjectRefs: [wthkddeleylijmonclxg]`); en la base aislada no existen por diseño (identidad por-run) — hallazgo §7-3.

_(las secciones 7–17 se completan con los resultados de las corridas y del PR)_
