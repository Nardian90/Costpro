# CP-INFRA-019 — Auditoría y corrección integral del guard de producción Supabase

**Fecha:** 2026-11-01 · **Rama:** `fix/guard-produccion-target-url-20261101` (PR independiente contra `main`)
**Severidad:** P0 (protección de CostproBD) · **Estado del PR:** abierto, **sin fusionar**, preparado para revisión del propietario.

## 1. Resumen ejecutivo

El PR #1537 introdujo un guard de producción (`scripts/lib/assert-not-production.{mjs,py,sh}`) cableado en once escritores. Una revisión independiente identificó tres defectos (A, B, C); esta auditoría los confirmó, encontró **otros cinco** y corrigió todo el conjunto. El defecto transversal era el mismo en casi todos los casos: **el guard validaba una URL ambiental que no era necesariamente el destino real de la operación** — un ref de producción hardcodeado en una llamada a la Management API, una URL leída de `.env` distinta de `process.env`, o una variable vacía que el guard trataba como "no es producción" y dejaba pasar.

La corrección invierte el contrato: **el guard identifica el destino real por su identificador de proyecto** (ref extraído de la URL que el escritor va a usar, o el ref exacto si está hardcodeado) y **toda escritura con destino ausente, desconocido o no verificado queda bloqueada sin flags que la autoricen** (fail-closed). La verificación no depende de variables ambientales: ninguna combinación de `E2E_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL` puede convertir una operación dirigida a CostproBD en una operación "E2E".

## 2. Defectos corregidos

### Defecto A — `scripts/apply-rpc-fix.sh` (ref de producción hardcodeado vs entorno)

**Antes:** el guard recibía `${NEXT_PUBLIC_SUPABASE_URL:-https://wthkddeleylijmonclxg.supabase.co}` — si el entorno apuntaba a CostproE2E, el guard validaba E2E mientras la petición real (dos llamadas a `https://api.supabase.com/v1/projects/wthkddeleylijmonclxg/database/query`) iba a producción. Además hacía `export $(grep -v '^#' .env | xargs)`, que volcaba todos los secretos del `.env` al entorno del proceso.

**Corregido:** el script declara `PROJECT_REF="wthkddeleylijmonclxg"` (el identificador que realmente usan las peticiones) y el guard valida **exactamente ese ref** (`assert_not_production write "" "apply-rpc-fix.sh" "$PROJECT_REF"`). Con el entorno apuntando a E2E, la operación sigue BLOQUEADA (verificado en la matriz, caso 1). El token se carga con `sed` (solo `SUPABASE_ACCESS_TOKEN`), sin `export $(grep ...)`. Se eliminaron también `cd /home/z/my-project/Costpro` y la ruta absoluta del `.env` (apuntaban a un directorio que no existe en un checkout limpio).

### Defecto B — `scripts/pgrst-reload-schema.mjs` (parser local vs `process.env`)

**Antes:** el script leía `NEXT_PUBLIC_SUPABASE_URL` de `.env` con un parser local pero pasaba `process.env.NEXT_PUBLIC_SUPABASE_URL` al guard. Si esa variable ambiental estaba ausente, el guard pasaba sin identificar destino alguno; el `ref` de la petición salía del valor del parser.

**Corregido:** el guard recibe la URL realmente leída del `.env` (`vars.NEXT_PUBLIC_SUPABASE_URL`), y el `ref` de la Management API se extrae de **la URL validada que el guard devuelve** — destino comprobado y ejecutado coinciden por construcción.

### Defecto C — `scripts/apply-sql-migration.js` (`import` + `require` en `.js`)

**Antes:** `import { assertNotProduction } from './lib/assert-not-production.mjs'` en la línea 3 convertía el archivo en módulo ESM; el `require('fs')` de la línea 15 lo rompía con `require is not defined in ES module scope`. El script era **inejecutable** bajo Node (el proyecto no declara `type: module`).

**Corregido:** CommonJS puro (`require` en todo); el guard se invoca por CLI con `--url` = la URL que el script usará, y `PROJECT_REF` se extrae de esa misma URL. **Demostrado con el Node del proyecto (v24, engines `>=22`):** con destino E2E pasa el guard y falla solo por falta de argumento SQL (después del guard); con destino producción se bloquea antes de cualquier efecto.

### Defectos adicionales encontrados por esta auditoría

| # | Escritor | Defecto | Corrección |
|---|---|---|---|
| D | `apply_migration_20260824000002.mjs` | Sintaxis TypeScript (`process.env.X!`) en un `.mjs`: **ni siquiera parseaba** con Node — su guard jamás se ejecutaba. Además creaba el cliente de Supabase antes del guard. | JS válido (`|| ''` + validación); el guard corre **antes** de `createClient`. |
| E | `landing-demo-cleanup.cjs` | El guard recibía `process.env.NEXT_PUBLIC_SUPABASE_URL` mientras el script escribe con la URL leída del `.env` por su parser local. Con `process.env` vacío el guard pasaba sin destino. | El guard recibe la URL del parser (la que usan las peticiones). |
| F | `seed-pick3-history.js` | Igual patrón: guard con `process.env` tras `dotenv` — la fuente era la misma, pero el contrato quedaba ambiguo y frágil. | Guard con la URL cargada por dotenv (una sola fuente de verdad). |
| G | `apply-migration.cjs` | Leía `.env` con ruta absoluta de sandbox (`/home/z/my-project/.env`) — en un checkout limpio crasheaba antes del guard. | Ruta relativa a la raíz del repo (`__dirname/..`); el guard ya recibía la URL del `.env`. |
| H | `m002-aplicar-migracion-20261031140000.mjs` | El guard recibía `NEXT_PUBLIC_SUPABASE_URL ?? E2E_URL`: con `NEXT_PUBLIC` apuntando a E2E y `E2E_SUPABASE_URL` (el destino real de la operación) apuntando a producción, **el guard validaba E2E y la petición iba a producción**. | El guard recibe exactamente `E2E_SUPABASE_URL` (la URL de la operación); se conserva la segunda capa `E2E_ALLOWED_REMOTE_REF`. |
| I | `m003` / `m004`×2 | `url: NEXT_PUBLIC ?? SUPABASE_URL` con `SUPABASE_URL === NEXT_PUBLIC` — expresión redundante que ocultaba cuál era la fuente real. | `url: SUPABASE_URL` (la variable de la que se extrae el `ref` usado en la Management API). |
| J | Guard (3 variantes) | **URL ausente ⇒ "no es producción" ⇒ paso libre**: cualquier escritor sin URL configurada pasaba el guard sin destino identificado. URLs de hosts no-Supabase (`*.supabase.com`, strings malformados) también pasaban como "no-prod". El fallback ambiental priorizaba `E2E_SUPABASE_URL` — una var E2E autorizaba silenciosamente escritores que usaban otra URL. | Ver §3. |

## 3. Guard compartido rediseñado (mjs / py / sh — contrato idéntico)

1. **Identificación por ref real.** `classifyTarget()` extrae el identificador de proyecto de `https://<ref>.supabase.co`, `db.<ref>.supabase.co`, `postgres://...postgres.<ref>@…`; reconoce `localhost/127.0.0.1/::1/*.localhost` como local; **todo lo demás es "desconocido"** (no "no-prod").
2. **`projectRef`/`--project-ref`:** cuando el escritor usa un ref hardcodeado (Management API), el guard valida exactamente ese identificador — el entorno no puede autorizar la operación.
3. **Escritura fail-closed:** destino ausente, desconocido o ref remoto no verificado ⇒ bloqueada, **sin flags que la autoricen** (no se puede aprobar a ciegas lo que no se identificó). Un "desconocido" que contiene el ref de producción se bloquea como producción.
4. **Lectura:** producción o destino desconocido/no verificado exigen `ALLOW_PROD=read-only` (se asume el peor caso).
5. **Producción:** bloqueada por defecto; escritura requiere además `ALLOW_PROD_WRITE=I_UNDERSTAND` (registro visible en stderr).
6. **Sin elusión:** la URL ambiental ya no participa en absoluto en escrituras; solo completa el destino en modo lectura. `E2E_KNOWN_REFS` (CostproE2E `lguovmvrozxgssupkwpf` + ref de rama efímera) es la lista cerrada de refs remotos que pasan; añadir uno exige editar el guard con justificación documentada.
7. **El valor devuelto es el destino validado** — los escritores construyen la petición con lo que el guard devuelve (pgrst, apply-sql-migration).
8. **Mensajes sin credenciales:** solo refs y hosts enmascarados; sin query strings ni keys.

## 4. Tabla de auditoría de los once escritores

Convención: "URL real" = la URL/ref con el que el script construye su petición efectiva.

| Escritor | De dónde obtiene la URL | Carga de .env/.env.local | Variable que recibe el guard | Proyecto en la petición | ¿Hardcode? | ¿Guard antes de todo efecto? | Otra protección | Discrepancia comprobado/ejecutado | Resultado de pruebas |
|---|---|---|---|---|---|---|---|---|---|
| `apply-rpc-fix.sh` | Ref literal del script | `sed` solo `SUPABASE_ACCESS_TOKEN` de `.env` | **`PROJECT_REF` (ref exacto)** vía 4º arg / `--project-ref` | `api.supabase.com/v1/projects/<ref>` (prod, histórico) | Sí (prod) — ahora explícito y validado | Sí (primer efecto tras el guard) | — | **Eliminada** (el guard valida el ref de la propia petición) | Smoke 3/3 (prod, ausente, entorno-E2E-op-prod) ✓ · matriz CLI sh ✓ |
| `apply-migration.cjs` | Parser local de `.env` (raíz repo) | Parser propio (no usa dotenv) | URL del `.env` (la usada por fetch) | `<ref de la URL>` vía PostgREST `exec_sql` | No | Sí | Fallback a lectura si no hay RPC | Ninguna (misma URL) | Smoke ✓ |
| `apply-sql-migration.js` | `process.env` (NEXT_PUBLIC o SUPABASE_URL) | No carga .env (documentado) | La misma URL del entorno | `api.supabase.com/v1/projects/<ref de esa URL>` | No | Sí | Validación de formato de URL | Ninguna (ref de la URL validada) | Demo Node 24 ✓ (E2E pasa → uso; prod bloquea) · smoke ✓ |
| `apply_migration_20260824000002.mjs` | `process.env` | No carga .env | URL usada por fetch | `<ref de la URL>` vía `exec_sql` | No | **Sí (antes de `createClient`; antes ni parseaba)** | — | Ninguna | Smoke ✓ (antes: SyntaxError — guard inalcanzable) |
| `m002-aplicar-migracion-20261031140000.mjs` | `E2E_SUPABASE_URL` de `.env.local` + `.env` (dotenv) | `dotenv` `.env.local` + `.env` | **`E2E_SUPABASE_URL` (la de la operación)** | `api.supabase.com/v1/projects/<ref de E2E_URL>` | No | Sí | `E2E_ALLOWED_REMOTE_REF` exacto + rechazo explícito de prod (2ª capa) | **Eliminada** (antes NEXT_PUBLIC podía tapar el destino) | Smoke ✓ (E2E_URL=prod bloquea; ausente bloquea) |
| `m003-aplicar-migracion.mjs` | Parser local de `.env` | Parser propio (escribe en process.env) | URL del `.env` (la usada) | `api.supabase.com/v1/projects/<ref de esa URL>` | No | Sí | — | Ninguna | Smoke ✓ |
| `m004-aplicar-migracion-20261030130000.mjs` | Ídem m003 | Ídem | URL del `.env` | Ídem m003 | No | Sí | — | Ninguna | Smoke ✓ |
| `m004-aplicar-migracion-20261030143000.mjs` | Ídem m003 | Ídem | URL del `.env` | Ídem m003 | No | Sí | — | Ninguna | Smoke ✓ |
| `pgrst-reload-schema.mjs` | Parser local de `.env` | Parser propio | **URL leída del `.env`** (defecto B corregido) | `api.supabase.com/v1/projects/<ref de la URL validada>` | No | Sí | — | **Eliminada** (ref extraído de la URL que devuelve el guard) | Smoke ✓ |
| `seed-pick3-history.js` | dotenv sobre `.env` (raíz repo) | `dotenv` | URL cargada por dotenv | `<ref de la URL>` vía PostgREST | No | Sí | Upsert idempotente (`resolution=merge-duplicates`) | Ninguna | Smoke ✓ |
| `landing-demo-cleanup.cjs` | Parser local de `.env` | Parser propio | **URL del parser** (defecto E corregido) | `<ref de la URL>` vía PostgREST/Auth Admin | No | Sí | `assertIsolatedDb` (CP-INFRA-011, 2ª capa: centinela `e2e_is_isolated_db`) | Ninguna | Smoke ✓ |

**Falsos bloqueos E2E corregidos:** el guard anterior bloqueaba m002 (guard con `NEXT_PUBLIC`=prod mientras la operación iba al E2E legítimo) y trataba `https://e2e-*.supabase.co` de rama como "no-prod" por coincidencia de substring. El contrato nuevo pasa **CostproE2E (`lguovmvrozxgssupkwpf`) sin flags** (está en `E2E_KNOWN_REFS`), y la lectura contra un ref no verificado sigue disponible con `ALLOW_PROD=read-only`.

## 5. Matriz de pruebas ejecutada (procesos reales, destinos interceptados)

Toda la matriz corre en `src/__tests__/scripts/assert-not-production.test.ts` (**52 tests, en verde**) con procesos reales de Node 24 / Python 3 / Bash y un interceptor HTTP local (servidor 127.0.0.1 que registra cada petición). **Ninguna prueba toca Supabase real ni producción.**

| Destino real de la operación | URL ambiental | Resultado esperado | Resultado |
|---|---|---|---|
| Producción | E2E | Bloquear | ✓ bloquea (mjs/py/sh CLI y API ESM; el entorno no autoriza) |
| Producción | Vacía | Bloquear | ✓ bloquea |
| Producción | Producción | Bloquear sin autorización | ✓ bloquea |
| Producción | Producción + doble flag | Permitir solo el caso explícito | ✓ permite + registra autorización en stderr (solo esta combinación) |
| E2E | Producción | Validar destino efectivo E2E | ✓ permite; petición interceptada va al ref E2E |
| E2E | E2E | Permitir | ✓ permite |
| Desconocido/vacío | Vacía | Bloquear escrituras | ✓ bloquea (sin flags posibles) |

Pruebas específicas adicionales (todas ✓):

- **Mismo proyecto comprobado/ejecutado:** el escritor simulado valida con el guard y hace fetch al interceptor; se afirma que la URL de la petición contiene el ref validado (E2E), y con entorno=prod + destino=E2E la petición sigue yendo al E2E.
- **Cero peticiones antes del guard:** con producción sin flags y con destino vacío, el interceptor registra **0 hits**.
- **`--project-ref` exacto:** ref prod con entorno E2E → bloquea en las 3 variantes (defecto A).
- **Elusión por entorno imposible:** escritura sin URL con entorno E2E completo → bloquea (la URL ambiental no autoriza escrituras).
- **Idempotencia:** decisiones idénticas en corridas repetidas (API y CLI).
- **Sin duplicación de procesos:** el patrón CLI de los `.cjs` genera exactamente un proceso guard por invocación.
- **Regresión de los once escritores** (`scripts/lib/smoke-writers-cp-infra-019.sh`, invocado desde la suite): **15/15 PASS** — cada escritor con `.env` real (=prod) y con destino ausente se bloquea con mensaje del guard antes de cualquier efecto; caso de discrepancia entorno-E2E/operación-prod bloquea.
- **Las tres variantes del guard funcionan de verdad:** cada caso de la matriz se ejecuta como proceso real `node`/`python3`/`bash`.
- **Node 22+:** todos los scripts pasan `node --check` / `bash -n` / `py_compile`; el demo del fix C corrió con el Node del proyecto (v24; engines exige >=22).

## 6. Verificación de la batería completa

| Chequeo | Resultado |
|---|---|
| TypeCheck (`tsc --noEmit`, sin cache incremental) | ✓ 0 errores |
| ESLint (archivo de tests y scripts) | ✓ 0 errores |
| Vitest completo | ✓ **4978 passed / 0 failed** (351 archivos, 66 skipped por diseño) — incluye la suite CP-INFRA-019 (52 tests) |
| SQL Security Gate (`security-contract-test-static.cjs`) | ✓ OK — 175/175 funciones representadas, 0 divergencias bloqueantes (2 warnings MEDIUM/LOW preexistentes) |
| `next build` | ✓ exit 0 (build de producción completo) |

## 7. Limitaciones y notas para el revisor

- **La protección no está "certificada" por los tests del guard solos.** Lo que demuestran es el contrato por escritor: cada uno bloquea con su configuración real (smoke 15/15), la petición interceptada usa el mismo ref que validó el guard, y no hay peticiones previas al guard. La certificación operativa completa (por ejemplo, frente a futuros escritores) exige que TODO script nuevo que escriba contra Supabase invoque el guard con su destino real — el criterio final de la misión.
- **Ninguna operación contra CostproBD se ejecutó ni se ejecutará en este PR.** Las únicas ejecuciones de escritores fueron con bloqueo activo (se cortan en el guard) o con destino E2E/mock. No se tocaron migraciones, seeds, limpiezas, configuración de Supabase ni claves.
- `apply-rpc-fix.sh` mantiene su ref de producción hardcodeado **y ahora siempre se bloquea** salvo doble flag explícito: es un script de operación productiva legítima, y su uso correcto queda a discreción del propietario (documentado en el mensaje de bloqueo).
- La lista `E2E_KNOWN_REFS` es deliberadamente cerrada; si aparecen entornos remotos legítimos nuevos, deben añadirse con justificación en `docs/audits/`.
- El `.env` del sandbox apunta a producción; por eso el smoke de regresión es también una prueba realista: cualquier corrida accidental de los once escritores en este entorno se bloquea.

## 8. Archivos modificados

- `scripts/lib/assert-not-production.mjs` / `.py` / `.sh` — guard rediseñado (identificación por ref real, fail-closed, `--project-ref`).
- `scripts/apply-rpc-fix.sh`, `scripts/pgrst-reload-schema.mjs`, `scripts/apply-sql-migration.js` — defectos A, B, C.
- `scripts/apply-migration.cjs`, `scripts/apply_migration_20260824000002.mjs`, `scripts/m002-…mjs`, `scripts/m003-…mjs`, `scripts/m004-…mjs` (×2), `scripts/seed-pick3-history.js`, `scripts/landing-demo-cleanup.cjs` — cableado del guard al destino real + correcciones D–I.
- `scripts/lib/smoke-writers-cp-infra-019.sh` — smoke de regresión de los once escritores (15 casos).
- `src/__tests__/scripts/assert-not-production.test.ts` — suite CP-INFRA-019 (52 tests: matriz, intercepción HTTP, idempotencia, duplicación, regresión).
- `docs/audits/CP-INFRA-019_GUARD_PRODUCCION_AUDIT.md` — este informe.
