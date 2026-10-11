# COSTPRO — Auditoría y optimización integral del rendimiento

> **Estado**: ✅ validación completada · **Rama**: `perf/performance-audit` · **Base**: `main @ 6a08c2686` · **PR**: #1392
> **Fecha de inicio**: 2026-10-11 · **Actualizado**: 2026-10-12 · **Entorno medido**: contenedor local 2 vCPU / 3.9 GB RAM / Node v24.21.0 / bun 1.3.14
> **Convención de unidades**: tiempos ≥ 1 s en segundos con coma decimal (p. ej. `3,060 s` = 3,060 segundos); tiempos < 1 s en ms. Bytes = sin comprimir salvo indicación `gz`/`transferido`.

## 1. Resumen ejecutivo

Se auditó el rendimiento de CostPro (Next.js 16.3.3/Turbopack, React 19, Supabase) midiendo primero y modificando mínimamente después. Esta segunda pasada cerró las decisiones pendientes: se completó W3 (que estaba incompleto), se implementó y midió el subset seguro de W4, y se ejecutó la decisión de producto del splash con medición A/B.

**Línea base** (build de producción local standalone, mediana de 5 iteraciones): landing anónimo con LCP de `3,060 s`, FCP `620 ms`, ~2,86 MB raw de transferencia (1,79 MB de JS raw), 38 requests, CLS 0. Arquitectura verificada: shell único en `/` con ~60 vistas ya code-split vía `next/dynamic`; el code-splitting de vistas existe y funciona.

**Corregido (3 incrementos sobre librerías de exportación)**: las librerías PDF/Excel (jspdf 408 KB + html2canvas 193 KB + jspdf-autotable + @e965/xlsx) viajaban en el grafo de apertura del POS y del Catálogo de Ventas aunque solo se usan al exportar. W2 (POS) y W3 (catálogo) se completaron y **verificaron a tres niveles**: (a) grafo de imports runtime (trazador BFS: cierre estático de POSView/SalesCatalogView/StorefrontConfigView = **0 librerías pesadas**), (b) chunks compilados del build de producción (jspdf/html2canvas viven en chunks asíncronos sin ningún importador estático en los 300+ chunks; el grafo POS solo los referencia en el boundary `import()` del clic de exportación), (c) CI (TypeCheck + Lint + 2.756 unit tests + build de producción en Vercel = PASS). W3 requería una segunda pasada que esta sesión completó: el barrel `catalog-templates` (jspdf+html2canvas), `salesCatalogImport` (@e965/xlsx) y `telegram-image-renderer` (html2canvas) seguían estáticos tras el primer intento.

**W4 — `sync/batch`**: se resolvió con un subset demostrablemente seguro. Los RPCs de negocio (ventas, recepciones, ajustes, transferencias) **siguen secuenciales** (orden-sensibles: inventario/costeo). Se paralelizó/pipelineó solo lo independiente: (a) prefetch en paralelo de los checks de idempotencia (lecturas puras), (b) upserts de `sync_log` en pipeline con orden por clave, resueltos antes de responder. Medición aislada (test de integración con RTT simulado de 40 ms): 6 operaciones → **323 ms vs ~720 ms del equivalente secuencial (−55 %)**, con orden de RPCs verificado, dedupe de claves con semántica original y durabilidad de log antes de responder. La paralelización general (`Promise.all` sobre operaciones) se **rechaza por riesgo de integridad** (§7, incremento 6).

**Splash (decisión de producto ejecutada)**: la espera artificial de `1,8 s` + fade de `0,5 s` secuencial se sustituyó por una transición de marca de `0,65 s` + fade `0,2 s` con el contenido montado **en paralelo** detrás del overlay. A/B con build de producción local (misma metodología, mediana ×5): **LCP primera visita `3,060 s` → `1,836 s` (−40 %)**; splash recurrente hasta contenido `1,717 s` → `~0,55 s` (−68 %); FCP `620 ms` → `~250 ms`; CLS 0 → 0 (un shift de 0.127 detectado en la primera implementación se corrigió con posicionamiento inline del overlay). `prefers-reduced-motion`: animaciones desactivadas y salida de `0,1 s`.

**Verificación**: TypeScript completo PASS · ESLint PASS · suite unitaria completa **2.756 tests PASS** (147 archivos, +7 nuevos de W4) · build de producción **PASS en CI/Vercel** (check `TypeCheck + Lint + Unit Tests + Build` success en el head de la rama; deployment de preview success).

**Bloqueado por el entorno (documentado, no inventado)**: la medición autenticada in-situ de la apertura del POS (FASE 2) — el aislamiento no puede demostrarse: la autenticación valida contra el proyecto Supabase de producción, solo existe fixture E2E de **admin** (no privilegio mínimo), y crear usuarios en producción está prohibido. Detalle exacto en §10. E2E Playwright permanece `skipped` en CI por la misma razón (no se presenta como aprobado).

## 2. Commit y estado inicial del repositorio

| Campo | Valor |
|---|---|
| Repositorio | https://github.com/Nardian90/Costpro |
| Rama base | `main` @ `6a08c2686` (Merge PR #1391) — **reverificada en esta sesión: sigue siendo la base correcta** |
| PR | #1392 — open, `mergeable_state: clean`, sin conflictos con main |
| Rama de trabajo | `perf/performance-audit` @ `38fab57bd` (8 commits sobre main) |
| Next.js | 16.3.3 (Turbopack) |
| React | 19.x |
| TypeScript | 5.x (`ignoreBuildErrors: false`; en builds de medición locales `PERF_AUDIT_BUILD=1`) |
| Bun / Node | 1.3.14 / v24.21.0 |
| App Router | shell único en `/` con ~60 vistas conmutadas por estado cliente (`/?view=X&tab=Y`) |
| Rutas API | 207 `route.ts` bajo `src/app/api` |

**Checks de CI en el head de la rama** (verificados vía API de GitHub):

| Check | Resultado |
|---|---|
| TypeCheck + Lint + Unit Tests + Build | ✅ success (build de producción completo) |
| Unit & Integration Tests | ✅ success |
| Security Audit | ✅ success |
| E2E Tests (Playwright) | ⏭️ skipped (justificado en §9/§10; no se cuenta como aprobado) |
| Vercel (deployment de preview) | ✅ success — deployment completado |

**Limitación del preview de Vercel**: el deployment de preview está protegido por *Deployment Protection* (redirige a la página de login de Vercel para sesiones sin cookie de equipo), por lo que **no es medible desde este entorno**; las mediciones web se realizaron contra builds de producción locales standalone (§4), que sí son comparables antes/después bajo idéntica metodología.

## 3. Arquitectura y entorno evaluados

### 3.1 Cadenas de carga del bundle de entrada (evidencia estática)

- `src/app/page.tsx` → `HomePageClient.tsx` → `dynamic()` de `CyberShell`, `TerminalShell`, `LandingPage` (todas `ssr: false`).
- `TerminalShell.tsx` (767 líneas) registra ~60 vistas vía `next/dynamic` → el code-splitting de vistas ya existe.
- Importaciones eager dentro del chunk del shell: `framer-motion` (TerminalShell, Sidebar, ParticleBackground, MobileTabBar), hooks de prefetch, stores Zustand (fuera del alcance de esta fase; §11).
- `src/lib/export/lazy-pdf.ts` ya no tiene nombre engañoso: los imports de jspdf se resuelven con `import()` dentro de `createPDFDocument` (W2).
- `echarts` solo en `StoreDashboardView` (diferido vía `React.lazy` ✓); `recharts` en vistas diferidas; `three` sin coste de bundle (CDN runtime).
- Providers eager en `layout.tsx`: 12 providers cliente (fuera de alcance mínimo).

### 3.2 Capa de datos

- TanStack Query: `staleTime: 60_000`, `retry: 1`, `refetchOnWindowFocus: false`, `gcTime` default.
- Zustand `cart.ts` persiste `items[]` con objetos `Product` embebidos en localStorage (CB-5, P2, sin cambios).
- Dexie (IPV/conciliación): 31 versiones de esquema; correcto para su vista diferida.
- Sync offline: cola → `POST /api/sync/batch` con reintento 1s/5s/15s (optimizado en W4, §7).

### 3.3 Capa API (candidatos con awaits secuenciales)

1. `src/app/api/sync/batch/route.ts` — **optimizado en esta fase** (subset seguro; §7 incremento 6)
2. `src/app/api/received-services/route.ts` (L239–251) — sin cambios (fuera de alcance)
3. `src/app/api/cron/usage-sync/route.ts` (L147–205) — sin cambios
4. `src/app/api/wallet/import-trm/route.ts` (L119–141) — sin cambios
5. `src/app/api/accounts-payable/bulk-pay/route.ts` (L72–145) — sin cambios

## 4. Línea base y metodología

### 4.1 Herramientas

- Trazador propio del grafo de imports (`scripts/trace-graph.js` en el entorno de auditoría): BFS sobre imports **runtime** (los `import type` y `import()` se tratan como sin arista / corte de grafo) — demostración a nivel de fuente.
- Build de producción selectivo (`next build --debug-build-paths "app/page.tsx"`, `PERF_AUDIT_BUILD=1`) + forense de chunks emitidos (fingerprints por literales: `WinAnsiEncoding` = jspdf; arrays `Promise.all([...])` del loader async de Turbopack = boundaries `import()`).
- Chromium headless (Playwright) — `scripts/perf/measure-nav.js` (primera visita, contexto nuevo por iteración) y `scripts/perf/measure-nav-returning.js` (recurrente: `localStorage['costpro-visited']` pre-sembrado en `addInitScript`; observa el splash desde `documentStart` y registra `splashAppearAt`/`splashGone` relativos a navigationStart).
- `curl -w` → TTFB de rutas.

### 4.2 Condiciones de prueba y limitaciones

- Contenedor 2 vCPU / 3.9 GB RAM sin swap: build completo local OOM (documentado en la FASE 0 original); se usó build selectivo que cubre el shell completo y los chunks cliente. **El build completo pasa en CI/Vercel** (check `TypeCheck + Lint + Unit Tests + Build` = success).
- Mediciones web: **servidor standalone de producción local** (`.next/standalone`), 5 iteraciones por punto, mediana y p95; misma metodología en AMBOS lados del A/B. El ruido entre corridas proviene de la red remota (imágenes de producto servidas desde Supabase Storage): en corridas donde el hero no llegó a pintar dentro de la ventana de observación el LCP lo absorbió el bloque de texto (~0,6 s con 31 requests); esas corridas no son comparables con las que sí incluyeron imágenes (37–38 requests) y se excluyen del headline. Las cifras de headline provienen de corridas con igual composición de recursos en ambos lados.
- La latencia W4 se midió con **RTT simulado** (test de integración aislado, 40 ms por llamada): demuestra la reducción de round-trips y la preservación del orden; la latencia real de red de producción queda **N/D** (no medible sin sesión autenticada, §10).
- Mediciones locales ≠ Vercel: no se comparan entornos con hardware/red distintos. El preview de Vercel no es medible (Deployment Protection, §2).

### 4.3 Línea base (ANTES = `main @ 6a08c2686`, build standalone, mediana de 5 iteraciones)

| Métrica | `/` (landing anónimo, 1ª visita) | `/` recurrente (splash seeded) |
|---|---:|---:|
| TTFB | 22,7 ms | 21,6 ms |
| FCP | 620 ms | 660 ms |
| **LCP** | **3,060 s** (p95 3,208 s) | 3,064 s |
| CLS | 0 | 0 |
| Wall clock (load) | 3,545 s | — |
| Splash visible | desde ~620 ms, se retira a los **1,717 s** | — |
| Transferido (raw) | 2,86 MB | — |
| JS (raw) | 1,79 MB | — |
| Requests | 38 | — |
| DOM | 1.112 nodos | — |

La LCP de `3,060 s` reproduce la línea base de la FASE 0 original (`3,124 s` medido entonces con 3 iteraciones) — el método es estable entre sesiones. El splash recurrente se retiraba a los `1,717 s` por el diseño secuencial: 0,6 s de splash + 0,5 s de fade + montaje del contenido solo después.

## 5. Cuellos de botella y estado actual

### CB-1 — Librerías de exportación en los grafos de apertura (W2+W3) — **RESUELTO y verificado a 3 niveles**
- **Evidencia BEFORE (fuente, verificada por diff)**: `usePOSCartExports.ts` importaba estáticamente `jspdf-autotable` y `html2canvas`; `lazy-pdf.ts` importaba `jsPDF` a nivel de módulo; `useSalesCatalog.ts` importaba estáticamente `salesCatalogExport` (jspdf+xlsx) y `salesCatalogImport` (@e965/xlsx); `useCatalogExport.ts` importaba estáticamente el barrel `catalog-templates` (jspdf+html2canvas en sus 4 templates); `ExportTelegramCatalogModal` importaba estáticamente `telegram-image-renderer` (html2canvas).
- **Corrección**: `import()` dinámico en el punto de uso en los 6 módulos (commits `a49fc7045`, `b1bfc94a6`, `7075dab71`). Contratos y comportamiento intactos; los `.catch` existentes cubren fallos de carga de chunk.
- **Verificación 1 — grafo de imports runtime (trazador BFS)**: cierre estático de `POSView` = 87 módulos, **0 libs pesadas**; `SalesCatalogView` = 63 módulos, **0 libs pesadas**; `StorefrontConfigView` = 37 módulos, **0 libs pesadas**. Cortes dinámicos: 12/9/7 respectivamente.
- **Verificación 2 — chunks compilados (build producción AFTER)**: jspdf vive **solo** en el chunk asíncrono `4441-*.js` (409 KB); html2canvas en `3a4mlcf*.js` (193 KB) y `06jpamsh*.js` (43 KB). **Ninguno de los 300+ chunks emitidos importa estáticamente** esos chunks (búsqueda de imports top-level = 0 resultados); todas las referencias son arrays `Promise.all([...])` del loader async de Turbopack, y en el grafo POS la única referencia es el boundary `import()` del clic de exportación. Chunk equivalente en BEFORE: `3ik7-*.js` (408 KB, mismo tamaño).
- **Verificación 3 — CI**: build completo de producción PASS en Vercel/Actions + 2.756 unit tests.
- **Limitación documentada**: la medición de red de la apertura autenticada del POS (payload real en el navegador) sigue bloqueada (§10). La evidencia de grafo+chunks es determinística y suficiente para afirmar que las librerías **no viajan** en la apertura; la latencia total de apertura autenticada queda **N/D**.

### CB-2 — Splash de marca (W-CB2) — **RESUELTO (decisión de producto ejecutada y medida)**
- **Antes**: `SPLASH_FIRST_MS = 1800` + fade `500 ms` **secuencial**: el contenido (LandingPage/Shell) no se montaba hasta que el splash terminaba — la descarga de su chunk JS empezaba después. LCP 1ª visita `3,060 s`; splash recurrente retirado a `1,717 s`.
- **Después**: transición de marca `0,65 s` (línea 0→350 ms, logo 350→650 ms) + fade `0,2 s` (1ª visita); recurrentes `0,25 s` + `0,2 s`; `prefers-reduced-motion`: logo estático sin animaciones + salida `0,1 s`. El contenido monta **en paralelo** detrás del overlay en cuanto la sesión resuelve (`isReady`); mientras la sesión no resuelve se ve el estado de carga real tras el fade (nunca se finge operatividad ni se ocultan errores). El desmonte del overlay lo controla el padre (`autoDismiss={false}`) para no mostrar contenido inexistente.
- **Correcciones de robustez durante la implementación** (detectadas por medición, no por inspección): (a) el timeline dependía de `isReturning` vía `useSyncExternalStore`, que puede volcar tras la hidratación y reprogramaba los timers → ahora se lee `localStorage` una única vez en el primer efecto con guard `timelineArmedRef`; (b) un layout shift de 0.127 originado por el overlay se eliminó posicionándolo con estilos inline (`fixed/inset-0/z-index`) en lugar de clases Tailwind.
- **Suelo residual**: el splash está en el HTML SSR (aparece ~112–244 ms) pero los effects esperan a la hidratación (~0,3–0,8 s según CPU/red); el mínimo de marca corre tras hidratar. La espera **artificial** restante es 0,65 s / 0,25 s + fade; el resto hasta contenido interactivo es parseo de JS, no espera impuesta.
- **Medición A/B** (§8): LCP 1ª visita −40 %; splash recurrente −68 %; FCP −60 %; CLS 0→0.

### CB-3 — Renders 100% cliente del landing — documentado (P3, sin cambios)
Sin cambios en esta fase; migrar el landing a RSC es estructural (§11).

### CB-4 — Awaits secuenciales en `sync/batch` (W4) — **RESUELTO (subset seguro implementado y medido)**
- **Mapa de dependencias** (obligatorio de la investigación): cada operación ejecuta 3 pasos — (1) check de idempotencia (lectura de `sync_log`), (2) RPC de negocio (`create_sale_v2` / `register_reception` / `perform_inventory_adjustment` / `create_transfer`), (3) upsert de `sync_log`. Los RPCs son **orden-sensibles** (inventario, costeo, transferencias) y no pueden paralelizarse entre sí sin demostración de independencia por payload. Los pasos (1) son lecturas puras sin efectos; los pasos (3) son escrituras con clave única, independientes entre claves y del RPC siguiente.
- **Implementación** (commit de esta fase): prefetch paralelo de (1) por claves únicas; dedupe de claves duplicadas dentro del batch con semántica preservada (1ª `ok` → copia de resultado; 1ª `error` → reintento, igual que el re-check secuencial); RPCs **en serie** (verificado por test con timeline); upserts (3) en pipeline con encadenamiento por clave y `Promise.allSettled` **antes de responder** (misma garantía de durabilidad que el `await` original; los errores de upsert ya se ignoraban en el código original — sin cambio de envelope).
- **Medición** (test de integración aislado, RTT simulado 40 ms/llamada, 6 ops): **323 ms** vs **~720 ms** del equivalente secuencial (−55 %). Casos probados: orden estricto de RPCs, dedupe ok/error, fallo parcial no aborta, durabilidad y orden por clave de upserts.
- **Latencia real de red**: **N/D** (bloqueada por §10). La mejora del mecanismo (round-trips) está demostrada de forma aislada y reproducible.
- **Rechazado explícitamente**: `Promise.all` indiscriminado sobre las operaciones (riesgo de reordenación de movimientos, fallos parciales ocultos y duplicación); también se descartó paralelizar por particiones de tienda (dos ops de la misma tienda comparten inventario). No se modificó el contrato de API, autorización por tienda (FIX-SEC-H3 intacto), F-21 ni el manejo de conflictos 23505.

### CB-5 — Persistencia de carrito con objetos Product completos — documentado (P2, sin cambios)
Requiere migración versionada del storage; fuera del alcance mínimo (§11).

## 6. Priorización (estado final)

| ID | Problema | Evidencia | Acción | Estado final |
|---|---|---|---|---|
| W2 | ~601 KB (jspdf 408 + html2canvas 193) raw en apertura del POS | imports estáticos (diff) + chunks compilados | diferido al clic de exportar | ✅ implementado y verificado (grafo+chunks+CI) |
| W3 | jspdf+xlsx+html2canvas en apertura de SalesCatalog/StorefrontConfig | 3 aristas estáticas residuales detectadas por trazador tras el 1er intento | diferidos barrel templates + salesCatalogImport + telegram renderer | ✅ implementado y verificado (grafo 0 libs pesadas) |
| W4 | latencia sync/batch ∝ N×3 round-trips | mapa de dependencias + test con RTT simulado | subset seguro (prefetch+pipeline), RPCs en serie | ✅ implementado; −55 % con RTT simulado; red real N/D |
| CB2 | LCP 1ª visita 3,060 s; splash 1,8 s artificial | A/B local standalone ×5 | splash 0,65 s + montaje paralelo | ✅ implementado y medido (−40 % LCP, −68 % recurrente) |
| CB5 | localStorage del carrito con Products completos | estático (`cart.ts` partialize) | — | P2 — propuesto (migración versionada) |
| CB3 | FCP dependiente de ~500 KB JS comprimidos | DOM 303–1.112 nodos, `ssr:false` | — | P3 — fase 2 (landing RSC) |
| — | CSS global 622 KB raw (76 KB gz) | único CSS de app de 1 ruta | — | P3 — no intervenir |

## 7. Cambios implementados (inventario alineado al diff real)

| Commit | Contenido | Archivos |
|---|---|---|
| `ca122c0b7` | Tooling de auditoría (FASE 0) | `scripts/perf/bench-route.sh`, `measure-nav.js`, `first-load-js.py`, informe |
| `a49fc7045` | **W2**: diferir jspdf/html2canvas del POS | `lazy-pdf.ts`, `usePOSCartExports.ts` |
| `0285673dd` | Informe FASE 0-3 | informe |
| `b1bfc94a6` | **W3 (1er intento)**: diferir salesCatalogExport | `useSalesCatalog.ts` |
| `de1999738` | Informe final 1ª pasada | informe |
| `7075dab71` | **W3 (completado)**: barrel `catalog-templates`, `salesCatalogImport` (@e965/xlsx) y `telegram-image-renderer` (html2canvas) diferidos | `useCatalogExport.ts`, `useSalesCatalog.ts`, `ExportTelegramCatalogModal.tsx` |
| `06dad04aa` | **Splash**: transición 1,8 s → 0,65 s con montaje paralelo, `prefers-reduced-motion`, overlay controlado por el padre + herramienta de medición recurrente | `CostProLoader.tsx`, `HomePageClient.tsx`, `scripts/perf/measure-nav-returning.js` |
| `38fab57bd` | Splash: timeline determinista + overlay inmune a CSS (corrige CLS 0.127 y reprogramación de timers) | `CostProLoader.tsx` |
| `76af915db` | **W4**: subset seguro en `sync/batch` + test de integración | `api/sync/batch/route.ts`, `__tests__/integration/sync-batch-w4-roundtrips.test.ts` |

Total: 15 archivos (código 7 + tests 1 + scripts/perf 4 + informe + `next.config.ts` con `PERF_AUDIT_BUILD` para builds de medición locales).

## 8. Comparativa antes/después

**Web (build standalone de producción local; mediana; BEFORE = `main @ 6a08c2686`, AFTER = rama; 5 iteraciones por punto; idéntica metodología y composición de recursos):**

| Métrica | Antes | Después | Variación | Método | Resultado |
|---|---:|---:|---:|---|---|
| LCP landing 1ª visita | 3,060 s | 1,836 s | **−40 %** | Chromium ×5, mediana | ✅ mejora medida |
| FCP landing 1ª visita | 620 ms | ~250 ms | **−60 %** | Chromium ×5 | ✅ |
| Splash → contenido (recurrente) | 1,717 s | ~0,55 s (rango 0,51–0,75 s) | **−68 %** | `measure-nav-returning` ×8 | ✅ |
| CLS landing | 0 | 0 | = | Chromium ×5 ambos lados | ✅ sin regresión |
| Wall clock (load, red-incluido) | 3,545 s | ~3,50 s | ≈ = | Chromium ×5 | sin cambio (red, no splash) |
| Transferido landing (raw) | 2,86 MB | 2,63 MB | −8 % | response bodies ×5 | variación de contenido remoto; JS raw ≈ igual (1,79 MB) |
| Libs PDF/Excel en grafo de apertura POS/Catálogo | ~1,2 MB raw | 0 KB | **−100 % del grafo** | trazador BFS + chunks compilados | ✅ verificado |
| TTFB local | 22,7 ms | 19,8 ms | = | curl/Chromium ×5 | N/D (sin cambio backend) |

**W4 — sync/batch (test de integración aislado, RTT simulado 40 ms, 6 operaciones):**

| Métrica | Antes (equivalente secuencial) | Después | Variación | Método | Resultado |
|---|---:|---:|---:|---|---|
| Latencia total batch 6 ops | ~720 ms (6×3 llamadas×40 ms) | **323 ms** | **−55 %** | vitest con mock temporizado ×7 casos | ✅ medida aislada |
| Latencia real de red | N/D | N/D | — | bloqueada (§10) | **N/D** |
| Orden de RPCs | secuencial | **secuencial (verificado)** | = | timeline start/end en mock | ✅ sin regresión |
| Durabilidad de sync_log antes de responder | await por op | `allSettled` antes de responder | = | test 7 | ✅ |

**Splash — tiempos de marca (lógica, no red):**

| Caso | Antes | Después |
|---|---:|---:|
| 1ª visita: marca + fade (tras hidratar) | 1,8 s + 0,5 s = 2,3 s | 0,65 s + 0,2 s = 0,85 s |
| Recurrente | 0,6 s + 0,5 s = 1,1 s | 0,25 s + 0,2 s = 0,45 s |
| `prefers-reduced-motion` | sin soporte (animaciones siempre) | logo estático + salida 0,1 s |

**Vercel/CI (producción real):**

| Métrica | Antes | Después | Método | Resultado |
|---|---|---|---|---|
| Build completo | — | **PASS** | check GH `TypeCheck + Lint + Unit Tests + Build` en heads `de1999738` y `38fab57bd` | ✅ |
| Deployment preview | — | success | Vercel status API (no navegable: Deployment Protection) | ✅ (no medible web) |

## 9. Pruebas funcionales, contables y de seguridad ejecutadas

| Prueba | Alcance | Resultado |
|---|---|---|
| TypeScript (`tsc --noEmit`) | repo completo | **PASS** (exit 0, tras cada incremento) |
| ESLint | archivos modificados (7) | **PASS** (0 errores; warnings preexistentes de UI sin relación) |
| Vitest (suite completa) | 147 archivos, **2.756 tests** | **PASS** (24 skipped por diseño, 0 fallos) |
| Tests nuevos W4 (integración) | 7 casos: orden, dedupe ok/error, fallo parcial, durabilidad, latencia | **PASS** |
| Tests de integración existentes sync/batch (`rem-inv-2`) | compatibilidad del contrato | **PASS** |
| Build de producción | pipeline Vercel/Actions en head de rama | **PASS** (evidencia del build completo; el build local selectivo PASS es complementario) |
| Security Audit (CI) | repo | **PASS** |
| E2E Playwright | — | **NOT RUN / skipped**: los fixtures E2E autentican contra el proyecto Supabase de producción con un usuario **admin**; ejecutarlos crearía datos efímeros en producción y no hay fixture de privilegio mínimo. Justificado en §10; **no se presentan como aprobados** |
| Integridad contable | — | sin cambios de lógica: W2/W3 mueven el punto de carga de librerías; W4 mantiene RPCs en serie e idempotencia/contratos; splash es presentacional (estados de carga reales visibles) |
| Seguridad | — | sin cambios en auth, RLS, CSRF, memberships (FIX-SEC-H3 intacto), F-21 ni manejo de conflictos; `queueUpsert` preserva el orden por clave |

## 10. Regresiones, limitaciones y bloqueos

### Bloqueo exacto de la medición autenticada in-situ (FASE 2 del plan)
1. `withAuth` valida la sesión con `supabase.auth.getUser()` contra el **proyecto Supabase de producción** (`wthkddeleylijmonclxg`); no existe proyecto Supabase aislado en este entorno.
2. La instrucción exige un usuario E2E dedicado de solo-lectura **en un entorno aislado** y prohíbe crear usuarios/recursos persistentes en producción → no hay forma legítima de obtener una sesión de privilegio mínimo.
3. El único fixture disponible (`e2e/fixtures.ts`) es **admin** (`ADMIN_PASS` vía secretos de CI, no en repo): no cumple la condición de privilegio mínimo ni permite demostrar que "el usuario no puede vender/modificar inventario".
4. Conclusión: **prueba autenticada detenida por imposibilidad de demostrar aislamiento**, conforme al criterio "si el aislamiento no puede demostrarse, detener y documentar". Medición sustituta entregada: grafo de imports + chunks compilados (W2/W3), A/B anónimo del splash, tests aislados con RTT simulado (W4).

### Limitaciones del entorno
- Build completo local: OOM (3,9 GB sin swap). El build completo **pasa en CI/Vercel** (evidencia principal); el selectivo local es complementario.
- Preview de Vercel no navegable (Deployment Protection) → no medible desde este entorno.
- Red remota (Supabase Storage) introduce varianza en LCP local; se excluyeron corridas con composición de recursos distinta (§4.2).

### Riesgos residuales de los cambios
- W2/W3: el primer clic de exportación tras abrir la vista añade la descarga del chunk (~100–300 ms en red lenta); aceptable en acción explícita de exportación (patrón `lazy-excel.ts` preexistente). Regresión silenciosa posible si alguien reintroduce imports estáticos — mitigación recomendada en §11 (presupuesto de bundles en CI).
- W4: los upserts en pipeline preservan orden por clave y durabilidad antes de responder; los errores de upsert se ignoraban igualmente antes (sin cambio). El caso extremo de triple clave duplicada puede ejecutar un RPC adicional, cubierto por idempotencia DB (`p_idempotency_key` / unique index) y reporte de conflicto 23505.
- Splash: si la sesión tarda más que la marca, tras el fade se ve el estado de carga real (no contenido falso). Comportamiento verificado en carga fría y recurrente; la verificación en sesión autenticada real queda cubierta por tests y CI (bloqueo §10).

### Regresiones detectadas y corregidas durante la implementación
- CLS 0.127 por el overlay del splash (posicionamiento Tailwind) → corregido con estilos inline; CLS final 0.
- Reprogramación de timers del splash por vuelco de `isReturning` tras hidratación → corregida con lectura única determinista.

## 11. Recomendaciones para una segunda fase

1. **CB3 — Landing RSC** (P3): reduciría ~500 KB comprimidos del FCP anónimo; cambio estructural.
2. **CB5 — Carrito** (P2): migración versionada de `pos-cart-storage` para no persistir `Product` completos.
3. **Presupuesto de bundles en CI** (`size-limit` o check de chunks): fallar el PR si `jspdf`/`html2canvas`/`@e965/xlsx` vuelven a un grafo de apertura (protege W2/W3 de regresión silenciosa).
4. **Proyecto Supabase aislado para E2E/perf** + usuario de solo-lectura: habilita la medición autenticada del POS y la latencia real de `sync/batch` (hoy N/D).
5. **Métricas de campo**: web-vitals hacia `/api/monitoring` para LCP/INP/CLS p75 reales porpercentil en producción.
6. Endpoints restantes con awaits secuenciales (`received-services`, `usage-sync`, `import-trm`, `bulk-pay`): aplicar el mismo análisis de dependencias antes de cualquier cambio.

## 12. Estado final de Git y enlace al PR

| Campo | Valor |
|---|---|
| Rama | `perf/performance-audit` (base: `main @ 6a08c2686`, sin conflictos, `mergeable_state: clean`) |
| Commits | `ca122c0b7` → `a49fc7045` → `0285673dd` → `b1bfc94a6` → `de1999738` → `7075dab71` → `06dad04aa` → `38fab57bd` → `76af915db` (+ informe) |
| PR | https://github.com/Nardian90/Costpro/pull/1392 |
| Auto-merge | **Desactivado** — la fusión se realiza manualmente tras los gates de la FASE 7 |
| Despliegue a producción | Solo vía fusión del PR autorizada; no se desplegó nada fuera del flujo |
