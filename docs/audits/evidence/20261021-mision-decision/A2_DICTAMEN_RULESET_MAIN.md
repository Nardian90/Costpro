# DICTAMEN A2 — Ruleset v2 de `main` en modo evaluate: contraste con la configuración REAL

**Misión:** COSTPRO 4 · **Fecha:** 2026-10-21 · **Modo:** inspección read-only. NINGÚN ruleset creado ni activado; cero cambios de permisos, reglas de rama o configuración del repositorio.

---

## 1. Estado REAL de GitHub al corte (2026-10-21 ~01:55Z, verificado por API)

| Elemento | Estado verificado | Evidencia |
|---|---|---|
| Repositorio / rama objetivo | `Nardian90/Costpro` (personal, público) / `refs/heads/main` | `evidencia/rulesets_proteccion_estado_20261021.json` |
| Rulesets instalados | **NINGUNO** (`GET /rulesets` → `[]`) | idem |
| Protección clásica de `main` | **AUSENTE** (`GET /branches/main/protection` → HTTP 404) | idem |
| Bypass efectivo hoy | El propietario puede fusionar/push sin ninguna restricción de plataforma | estado desnudo |

## 2. La propuesta v2 (fusionada en #1437 como documento)

`RULESET_PROPUESTA_MAIN_v2.json`: ruleset `protect-main-v2`, target `branch`, `enforcement: evaluate`, conditions `refs/heads/main`, reglas: `deletion` + `non_fast_forward` + `required_status_checks` (non-strict) con **7 contexts** (app_id 15368). Sin bypass_actors (corrección estructural v2: repo personal → bypass = control administrativo auditable, no bypass silencioso de actor).

## 3. Los 7 checks propuestos vs los workflows REALES (nombres exactos verificados)

| # | Context propuesto | Workflow / job real | Eventos | Filtro `paths:` | ¿Corre en TODO PR? |
|---|---|---|---|---|---|
| 1 | TypeCheck + Lint + Unit Tests + Build | `ci.yml` / `quality` | push+PR `[main, master, develop]` | **NINGUNO** | ✅ SÍ (incondicional) |
| 2 | Security Audit | `ci.yml` / `security` | ídem | **NINGUNO** | ✅ SÍ (incondicional) |
| 3 | Unit & Integration Tests | `test-coverage.yml` / `unit-tests` | push+PR `[main, develop]` | **NINGUNO** | ✅ SÍ (incondicional) |
| 4 | TypeScript Security Checks | `security-gate.yml` / `ts-security-checks` | push+PR `[main]` | `supabase/migrations/**`, `src/app/api/**`, `ci-gate-allowlist.json`, `scripts/ci-gate-*.js` | ❌ NO — solo si toca esas rutas |
| 5 | Allowlist Review | `security-gate.yml` / `allowlist-review` | ídem | ídem | ❌ NO — ídem |
| 6 | SQL Static Checks | `sql-security-gate.yml` / `sql-static-checks` | ídem | ídem (mismo conjunto) | ❌ NO — ídem |
| 7 | SQL DB Security Checks | `sql-security-gate.yml` / `sql-db-security-checks` | ídem | ídem | ❌ NO — ídem |

(`branches: [main]` verificado por bytes hex `5b6d61696e5d` — el aparente «ain]» es efecto del canal de display que consume `[m` como secuencia ANSI; precedente forense ya documentado en Fase 1.)

## 4. PRUEBA EMPÍRICA DE DOS CASOS (evidencia viva, capturada hoy)

| Caso | PR | Rutas tocadas | Check-runs en head | Los 7 checks |
|---|---|---|---|---|
| **A — NO toca rutas filtradas** | #1437 (docs-only) | `docs/audits/**` | **6**: 3 success + 2 E2E skipped + Vercel | **4 de 7 AUSENTES** (ni siquiera skipped: el workflow no se dispara) — `evidencia/checks_head_pr1437_c284e749b.json` |
| **B — SÍ toca rutas filtradas** | #1438 (migración caja + allowlist) | `supabase/migrations/**` + `ci-gate-allowlist.json` | **10** | **7 de 7 PRESENTES en verde** — `evidencia/checks_head_pr1438_aabfe6362.json` |

**Conclusión empírica irrefutable:** los checks 4-7 NO corren cuando el PR no toca las rutas filtradas. GitHub no crea el check-run → un check requerido que nunca reporta queda en estado «Expected» **indefinidamente**.

## 5. ⚠️ DEFECTO CRÍTICO DE LA v2 SI PASARA A `active`

**Con 7 checks requeridos, TODO PR que no toque las rutas filtradas quedaría bloqueado PERMANENTEMENTE** (los 4 checks filtrados nunca reportarían success). Caso real de esta misma noche: **el PR #1437 (docs-only) NO habría podido fusionarse** con la v2 en `active` — el propio expediente de respaldo del programa quedó atrapado por su propia regla. Los PRs de documentación, evidencia y auditoría (≈40% del flujo reciente) quedarían fuera.

**En modo `evaluate` no bloquea nada** (verificado documentalmente: en evaluate «you can still merge the pull request since the ruleset is not enforced» — las reglas se reportan como evaluaciones, sin efecto). El defecto solo explota al pasar a `active` — y el plan v2 contemplaba exactamente ese paso. Por tanto:

> **DICTAMEN A2 (parte 1): la v2 REQUIERE CAMBIOS antes de cualquier activación.**

## 6. Hallazgo secundario — flakiness del check «Unit & Integration Tests»

El push de fusión de #1437 registró 1 fallo: `sprint1.integration.test.ts > BacktestEngine incluye los 4 tests estadísticos` — **`Test timed out in 120000ms`** (131.9s en runner cargado; 3507/3547 pasados; el mismo código pasó en el head del PR y en los 11 pushes previos). Es un test Pick3 de cómputo pesado con timeout ya ajustado a 120s («FIX-CI-TIMEOUT»). Riesgo residual de un check requerido: **falso bloqueo ocasional → política de re-run** (acción de 1 clic del propietario). Alternativa estructural (PR aparte + autorización): subir timeout o marcar el test como `test.sequential` con presupuesto mayor.

## 7. Semántica de bypass y Opción B en este repositorio (verificada)

- **Modo `evaluate`:** puramente observacional — el merge sigue disponible; las evaluaciones quedan en el insight del ruleset para revisar 7-14 días. ✅ Confirmado: no impide fusiones.
- **`bypass_actors` en repo personal:** los bypass de actor son mecanismo de contexto organización; en un repo de usuario el escape del propietario es **administrativo y auditable**: editar/desactivar el ruleset (Settings → Rules), acción registrada en el audit log de GitHub. La corrección estructural de la v2 es correcta: sin bypass silencioso; toda excepción deja huella.
- **Push directo:** con `required_status_checks` activo, un push directo sin checks en verde es rechazado (el head nuevo no trae checks), y `deletion`/`non_fast_forward` cubren borrado y force-push. El merge vía PR con checks verdes queda habilitado para el propietario — flujo diario intacto. **Opción B** = esta configuración + escape administrativo auditable. Sigue siendo la recomendación, CON la corrección v3.

## 8. CONTRASTE: estado actual vs propuesto (v2) vs corregido (v3)

| Dimensión | Actual (sin protección) | v2 propuesto (7 requeridos) | **v3 corregido (3 requeridos)** |
|---|---|---|---|
| Fusiones de PR | libres | bloqueadas si falta cualquiera de 7 | bloqueadas solo si fallan checks que SIEMPRE corren |
| PR docs-only | libres | **BLOQUEADO PERMANENTEMENTE** ⚠️ | libre (los 3 requeridos corren en todo PR) |
| Push directo a main | libre | bloqueado (sin checks en el SHA nuevo) | bloqueado (igual) |
| Force-push / borrado | libre | bloqueado | bloqueado |
| Gates de rutas (checks 4-7) | corren según rutas | required para todos ⚠️ | siguen corriendo como **gates de workflow a nivel PR** (no required del ruleset) |
| Efecto en evaluate | — | observacional, sin bloqueo (14 días) | observacional, sin bloqueo (14 días) |
| Riesgo de falso bloqueo | — | alto (docs-only + flake Pick3) | bajo (solo flake Pick3, mitigable con re-run) |

**v3 corregido — requeridos SOLO los 3 incondicionales** (verificados empíricamente en #1437 y #1438): `TypeCheck + Lint + Unit Tests + Build`, `Unit & Integration Tests`, `Security Audit`. Los 4 checks de rutas siguen defendiendo sus dominios a nivel workflow (se ejecutan cuando el PR toca `supabase/migrations/**` / `src/app/api/**` / allowlist / maquinaria del gate — exactamente el diseño documentado en `sql-security-gate.yml`). Alternativa futura (requiere PR de código + autorización expresa): reestructurar los workflows con `dorny/paths-filter` + job resumen «always success» para hacer los 7 siempre-reportables y volver a ex exigir los 7. No es necesario para activar la protección básica.

## 9. DICTAMEN A2 (final)

> ## ⚠️ REQUIERE CAMBIOS (v2, con 7 requeridos) → ✅ PREPARADO (v3 corregido, con 3 requeridos incondicionales + deletion + non_fast_forward, en `evaluate` primero)

1. La v2 NO debe activarse tal cual: bloquearía permanentemente los PRs solo-docs (prueba empírica: #1437). 
2. La **v3** (`RULESET_PROPUESTA_MAIN_v3_CORREGIDO.json`, misma carpeta) corrige el set de requeridos manteniendo el objetivo de seguridad (bloqueo de push directo, force-push y borrado; gates por rutas intactos).
3. NINGÚN ruleset ha sido creado ni activado por el agente. La creación en `evaluate` requiere **autorización expresa del propietario**; el paso a `active`, una segunda autorización tras 7-14 días de evaluaciones limpias.
4. Límites respetados: cero cambios de permisos, cero reglas de rama, cero escritura de configuración GitHub.
