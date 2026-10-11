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

_(en curso — se rellenará con el output del build y las métricas de navegación)_

## 5. Cuellos de botella encontrados y evidencias

_(FASE 2 — pendiente)_

## 6. Priorización y justificación

_(FASE 3 — pendiente: tabla ID | Problema medido | Evidencia | Causa raíz | Impacto | Riesgo | Esfuerzo | Prioridad)_

## 7. Cambios implementados

_(FASE 4–5 — pendiente)_

## 8. Comparativa antes/después

_(FASE 5 — pendiente: tabla Métrica | Antes | Después | Variación | Método | Resultado)_

## 9. Pruebas funcionales, contables y de seguridad ejecutadas

_(FASE 6 — pendiente: TypeScript, lint, unitarios, integridad)_

## 10. Regresiones, limitaciones y riesgos pendientes

_(FASE 8 — pendiente)_

## 11. Recomendaciones para una segunda fase

_(FASE 8 — pendiente)_

## 12. Estado final de Git y enlace al PR

_(FASE 8 — pendiente)_
