# FASE B — 04 TESTS

Fecha: 2026-09-22 · Baseline `7222b62d` + cambios FASE B (6 archivos)

## 1. Resumen

| Verificación | Comando | Resultado |
|---|---|---|
| Tests de navegación (contratos GATE 1/1.3/1.4R/1.4R.1/FASE B) | `npx vitest run src/__tests__/navigation/` | **130/130 PASS** (3 archivos) |
| Suite completa | `npx vitest run` | **2.200 passed / 0 failed** (24 skipped pre-existentes; 103 archivos, 235s) |
| TypeScript (proyecto completo) | `npx tsc --noEmit` | **exit 0** |
| ESLint (6 archivos modificados) | `npx eslint <archivos>` | **0 errores**, 4 warnings pre-existentes (`<button>` crudo — V2.12.25; no introducidos por este gate) |
| Build de producción | `NODE_OPTIONS=--max-old-space-size=4096 npx next build` | **exit 137 — SIGKILL por OOM del kernel** (limitación de entorno conocida, ver §3) |

## 2. Tests nuevos (contratos FASE B — 19 assertions en 5 describe)

Archivo: `src/__tests__/navigation/gate1-navigation.test.ts`. Ningún test pre-existente fue
debilitado o eliminado; los 4 fallos iniciales del bloque nuevo eran errores del propio test
(import ESM del default export, expectativa del route canónico de `accounts-payable`,
`storefront-config` que es extensión y no hoja) y se corrigieron en el mismo gate.

| Grupo | Garantía |
|---|---|
| Tablón (7 tests) | hoja de ANÁLISIS (categoría exacta) · breadcrumb `ANÁLISIS > Tablón de Noticias` sin módulo falso · fuera del mapa de hubs y de TECHNICAL_VIEW_IDS · keyword `tablón` retirada del hub · roles históricos del tab preservados (deep-link universal) · palette disponible para admin/encargado/clerk · unicidad (sin duplicación) |
| Ofertas (5) | acción palette con ruta directa `ofertas` · breadcrumb `OPERACIÓN > Ventas > Ofertas` · NO es hoja de sidebar (patrón hub) · móvil activa tab Vender · Cotizaciones NO absorbida |
| Clientes (5) | acción `clientes` → vista `customers` existente (sin tercera implementación) · breadcrumb `OPERACIÓN > Ventas > Clientes` · `IPV_ROUTES['customers']` NO pisado (master lookup intacto) · extensión mobileHide, no hoja · móvil activa tab Vender |
| Conciliación (2) | NO es comando público de palette ni hoja de menú · deep-link funcional con breadcrumb standalone honesto (sin "Módulo No Disponible", VALID_VIEWS intacto) |
| Palette sin pistas falsas (3) | id ≠ view resuelve el ViewType canónico (`accounts-receivable`→`accounts_receivable`, `accounts-payable`→`accounts_payable`) · consultas del mandato (tablón/noticias/ofertas/clientes) con candidato correcto y conciliación SIN comando · "caja" sigue resolviendo UNA acción |
| Hub sin Tablón (2) | management-hub sigue alcanzable + Vitrina descubrible · ninguna de las 4 vistas cae en "Módulo No Disponible" |

La línea base del suite era 2.164 (cierre 1.4R.1) → 2.200 actuales (+36: tests FASE B y
adjustes acumulados del repo), **cero regresiones**.

## 3. Nota sobre `next build` (misma limitación que GATE 1.4R y 1.4R.1)

- Comando: `NODE_OPTIONS="--max-old-space-size=4096" npx next build` (idéntico al paso "Build" de CI).
- **Exit code: 137** — `Killed` durante "Creating an optimized production build...".
- Causa (dmesg): `Out of memory: Killed process 3989 (next-build) ... anon-rss:1635476kB` —
  el kernel del host (4GB sin swap, constraint de contenedor) mata el proceso. Intento
  realizado con el dev server levantado; en GATE 1.4R.1 también OOM funcionó con el dev
  server parado y ambos motores (Turbopack/webpack) → **limitación de entorno, no del código**.
- Cobertura equivalente de compilación: (a) `tsc --noEmit` limpio sobre todo el proyecto;
  (b) suite vitest completa en verde (2.200 tests que importan/compilan los módulos);
  (c) compilación runtime del dev server sirviendo TODAS las vistas modificadas, verificada
  por navegador real en 5 viewports (05-browser-verification.md).
- **CI lo valida**: `.github/workflows/ci.yml` — job "TypeCheck + Lint + Unit Tests + Build"
  ejecuta `bunx tsc --noEmit`, `bun run lint`, `bun run test` y
  `NODE_OPTIONS="--max-old-space-size=4096" bun run build`; tras el push se verifica el run.

## 4. Validación CI del commit FASE B (`7a6a196c`) — verificada post-push

Run "CI" (35681428433) — job **TypeCheck + Lint + Unit Tests + Build → SUCCESS**:

| Paso CI | Conclusión |
|---|---|
| TypeCheck (`bunx tsc --noEmit`) | success |
| Lint | success |
| Unit tests | success |
| **Build** (`NODE_OPTIONS=4096 bun run build`) | **success** |

Job "Security Audit" → success (BOLA contract, secret scan, security contract estático).
Run "Test Coverage" (35681428471) → **success**.

Conclusión: el paso **Build pasa en CI con la misma configuración** que localmente recibió
SIGKILL del kernel — confirma que el exit 137 local es **exclusivamente la limitación de
memoria del host** (4GB sin swap), no del código. Todos los gates de CI del commit FASE B
en verde. (Nota: la conclusión a nivel de run figura "cancelled" por preempción de la
plataforma, pero las conclusiones de los tres jobs que la componen son success.)
