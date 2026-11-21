# BASELINE.md — Estado inicial de calidad de COSTPRO (referencia del programa CP-CI)

**Fecha de medición**: 2026-11-21 · **Rama de medición**: `feat/cp-agent-foundation-001-20261121` @ `6485e17` (base `main` @ `281d1df`) · **Método**: solo información verificable del repositorio (sin puntuaciones inventadas). Este documento NO se modifica retrospectivamente: la evolución se registra por ciclo en `cycles/` y los snapshots futuros de lint en `ESLINT_BASELINE.json` (mismo esquema).

## 1. Repositorio y stack (verificado en `package.json` / `git`)

- Repo `Nardian90/Costpro`, default `main`, ~8.074 archivos, sin cambios sin confirmar en el momento del diagnóstico.
- **Next.js 16.4.5** (App Router, `next.config.ts`), **React ^19.0.0**, **TypeScript ^5**, **Tailwind CSS ^4** (`@theme inline` en `src/app/globals.css`), **Bun ≥1.3** (lockfile `bun.lock`; Node ≥22).
- Backend: **Supabase** (`@supabase/supabase-js` ^2.105.1; Postgres + Auth + RLS + Storage). Estado: **Zustand ^5.0.6** (cliente), **TanStack Query ^5.82.0** (servidor), **Dexie ^4.4.2** (offline). UI: shadcn/ui estilo New York + **Framer Motion ^12.23.2** + lucide-react.
- Producto: SaaS empresarial/financiero multiempresa (ADNegocio/CostPro): ventas, POS, inventarios, costos, contabilidad, caja, reportes, multi-store.

## 2. Estructura principal (conteos verificados)

- `src/components/ui/`: **103** componentes (capa canónica, incluye `BaseModal`, `PageHeader`, `ResponsiveTable`, `ElderlyTable`, `StateRenderer`, `button.tsx`, `atomic/`).
- `src/components/views/terminal/views/`: **57** vistas de negocio (dashboard, sales, pos, inventory, cash, cost_sheet, financial_statements, accounts_payable/receivable…).
- `src/hooks/`: **111** archivos (incluye `hooks/api/` TanStack Query). `src/store/` Zustand. `src/lib/` patrones canónicos (`roles.ts`, `supabase-admin.ts`, `api-errors.ts`, `csrf.ts`, `rate-limit.ts`, `logger.ts`). `src/messages/es.json` (~1.062 claves next-intl).
- `supabase/migrations/`: **599** migraciones. `e2e/`: **65** specs Playwright.

## 3. Skills disponibles (infra CP-AGENT-FOUNDATION-001, PR #1676)

Propias versionadas: `costpro-product-quality` (+ `references/costpro-design-system.md`), `costpro-visual-qa`, `costpro-frontend-engineering`, `costpro-code-reviewer`, `costpro-mobile-first-auditor`, `costpro-security-auditor`, `costpro-sql-performance-optimizer`. Vendors locales (gitignored): `ui-ux-pro-max`, `web-design-guidelines`, `react-best-practices`.

## 4. Sistema de diseño (resumen; fuente: tokens.css + design-system.md)

Tokens hex light/dark (dark "Zed-style" `#121212`), familia brand (`#39FF14` dark / `#128209` light), primario único `#22c55e`/`#15803d`, semánticos success/warning/danger/info con pares AA documentados, charts 1–6, sidebar, radios/sombras/z-index/duraciones, clases tipográficas `cp-*`, modos `performance`/`enhanced` + `prefers-reduced-motion`, hardening móvil ≤375/≤420px con safe-areas y targets ≥44px. Lista de vigilancia (9 inconsistencias sistémicas) en `references/costpro-design-system.md` §11.

## 5. Herramientas de calidad (comandos reales de `package.json`)

`bun run lint` (ESLint **9.39.5**; objetivo repo 0 errors/0 warnings) · `lint:a11y` · `bun run test` (Vitest **4.1.11**) · `test:e2e` (Playwright **1.59.1**; proyectos `core`/`creation` fail-closed; `workers:1`; screenshot only-on-failure; trace on-first-retry) · `test:security` · `gate:bundle` · `analyze`. axe-core **4.11.3** instalado (`e2e/accessibility.spec.ts`, `e2e/fc-accessibility.spec.ts`). Auditoría mobile programática: `e2e/mobile-viewport-audit.spec.ts` (375×667, 390×844, 360×800, 768×1024).

## 6. Estado de las pruebas (medido el 2026-11-21)

- **ESLint** (comando real `bunx eslint . -f json`, equivale a `bun run lint`): **0 errores / 1.595 advertencias** en 324 archivos. Detalle completo y reproducible: `ESLINT_BASELINE.json`.
  - Origen investigado (no asumido): **1.571 (98,5%)** = regla deliberada `no-restricted-syntax` "**V2.12.25 Anti-fragmentación Design System**" (avisa `<button>` crudo fuera de `components/ui` para guiar migración incremental a `<Button>`); **24** = directivas `eslint-disable` sin uso (`reportUnusedDisableDirectives`).
  - Concentración: cola larga, no un único componente — top file `ProductionOrdersView.tsx` (58, 3,6%), top-5 = 13,2%; 136 archivos acumulan el 80%. Top-5: ProductionOrdersView (58), WorkersView (50), CashReportView (46), ChatBot.tsx (29), StorefrontPage.tsx (28).
  - Interpretación: la deuda es un **backlog estructurado de migración de botones** (decisión de diseño del repo), no código descuidado indiferenciado. Se ataca por unidades acotadas (backlog CP-CI-001) sin tocar la configuración global.
- **Vitest**: suite unitaria ejecutada completa el 2026-11-21 — resultado: (ver sección 6b al pie, se completa tras la ejecución de referencia).
- **Playwright E2E**: NO ejecutado en el baseline (requiere entorno E2E/Supabase de pruebas; producción prohibida por AGENTS.md). Cobertura declarada: 65 specs sobre auth, POS offline, inventario, costos, caja/comisiones, multi-tienda, seguridad, accesibilidad, viewport móvil, PDF/layout. Queda como medición pendiente de los primeros ciclos en entorno permitido.
- **TypeScript/build**: no ejecutados en el baseline (coste alto); disponibles vía `bun run build` / `analyze`. Primer ciclo que toque tipos debe correrlos.

## 7. Problemas conocidos (evidenciados, no estimados)

1. Deuda ESLint estructurada (§6): migración `<button>` crudo → `<Button>` en 324 archivos + 24 disables muertos.
2. Duplicidades de componentes (design-system.md §11): dos `ViewSwitcher`; botones paralelos sin cva en `atomic/` (`PrimaryButton`/`SecondaryButton` raw; `IconButton` variante 'primary' con contraste débil corregido solo parcialmente); 3 soluciones de tabla (shadcn, ResponsiveTable 2 usos, ElderlyTable 2 usos — coexistencia justificada por responsabilidades distintas, no fusionar sin decisión de producto).
3. Hardcodes de color fuera de tokens en `PageHeader.badgeVariantMap` y `atomic/ProductCard` (el `border-white/5` de ProductCard es decisión consciente documentada — no "corregir" sin decisión).
4. `StateRenderer` cubre 22/57 vistas: estados vacío/error inconsistentes en el resto.
5. i18n parcial: UI base/POS con español hardcodeado frente a `useTranslations` (~125 archivos ya migrados).
6. `tailwindcss-animate` en package.json sin usarse (duplicado de `tw-animate-css`).
7. Marca dividida: tokens "COSTPRO" vs producto "ADNegocio" (decisión pendiente del propietario).
8. Artefacto `src/app/layout.tsx.bak.1782273355` y `src/middleware.ts.bak` en el árbol.
9. Warn de Vitest (2026-11-21): `vi.hoisted()`/`vi.mock` anidados en `src/__tests__/lib/res11-exporters.test.ts` (será error en versiones futuras de Vitest) + truncamiento de tabla en export "Impresión económica SC-2-13" (36 unidades de ancho no caben en página).

## 8. Deuda técnica y riesgos identificados

- **Deuda**: migración de botones (§6); deuda tipográfica de estados; deuda i18n; dependencia duplicada de animación CSS.
- **Riesgos**: cambios financieros/contables requieren guardas específicas (AGENTS.md: Decimal.js, documentos comerciales, RLS, multi-tenant — PROHIBIDO tocar por iniciativa propia); producción no es banco de pruebas (guard `assert-not-production`); presupuesto Supabase Free (logs ≤0,6 GB/ciclo objetivo); PRs paralelos del propietario (al momento del baseline: #1673, #1674, #1675 abiertos — los ciclos deben verificar conflictos antes de tocar zonas relacionadas).
- **Fuera de alcance del programa**: migraciones, deploy, merges, cambios de reglas financieras (ver PROGRAM.md §9).

## 6b. Suite Vitest de referencia (ejecución 2026-11-21)

Comando real `bun run test` sobre `6485e17` — **exit 0** en 523,85 s: **461 archivos de test pasados | 7 skipped (468)** · **6.315 tests pasados | 106 skipped (6.421)**. Estado de referencia: suite verde al baseline. Observaciones menores registradas (no bloqueantes): warnings de `vi.hoisted()`/`vi.mock` anidados en `src/__tests__/lib/res11-exporters.test.ts` (serán error en Vitest futuro) y truncamiento de ancho en export "Impresión económica SC-2-13" (36 unidades no caben en página) — candidatos a unidades de misión en ciclos posteriores.
