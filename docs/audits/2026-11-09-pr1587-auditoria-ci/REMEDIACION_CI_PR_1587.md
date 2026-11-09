# REMEDIACION_CI_PR_1587.md

**Misión:** CP-PR-1587-AUDIT-CI-REMEDIATION-001 · **Fecha:** 2026-11-09
**Alcance:** diagnóstico y corrección controlada de los 3 checks fallidos del PR #1587 en el SHA inicial `71a4190f2` — sin eliminar ni debilitar pruebas, workflows ni controles de seguridad.

---

## 1. Tabla de fallos y correcciones

| Workflow | Job | Error inicial | Causa raíz | Corrección | Resultado final |
| --- | --- | --- | --- | --- | --- |
| **CI** | Security Audit | Step «Security contract (static, CI-safe)» exit 1: 2× `LIVE_FUNCTION_NOT_REPRESENTED` — `create_master_product/11` y `activate_master_product/3` «sin representación en el stream de migraciones» | La migración del PR reemplaza las firmas certificadas por el surface LIVE (`contract-surface.sql`, snapshot de **producción**, 185 funciones) mediante DROP firma-exacta + CREATE (/11→/12 y /3→/4, `p_operational_class`). La Capa C exige replay ≡ surface; la migración **no está aplicada en producción** (prohibido en esta misión), por lo que la divergencia es REAL y temporal | Categoría **C (config/contrato)**: 2 entradas revisadas en `ci-gate-allowlist.json` → `source_of_truth_baseline` (regla, razón, `added_by: CP-OPERATIONAL-CLASS-002`, `expires: 2027-01-31`) — mecanismo sancionado del repo con precedente directo (CP-DOC-SC-DATA-MAPPING-006 / PR #1588). Cada entrada instruye retirarla y regenerar surface tras el despliegue autorizado | ✅ `success` en GitHub (commit `9aebce04d`) y local (`node scripts/security-contract-test-static.cjs` → exit 0, «CONTRATO OK con 2 warnings» preexistentes ajenos al PR) |
| **CI** | TypeCheck + Lint + Unit Tests + Build | Step «Unit tests»: vitest exit 1 — `AssertionError: expected false to be true` en `src/__tests__/migrations/cp-operational-classification-migration.test.ts:183` («existe la evidencia de la verificación en PostgreSQL REAL (34 checks)») | El commit de remediación del PR referenciaba `audit-evidence/CP-OPERATIONAL-CLASS-002/verificacion-postgresql-real.log` pero **el archivo nunca entró al repo**: la regla `*.log` de `.gitignore` (línea 50) lo descartó silenciosamente al hacer `git add` (verificado: `git check-ignore -v`) | Categoría **B (pruebas/evidencia)**: la PRUEBA es correcta (exige evidencia commiteada, convención del repo). Se **regeneró la evidencia real** ejecutando `scripts/e2e/verify-operational-classification-pg.mjs` contra la BD AISLADA CostproE2E (guard fail-closed, jamás producción): **34/34 checks OK**, y se commiteó con `git add -f` (precedente: `audit-evidence/20260828/**/*.log` ya trackeados) | ✅ `success` en GitHub; local: test 14/14 |
| **Test Coverage** | Unit & Integration Tests | Step «Run tests with coverage»: mismo único fallo (`cp-operational-classification-migration.test.ts:183`) | Idéntica a la anterior (mismo artefacto faltante) | Misma corrección | ✅ `success` en GitHub |

**Checks que ya pasaban en el SHA inicial** (sin cambios): Vercel Preview Comments, SQL DB Security Checks, SQL Static Checks, TypeScript Security Checks, Allowlist Review, E2E Aislado (project).

## 2. Hallazgo local adicional (NO es fallo del CI — observación separada)

- `src/__tests__/integration/db-integration.test.ts` («superadmin platform account has NO store memberships by design») falla **solo en local** con `expected 2 to be +0`: la BD de producción contiene 2 membresías admin activas de la cuenta de plataforma creadas el **2026-11-05 (COSTPRO (Prueba))** y **2026-11-07 (SHADDAI)**. El suite se **salta en CI** (`describe.skipIf(!SERVICE_ROLE_KEY)` — CI no tiene service-role key). Es un test preexistente NO tocado por el PR; refleja deriva de datos productivos ajena a este PR. **No se modificó el test ni los datos** (misión §12/§18); documentado como observación O4 de la auditoría para decisión del propietario.

## 3. Comandos ejecutados localmente (equivalentes al pipeline)

| Comando | Equivalente CI | Resultado |
| --- | --- | --- |
| `bun install --frozen-lockfile` | Install dependencies (bun 1.3.14) | OK — 1252 paquetes |
| `NODE_OPTIONS="--max-old-space-size=4096" bunx tsc --noEmit` | CI: TypeCheck | ✅ exit 0, 0 líneas |
| `bun run lint` | CI: Lint | ✅ exit 0 — 0 errores (1.503 warnings preexistentes del patrón establecido) |
| `CI=true bun run test` | CI: Unit tests / Test Coverage | 5.639 passed · 1 failed — el único fallo es el test de integración preexistente y ajeno al PR que **CI salta** (§2). Con el fix de evidencia: `cp-operational-classification-migration.test.ts` 14/14 |
| `NODE_OPTIONS="--max-old-space-size=4096" bun run build` | CI: Build | ✅ «Compiled successfully in 72s» + runAfterProductionCompile OK; la fase interna «Running TypeScript» fue terminada por OOM del **sandbox local** (SIGKILL; el typecheck íntegro ya está verificado con `tsc --noEmit` exit 0 y el build completo corre en los runners de GitHub) — **limitación de entorno, no de código** |
| `node scripts/security-contract-test-static.cjs` | CI: Security contract (static) | ✅ exit 0 tras el fix («CONTRATO OK con 2 warnings» preexistentes) |
| `node scripts/e2e/check-e2e-config.mjs --target project` · `node scripts/e2e/build-migrations-replay.mjs --check` · `node scripts/e2e/verify-remote-e2e.mjs` | Validaciones previas E2E (bootstrap §6) | ✅ «Base aislada PREPARADA» (ref `lguovmvrozxgssupkwpf`, centinela=true) |
| `node scripts/e2e/verify-operational-classification-pg.mjs` (con `E2E_*` + `SUPABASE_ACCESS_TOKEN` del entorno) | — (verificación PostgreSQL real) | ✅ **34/34 checks OK** — «TODAS las verificaciones PostgreSQL pasaron»; evidencia regenerada y commiteada |

## 4. Cambios de configuración (justificación)

- **`ci-gate-allowlist.json`** (+2 entradas en `source_of_truth_baseline`): única modificación de configuración. Justificación técnica: el gate Capa C compara el surface LIVE (producción) contra el replay de migraciones; una migración **pendiente de desplegar** que cambia firmas certificadas produce una divergencia real que el propio repo resuelve con este mecanismo revisado (precedente: la entrada de `next_document_number` del PR #1588). Las entradas son acotadas (regla única, función/arity exactos), trazables (added_by), temporales (expires 2027-01-31) e instruyen su retiro + regeneración de surface tras el despliegue autorizado. **Ningún umbral, workflow, ni control fue relajado.**
- **`src/lib/price-list/operational-filters.ts`** (comentario de cabecera, 0 líneas de código): alineado al criterio de precio implementado y verificado en PostgreSQL real (Con precio = `price > 0`).
- **Evidencia:** `audit-evidence/CP-OPERATIONAL-CLASS-002/verificacion-postgresql-real.log` (42 líneas, 34 checks ✓) — regenerada en esta sesión contra la BD aislada, no copiada del histórico.

## 5. Cambios en pruebas

**Ninguno.** Cero tests añadidos al runner, modificados, eliminados o saltados para lograr el verde. La única intervención sobre artefactos de prueba fue **aportar la evidencia que un test existente exige** (regenerada de forma real y reproducible con el script versionado del propio PR).

## 6. Commits y verificación en GitHub

| Commit | Contenido |
| --- | --- |
| `9620101bb` | chore: sincronizar rama del PR con `main` vigente (`99e1c0960` — PR #1588; 5 archivos legal/docs, sin migraciones ni manifiesto; merge limpio verificado con los 4 tests afectados: 33/33) |
| `9aebce04d` | fix(ci): evidencia PostgreSQL real commiteada (`git add -f`) + baseline source-of-truth de las firmas nuevas + doc del criterio de precio |

Verificación en GitHub (checks del SHA final `9aebce04d`): **9/9 completados sin fallos** — CI (Security Audit ✓ · TypeCheck+Lint+Unit Tests+Build ✓), Test Coverage ✓, SQL Security Gate ✓ (SQL DB Security + SQL Static), Security CI Gate ✓ (TypeScript Security + Allowlist Review), E2E Aislado ✓, Vercel ✓. Detalle y trazas en el comentario de cierre del PR.

## 7. Fallos de infraestructura externa

Ninguno atribuible a infraestructura GitHub. La única limitación externa es local (OOM del sandbox en la fase TS interna del build, §3), documentada y compensada con la verificación `tsc --noEmit` íntegra + el build completo en los runners de GitHub.

## 8. Limitaciones pendientes

1. **R2:** la excepción del baseline debe retirarse (y el surface regenerarse) al desplegar la migración 20261108150000 en producción — instrucción incluida en la razón de cada entrada.
2. **R1:** convención de evidencias vs `.gitignore` (`*.log`) — recomendación registrada en la auditoría (O1/R1).
3. **O4:** decisión del propietario sobre el test de integración del superadmin vs las membresías reales de la cuenta de plataforma.
