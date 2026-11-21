---
name: costpro-frontend-engineering
description: "Principal Frontend Engineer de CostPro (ADNegocio): Next.js 16.4.5 App Router + React 19 + TypeScript 5 + Tailwind CSS 4 + shadcn/ui + Bun. Úsala SIEMPRE en cambios de componentes React, páginas Next.js, hooks, estado (TanStack Query/Zustand/Dexie), data fetching, rendimiento, bundles, tipado, arquitectura frontend, refactors o prevención de regresiones. Incorpora react-best-practices (Vercel) y web-design-guidelines adaptados al stack real, y los patrones canónicos del repo (withAuth/withRole/withStoreAccess, getSupabaseAdminSafe, createApiError, Zod, rateLimit). No optimiza prematuramente: problemas medibles y de impacto real primero. Respeta las reglas de integridad financiera del AGENTS.md."
---

# CostPro Frontend Engineering — Principal Frontend Engineer

## 1. Stack real (la verdad del repo, no la de los tutoriales)

| Capa | Tecnología | Nota crítica |
|---|---|---|
| Framework | **Next.js 16.4.5** (App Router), `next.config.ts` | server components por defecto |
| UI | **React 19** + TS 5 | shadcn/ui estilo New York (`components.json`), alias `@/` |
| Estilos | **Tailwind CSS 4** | tokens vía `@theme inline` en `src/app/globals.css`; SSoT `src/styles/tokens.css` |
| Animación | **Framer Motion** (negocio), `tw-animate-css` (CSS) | GSAP/three SOLO landing; `tailwindcss-animate` NO se usa |
| Estado servidor | **TanStack Query 5** | hooks en `src/hooks/api/`, base compartida |
| Estado cliente | **Zustand 5** | `src/store/` (`useUIStore`, `useAuthStore` persist, cart, cost-sheet...) |
| Offline | **Dexie 4** | `src/lib/persistenceService.ts`, `src/lib/ipv/` |
| Backend | **Supabase** | `getSupabaseAdminSafe()` (service-role), anon client cuando RLS aplica |
| Validación | **Zod 4** | `src/validation/api-schemas` |
| Testing | Vitest 4 + Playwright 1.59 + axe-core | `bun run test` / `test:e2e` / `lint` (ESLint 0/0) |
| Runtime | **Bun ≥1.3**, Node ≥22 | no usar npm/yarn en este repo |

## 2. Patrones canónicos del repo (NO desviarse)

Fuente completa de verificación: skill `costpro-code-reviewer`. Resumen operativo:

1. **Autorización**: `canManageStore(session.user, storeId)` de `@/lib/roles` (nunca `.some()` inline equivalente); endpoints con `withAuth` / `withRole('admin')` / `withStoreAccess`.
2. **Cliente admin**: `getSupabaseAdminSafe()` de `@/lib/supabase-admin` (nunca `createClient` inline en API routes).
3. **Endpoints**: `rateLimit()` (`@/lib/rate-limit`; lectura 30-60/min, escritura 5-10/min, bulk 5/min) + `validateOrigin(req)` (`@/lib/csrf`) en POST/PUT/DELETE + Zod en todo input + `withTracing(handler, 'METHOD /api/path')` + errores con `createApiError('ERROR_CODE')` + `logger.*` (`@/lib/logger`, nunca `console.log`).
4. **Tipos**: contratos de `@/contracts/user` y `@/types`; `any` solo con justificación explícita.
5. **Comentarios-historia**: el repo anota cambios con IDs de misión (F2, GATE, FIX-*, MISIÓN fecha). Un cambio relevante añade su comentario-id siguiendo ese formato.

## 3. React/Next best practices adoptadas (de vercel-labs/agent-skills, adaptadas)

Texto completo por regla: skill instalada `react-best-practices` (`skills/react-best-practices/`, MIT, Vercel Labs). Las reglas que ADOPTA este repo, por impacto:

**CRÍTICO — Waterfalls y paralelización** (`async-*`): `Promise.all` para operaciones independientes; `await` solo en la rama que usa el valor; en API routes iniciar promesas temprano y await tarde; Suspense boundaries para streaming. En CostPro: los dashboards que agregan varias fuentes (ventas + caja + inventario) deben paralelizar, no secuenciar.

**CRÍTICO — Bundle** (`bundle-*`): importar directo del módulo, no por barrel files (ej.: `import { Button } from '@/components/ui/button'`, no de un índice que re-exporte todo); `next/dynamic` para bloques pesados no-primarios (ChatBot, QueryInspector, PDF export, gráficos d3/echarts cuando no son la vista principal); terceros (analytics, Sentry no-crítico) post-hidratación; `bun run gate:bundle` antes de cerrar si tocaste imports de primera carga.

**ALTO — Servidor** (`server-*`): server actions se autentican como API routes (mismos guardas canónicas); `React.cache` para dedup por request; serializar al cliente lo mínimo (recortar filas/campos antes de pasar a client components); no estado de módulo compartido entre requests.

**MEDIO — Re-render** (`rerender-*`): derivar en render, no en `useEffect`; memo con props no-primitivas hoistadas (definir objetos/arrays/funciones fuera del componente o con useMemo); deps de efectos primitivas; `startTransition`/`useDeferredValue` para filtros de tablas grandes; inicializar estado lazy con función.

**MEDIO — Rendering** (`rendering-*`): ternario sobre `&&` para evitar falsos renders (`0 && <X/>`); `content-visibility` en listas largas; no leer layout en render (getBoundingClientRect etc.); hoist JSX estático.

**JS** (`js-*`): `Set`/`Map` para lookups O(1); combinación de iteraciones en un solo pass; early exit; regex hoistadas. En catálogos/inventarios grandes esto es medible.

**Data fetching cliente** (`client-*`): en CostPro la capa es TanStack Query (no SWR crudo): usa queryKeys descriptivos con contexto de tienda/rol (patrón `['stores', userId, isAdmin, statusFilter]` de `src/hooks/api/`), invalidación explícita tras mutation, y respeta la base compartida de normalización de IDs de tienda.

**Reglas NOT adoptadas y por qué**: `react-native-guidelines` (repo web), `react-view-transitions` (opcional, solo si se aprueba polish de navegación), optimización prematura sin medición. Toda regla entra adaptada: si entra en conflicto con un patrón canónico de CostPro (§2) o con el design system (`costpro-product-quality`), **gana el patrón del repo**.

## 4. Arquitectura de componentes

- **Separación**: vista de negocio en `src/components/views/terminal/views/<módulo>/`; componente transversal canónico en `src/components/ui/` (solo si tiene ≥2 consumidores reales); primitivos pequeños de una vista, dentro de la vista. Nunca lógica de negocio en `ui/`.
- **Estado**: servidor → TanStack Query; UI de sesión/vista → Zustand (`useUIStore`); persistencia offline → Dexie. No dupliques estado servidor en Zustand.
- **Server/Client**: por defecto RSC; `'use client'` solo cuando hay interacción/hooks/navegador. Un client boundary lo más abajo del árbol posible (no envuelvas la vista entera si solo un panel es interactivo).
- **Errores**: `ErrorBoundary` por zona crítica; `ChunkErrorBoundary` para lazy chunks; API → `createApiError`; nunca fallar en silencio.
- **Formularios**: react-hook-form + `@hookform/resolvers` + Zod; errores inline junto al campo.
- **Navegación**: estructura desde `src/config/navigation/` (navigation-map, sidebar.structure, mobile-sheet) — una sola fuente; agregar una vista = registrarla ahí + `ViewType` en `src/store/`.

## 5. Prevención de regresiones (cierre de toda misión)

Antes de terminar cualquier cambio:
1. `bun run lint` → **0 errors 0 warnings** (estándar del repo).
2. `bun run test` (Vitest) → sin nuevos fallos.
3. Specs Playwright de la zona afectada (grep del módulo en `e2e/`) → PASS literal.
4. Si tocaste imports de primera carga: `bun run analyze` / `bun run gate:bundle`.
5. `bun run lint:a11y` si tocaste markup de UI.
6. Verificación visual en navegador (E2 de `costpro-visual-qa`) en light + dark.
7. Documenta la decisión técnica relevante en el PR (qué, por qué, qué se descartó).

## 6. Integridad financiera (INNEGOCIABLE)

**PROHIBIDO modificar por iniciativa propia**: fórmulas de costos; valoración de inventarios; cálculos de ventas; reglas de caja; fórmulas contables; redondeos financieros (Decimal.js es el estándar aritmético monetario — no lo sustituyas ni redondees a mano); reglas de moneda; comisiones; documentos comerciales y su secuenciación; relaciones entre entidades; políticas RLS; aislamiento multi-tenant; autorizaciones (§2.1); contratos API; migraciones de BD. Si un refactor de rendimiento/arquitectura toca alguno: identifica el conflicto, explica impacto, separa propuesta de implementación. Nunca introduzcas datos ficticios en operaciones reales.

## 7. Anti-metas

- No introduzcas complejidad arquitectónica (nuevas capas de abstracción, nuevos gestores de estado, micro-frontends) sin justificación medible.
- No optimices sin dato: perfila o mide primero (`analyze`, gate:bundle, React DevTools, trazas Playwright).
- No migres estilos fuera del sistema de tokens ni migres animación a librerías nuevas.
- No "modernices" patrones que el repo ya resolvió (p. ej. sustituir hooks canónicos por bibliotecas nuevas).
