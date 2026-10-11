# COSTPRO — Auditoría y optimización integral del rendimiento

> **Estado**: 🚧 en progreso · **Rama**: `perf/performance-audit` · **Base**: `main @ 6a08c2686`
> **Fecha de inicio**: 2026-10-11 · **Entorno medido**: contenedor local 2 vCPU / 3.9 GB RAM / Node v24.21.0 / bun 1.3.14

## 1. Resumen ejecutivo

_(se completará al finalizar las fases de medición e implementación)_

## 2. Commit y estado inicial del repositorio

| Campo | Valor |
|---|---|
| Repositorio | https://github.com/Nardian90/Costpro |
| Rama base | `main` @ `6a08c2686` (Merge PR #1391: void legacy limpia vínculos de OT) |
| Árbol de trabajo al inicio | limpio, sincronizado con `origin/main` |
| Next.js | 16.3.3 (Turbopack) |
| React | 19.x |
| TypeScript | 5.x (`ignoreBuildErrors: false`) |
| Bun / Node | 1.3.14 / v24.21.0 |
| Despliegue de referencia | https://costpro4.vercel.app/ |
| App Router | shell único en `/` con ~60 vistas conmutadas por estado cliente (`/?view=X&tab=Y`) |
| Rutas API | 207 `route.ts` bajo `src/app/api` |
| Server Actions | 0 (todas las mutaciones son route handlers con `withAuth`/`withRole`) |

## 3. Arquitectura y entorno evaluados

### 3.1 Cadenas de carga del bundle de entrada (evidencia estática)

- `src/app/page.tsx` → `HomePageClient.tsx` → `dynamic()` de `CyberShell`, `TerminalShell`, `LandingPage` (todas `ssr: false`).
- `TerminalShell.tsx` (767 líneas) registra ~60 vistas vía `next/dynamic` → el code-splitting de vistas ya existe.
- **Importaciones eager dentro del chunk del shell**: `framer-motion` (TerminalShell L24, Sidebar L17, ParticleBackground L5, MobileTabBar), hooks de prefetch, stores Zustand.
- **`jspdf` + `jspdf-autotable` + `html2canvas` viajan eager en el chunk de la vista POS**: `pos/usePOSCartExports.ts` L3/L5 ← `POSCart.tsx` L28 ← `POSView.tsx` L29.
- `src/lib/export/lazy-pdf.ts` tiene nombre engañoso: importa `jspdf` estáticamente a nivel de módulo (L1–2).
- `echarts` solo en `StoreDashboardView` (diferido vía `React.lazy` ✓); `recharts` en 14 archivos, todos dentro de vistas diferidas; `xlsx` correctamente diferido (`lazy-excel.ts` ✓); `three` sin coste de bundle (carga runtime desde CDN).
- Providers eager en `layout.tsx`: 12 providers cliente (QueryProvider, SyncProvider, GlobalSessionManager, ServiceWorkerRegister, etc.).

### 3.2 Capa de datos

- TanStack Query: `staleTime: 60_000`, `retry: 1`, `refetchOnWindowFocus: false`, **`gcTime` no configurado** (default 5 min).
- Zustand `cart.ts` (1358 líneas): **persiste el array completo `items[]` con objetos `Product` embebidos en localStorage** (`partialize` L1267–1284).
- Dexie (IPV/conciliación): 31 versiones de esquema; correcto para su vista diferida.
- Sync offline: cola Dexie/localStorage → `POST /api/sync/batch` con reintento 1s/5s/15s.

### 3.3 Capa API (candidatos con awaits secuenciales verificados)

1. `src/app/api/sync/batch/route.ts` (L74–186) — bucle por operación secuencial
2. `src/app/api/received-services/route.ts` (L239–251) — flujo void secuencial
3. `src/app/api/cron/usage-sync/route.ts` (L147–205) — bucle por tenant con `verifyAuth` dentro
4. `src/app/api/wallet/import-trm/route.ts` (L119–141) — upserts fila a fila
5. `src/app/api/accounts-payable/bulk-pay/route.ts` (L72–145) — por documento en bucle

## 4. Línea base y metodología

### 4.1 Herramientas

- Build de producción (`next build`) → First Load JS por ruta (evidencia estática de bundles)
- `@next/bundle-analyzer` (`ANALYZE=true`, ya presente en el repo)
- Chromium headless (Playwright, ya instalado) → LCP/CLS/transfer por ruta
- `curl -w` → TTFB/latencia de rutas API calientes

### 4.2 Restricciones del entorno de medición

- Contenedor con 2 vCPU y 3.9 GB RAM **sin swap**: el build de producción requiere gestión de memoria (ver 4.3).
- Mediciones locales ≠ Vercel: se distinguirá siempre el entorno. Los valores absolutos de red local solo sirven para comparaciones antes/después en el mismo entorno.

### 4.3 Resultados de la línea base

**Build de producción (Turbopack, `--debug-build-paths` selectivo por restricción de RAM — ver 4.2)**

| Campo | Valor |
|---|---|
| Build completo (webpack y turbopack) | **BLOCKED en este entorno**: OOM-kill (exit 137) con 3.4 GB disponibles; el worker de type-check necesita >2 GB (mitigado con `PERF_AUDIT_BUILD=1`) y el grafo completo excede la RAM. Vercel compila el build completo sin problema |
| Build selectivo (`app/page.tsx`, `app/tienda/**`, `app/fc/**`) | PASS (exit 0) — cubre el shell completo, layout y providers |
| Chunks cliente emitidos | 301 archivos, 16.0 MB descomprimidos |
| Verificación de tipos | `tsc --noEmit` completo: **PASS** (exit 0) |

**Navegación real con Chromium headless (servidor standalone de producción local, 3 iteraciones, `scripts/perf/measure-nav.js`)**

| Métrica | `/` (landing anónimo) | `/tienda/[slug]` (público) | Nota |
|---|---:|---:|---|
| Wall clock (load) | 3.635 ms | 4.142 ms | incluye splash de marca |
| TTFB | 22 ms | 24 ms | local; Vercel: 0.57–3.1 s (cold/warm) |
| FCP | 712 ms | 742 ms | splash (negro + logo) |
| **LCP** | **3.124 ms** | 1.204 ms | landing: splash 2.3 s + render 0.8 s |
| CLS | 0 | 0 | ✓ |
| Transferido (descomprimido) | 2.86 MB | 2.67 MB | |
| JS transferido (descomprimido) | 1.79 MB | 1.60 MB | ~400-500 KB comprimido |
| Requests | 38 | 34 | |
| Tamaño DOM | 1.112 | 303 | renderizado 100% cliente (`ssr: false`) |

**Composición del JS eager común (atribución forense por literales + fingerprints de librerías)**

| Chunk | Tamaño raw | Contenido identificado |
|---|---:|---|
| `3lx_-tszj5bsl.js` | 229 KB | React-DOM + scheduler |
| `3bo4889wo1m1e.js` | 357 KB | Código app: servicios, esquemas zod (`src/validation/schemas.ts`, 1.136 líneas), localforage, view registry, i18n |
| `3rjvagg7qgsuj.js` | 207 KB | @supabase/supabase-js + realtime (necesario para bootstrap de auth) |
| `3w7f9krtevh-f.js` | 152 KB | Runtime del router de Next.js |
| `3gg011-ccoatp.js` | 132 KB | framer-motion (LandingPage + shell) |
| CSS global `3_b3zh_bnbopc.css` | 622 KB (76 KB gz) | Tailwind v4: utilidades de TODAS las ~60 vistas (app de una sola ruta) |

**Chunks pesados por vista (evidencia estática — correcta code-splitting, cargan al abrir la vista)**

| Chunk | Tamaño | Trigger |
|---|---:|---|
| jspdf | 408 KB | apertura POS (W2 corregido → ahora solo al exportar), SalesCatalog y otras vistas con import estático propio |
| echarts (zrender) | 1.1 MB | vista Dashboard (diferida vía React.lazy ✓) |
| recharts | 332 KB + 4 chunks menores | vistas con gráficos |
| html2canvas | 193 KB | apertura POS (W2 corregido), SalesCatalog/templates |

**Comparativa de referencia contra producción (contexto, no equivalente)**

| Métrica | Local (prod standalone) | Vercel (costpro4.vercel.app) |
|---|---|---|
| TTFB landing | 22 ms | 574–3.115 ms (warm/cold) |
| HTML landing | 88 KB | 22 KB comprimido |

## 5. Cuellos de botella encontrados y evidencias

### CB-1 — Librerías PDF (~600 KB) cargadas al abrir el POS (corregido → W2)
- **Evidencia**: `usePOSCartExports.ts` L4/L6 importaba `jspdf-autotable` y `html2canvas` estáticamente; `src/lib/export/lazy-pdf.ts` L1–2 importaba `jsPDF` a nivel de módulo. En el build, el chunk de jspdf (408 KB, identificado por `WinAnsiEncoding`) era alcanzable desde el grafo de apertura del POS vía `POSCart → usePOSCartExports`.
- **Causa raíz**: imports estáticos de librerías pesadas de exportación dentro del grafo de la vista más frecuente; `lazy-pdf.ts` mal llamado "lazy".
- **Impacto**: +~600 KB JS (descomprimido) en la apertura del POS aunque el usuario nunca exporte.
- **Corrección**: import() dinámico en el punto de uso (commit `a49fc7045`). Contrato y comportamiento preservados.

### CB-2 — Splash de marca bloquea el LCP del landing (documentado, decisión de producto)
- **Evidencia**: `CostProLoader.tsx` — `SPLASH_FIRST_MS = 1800` + fade de 500 ms antes de montar `LandingPage` (el comentario del HomePageClient "first visit ~3.5s" está desactualizado). LCP medido 3.124 ms = splash 2.3 s + render del landing 0.8 s. Usuarios recurrentes: 600 ms + fade (LCP ≈ 1.6–1.8 s, no medible sin cookie de visita).
- **Causa raíz**: retardo de marca intencional antes de renderizar cualquier contenido.
- **Impacto**: LCP "pobre" (>2.5 s) en cada primera visita real; en recurrencia queda en "bueno".
- **No corregido**: es una decisión de producto (branding). Opciones: reducir `SPLASH_FIRST_MS` a ~800 ms, o renderizar el hero del landing tras el splash en lugar del logo. Requiere aprobación del propietario.

### CB-3 — Renders 100% cliente del landing y la tienda (documentado)
- **Evidencia**: `HomePageClient` usa `dynamic(..., { ssr: false })` para CyberShell/TerminalShell/LandingPage; DOM medido de 303–1.112 nodos pese a transferir 1.6–1.8 MB de JS. El HTML no contiene contenido del landing.
- **Causa raíz**: decisión de arquitectura (evitar hidratación del shell pesado); el landing podría ser SSR/RSC sin el shell.
- **Impacto**: FCP depende de descargar+parsear ~500 KB comprimidos de JS antes de pintar contenido real.
- **No corregido en esta fase**: migrar el landing a RSC es un cambio estructural (fuera del alcance mínimo; propuesto para fase 2).

### CB-4 — Awaits secuenciales en endpoints de agregación (propuesto, sin modificar)
- **Evidencia estática**: `api/sync/batch/route.ts` (L74–186, por operación: upsert + RPC secuencial), `api/received-services/route.ts` (L239–251), `api/cron/usage-sync/route.ts` (L147–205), `api/wallet/import-trm/route.ts` (L119–141), `api/accounts-payable/bulk-pay/route.ts` (L72–145).
- **Causa raíz**: bucles `for` con `await` por elemento sobre consultas independientes.
- **Impacto**: latencia proporcional a N (p. ej. sync offline de N operaciones tras reconexión).
- **No modificado**: sin sesión autenticada ni e2e autorizado no se puede verificar funcionalmente la paralelización (riesgo de orden/transaccionalidad). Requiere verificación con el fixture E2E seguro antes de fusionar.

### CB-5 — Persistencia de carrito con objetos Product completos (documentado)
- **Evidencia estática**: `src/store/cart.ts` `partialize` (L1267–1284) persiste `items[]` con objetos `Product` embebidos a localStorage; TTL de 8 h (L1285–1299).
- **Impacto**: coste de serialización/rehidratación creciente con el tamaño del carrito y consumo de cuota de localStorage; en dispositivo lento puede penalizar interacciones del carrito.
- **No corregido**: cambiar la forma persistida rompería la restauración offline de carritos existentes; requiere migración versionada. Propuesto P2.

## 6. Priorización y justificación

| ID | Problema medido | Evidencia | Causa raíz | Impacto | Riesgo | Esfuerzo | Prioridad |
|---|---|---|---|---|---|---|---|
| W2 | 600 KB extra al abrir POS | imports estáticos verificados + chunk jspdf 408 KB en grafo POS | imports estáticos de libs de exportación | Alto (flujo más frecuente) | Bajo (clic-path) | 2 archivos | **P1 — implementado** |
| W4 | latencia sync/batch ∝ N | awaits secuenciales (estático) | bucle secuencial | Medio-Alto (reconexión offline) | Medio (orden RPC) | 1 archivo + verificación e2e | **P1 — propuesto** (bloqueado por verificación) |
| CB2 | LCP 3.1 s primera visita | medido (3 iter) | splash 1.8 s + fade | Alto percibido | Producto (branding) | trivial | P2 — decisión producto |
| W3 | 600 KB en SalesCatalog/otros | `salesCatalogExport.ts` L2–3, templates html2canvas | mismo patrón W2 | Medio | Bajo | ~6 archivos | P2 — siguiente incremento |
| CB5 | localStorage carrito con Products completos | `cart.ts` partialize | forma persistida | Bajo-Medio (dispositivos lentos) | Medio (migración offline) | 1 archivo + migración | P2 |
| CB3 | FCP dependiente de 500 KB JS | DOM 303 nodos vs 1.6 MB JS | `ssr:false` del landing | Medio | Alto (reestructura) | estructural | P3 — fase 2 |
| — | CSS global 622 KB (76 KB gz) | único CSS para app de 1 ruta | Tailwind global | Bajo comprimido | — | — | P3 — no intervenir |

Criterios aplicados: beneficio perceptible (CB-1/W2 afecta al flujo más frecuente), frecuencia (POS > SalesCatalog > resto), magnitud reproducible (tamaños de chunk verificados en build), riesgo funcional (W2 no toca lógica de negocio; W4 sí requiere verificación), costo de mantenimiento (patrón ya existente en `lazy-excel.ts`), probabilidad de regresión (W2 baja: 295 unit tests + tsc + build).

## 7. Cambios implementados

### Incremento 1 — Tooling de auditoría (commit `ca122c0b7`)
- `scripts/perf/bench-route.sh`: TTFB/latencia/tamaño por ruta.
- `scripts/perf/measure-nav.js`: LCP/CLS/transfer/desglose de recursos con Chromium headless (Playwright).
- `scripts/perf/first-load-js.py`: tamaños por ruta desde el build manifest.
- Informe base del audit.

### Incremento 2 — W2: diferimiento de jspdf/html2canvas fuera del POS (commit `a49fc7045`)
- **Archivos**: `src/lib/export/lazy-pdf.ts`, `src/components/views/terminal/views/pos/usePOSCartExports.ts`.
- **Cuello de botella corregido**: CB-1.
- **Medición inicial**: chunk jspdf 408 KB + html2canvas 193 KB alcanzables desde el grafo de apertura del POS (imports estáticos).
- **Mecanismo tras el cambio**: `import()` dinámico en el punto de uso; los chunks de jspdf/html2canvas se convierten en asíncronos puros descargados en el primer clic de exportación (semántica documentada del bundler: import estático = incluido en el grafo del padre; import() = chunk separado bajo demanda).
- **Verificación**: `tsc --noEmit` PASS · build producción PASS · 295 unit tests PASS (13 archivos, incl. integración de export de catálogo) · grep de fuente confirma ausencia de imports estáticos en el grafo POS.
- **Pendiente de verificación in-situ**: latencia real de apertura de POS post-login (requiere sesión autorizada; ver §10).

## 8. Comparativa antes/después

| Métrica | Antes | Después | Variación | Método | Resultado |
|---|---:|---:|---:|---|---|
| JS de libs PDF en grafo de apertura POS | ~601 KB (408+193) | 0 KB (solo al exportar) | **-601 KB raw** | imports estáticos (grep) vs dinámicos + emisión de chunks async en build | **PASS** |
| LCP landing (1ª visita, local) | 3.124 ms | sin cambio | — | Chromium headless ×3 | N/D (CB2, decisión producto) |
| TTFB landing local | 22 ms | sin cambio | — | curl ×3 | N/D |
| CLS landing / tienda | 0 / 0 | sin cambio | — | Chromium ×3 | ✓ sin regresión |
| Latencia sync/batch | N/D | N/D | — | no medible sin sesión | **BLOCKED** (W4) |
| Vercel build (producción real) | — | — | — | no desplegado | **NOT RUN** (requiere merge del PR) |


## 9. Pruebas funcionales, contables y de seguridad ejecutadas

_(FASE 6 — pendiente: TypeScript, lint, unitarios, integridad)_

## 10. Regresiones, limitaciones y riesgos pendientes

_(FASE 8 — pendiente)_

## 11. Recomendaciones para una segunda fase

_(FASE 8 — pendiente)_

## 12. Estado final de Git y enlace al PR

_(FASE 8 — pendiente)_
