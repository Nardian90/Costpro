# FASE 1 — DICTAMEN SOBRE EL PR #1433 (fix/security-gates-push-main)

**Expediente:** CP-SEC-027 v5 · Fase 1 · **Fecha del dictamen:** 2026-10-21

---

## 1. Estado REAL actual del PR (verificado con la API el 21/10)

| Campo | Valor verificado |
|---|---|
| Título | `fix(ci): gates de seguridad SQL/TS también en push a main — canal de fusión directa cubierto` |
| Estado | **closed / MERGED** — fusionado por **Nardian90** (el propietario) el **2026-10-19T20:49:57Z** |
| Merge commit | `8b9a162e7` (ancestro directo del HEAD actual `c08a4038cc`) |
| Tamaño | **+32 / −0 en 2 archivos** — coincide exactamente con las 32 líneas añadidas que citaba el expediente v5 |
| Rama base | `main`, sin conflicto al momento del merge |
| Checks al merge | CI verde (5/5 workflows; E2E skipped ×2 — CP-INFRA-001, patrón idéntico a los merges vecinos) |

**Hecho relevante:** el expediente v5 partía de «PR #1433: abierto, mergeable, pendiente de revisión humana». El propietario lo fusionó antes de esta revisión formal. El dictamen se emite igualmente sobre el contenido como registro de la revisión pendiente.

## 2. Inspección del diff real (los dos workflows) — VERIFICADO

**`security-gate.yml` (+11):** añade el trigger `push` con `branches: [main]` y los MISMOS filtros de rutas que `pull_request` (`supabase/migrations/**`, `src/app/api/**`, `ci-gate-allowlist.json`, `scripts/ci-gate-*.js`). El evento `pull_request` conserva sus filtros intactos (diff puramente aditivo). Sin duplicación de jobs (cada canal ejecuta el MISMO job con la MISMA lógica) y sin omisión de controles.

**`sql-security-gate.yml` (+21):** añade el trigger `push` con `branches: [main]` y filtro de rutas idéntico al de su `pull_request` (`supabase/migrations/**`, `scripts/ci-gate-sql-checks.js`, `scripts/ci-gate-evaluate.js`, `ci-gate-allowlist.json`). El comentario incorporado documenta la razón (defensa en profundidad del canal de fusión directa + conflictos semánticos post-fusión, con la evidencia viva de los PR #1430/#1431). `pull_request` intacto.

**Verificación forense del contenido (punto 2 del expediente — filtros correctos):**
- YAML parseado con `yaml.safe_load` en ambos ficheros: `push → branches: ['main']` — sintaxis y semántica CORRECTAS.
- Bytes del patch en la API (`od -c` crudo): `branches: [main]` — idéntico al contenido fusionado.
- Hash SHA-256 del JSON de la API descargado = hash de la descarga fresca (80b623a7…) — sin corrupción en la cadena de evidencia.
- Historial: `f76fe0900` es el único commit que tocó ambos workflows; el árbol actual contiene exactamente esa versión.

**Nota de método (transparente, para el expediente):** durante la inspección inicial, una lectura del diff a través del canal de visualización mostró `branches: ain]` (sin el `[m` inicial), lo que sugirió un defecto tipográfico. La verificación forense byte a byte (od, YAML parse, hash API↔disco) demostró que fue un **falso positivo del canal de renderizado, no un defecto del código**: el contenido real es correcto en el commit, en el merge y en `main`. El dictamen se emite sobre los BYTES, no sobre la primera lectura. Esta secuencia queda documentada como precedente del expediente: ningún hallazgo se declara sin verificación de bytes crudos.

## 3. Comprobación de los checks y la rama base (punto 3 del expediente)

- En `main` HOY (`c08a4038cc`): **7 checks success** (Security Audit; Unit & Integration Tests; TypeCheck + Lint + Unit Tests + Build; TypeScript Security Checks; Allowlist Review; SQL Static Checks; SQL DB Security Checks) + 2 `E2E Tests (Playwright)` skipped — verificado por API, evidencia archivada.
- **El canal `push` añadido por el PR YA FUNCIONA con semántica contractual:** ambos workflows corrieron en `push|main` el 2026-10-20T23:53:05Z sobre `c08a4038cc` (runs success) porque el merge #1435 tocó las rutas del filtro. El objetivo del PR #1433 (cerrar el hueco de fusión directa) quedó operativo y verificado con corrida real.

## 4. DICTAMEN

**APTO PARA FUSIÓN — sin defectos.** (El PR ya fue fusionado por el propietario el 19/10; este dictamen confirma a posteriori que la fusión fue correcta.)

- Alcance exacto (+32 en 2 workflows) ✓ · filtros `pull_request` conservados ✓ · filtros `push` correctos (`[main]`, verificado forense) ✓ · sin duplicación ni omisión de controles ✓ · rama base sin conflicto ✓ · CI verde al merge ✓ · canal push verificado con corrida real en producción del 20/10 ✓.
- No se requiere ningún PR de corrección derivado de esta revisión: la excepción del expediente v5 («no crees otro PR salvo defecto reproducible») NO aplica — no hay defecto.
- Residual NO bloqueante: los 2 checks E2E siguen `skipped` (CP-INFRA-001, misión D del plan) — fuera del alcance del PR #1433.

**Restricciones respetadas:** no se fusionó nada en esta fase (el merge fue decisión previa del propietario), no se creó PR adicional alguno por esta revisión, y no se declaró ejecutada ninguna acción que solo estuviera preparada.
