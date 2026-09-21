# GATE 1.4R — 10 REGRESSION (GATE 22 del mandato)

Fecha: 2026-09-22 · Comparación HEAD baseline `472027e4` vs HEAD final. Cada modificación vinculada a un hallazgo del GATE 1.4.

## Archivos modificados (7) — razón por hallazgo

| Archivo | Cambio | Hallazgo GATE 1.4 vinculado |
|---|---|---|
| `src/config/navigation/navigation-definition.ts` | + registro COST_SHEETS_TABS (metadatos de tabs técnicas) y + 10 entradas palette; rename label cost-analytics; + keyword 'generar ficha' | UX-001 (P0), UX-002, UX-003, UX-004, UX-008 |
| `src/config/navigation/navigation-map.ts` | + rutas massive-gen/steel-calculator; breadcrumb de cost-sheets tabs desde el registro | UX-002 (P0), UX-008 |
| `src/config/actions.ts` | fix `route: ext.route.view` → `ext.id` (preserva tab) | UX-008 (causa mecánica de falsas pistas) |
| `src/components/views/terminal/views/cost_sheet/GenEasyView.tsx` | + tarjeta Arena FC (única UI nueva) | UX-001 (P0) |
| `src/config/navigation/view-tips.ts` | + 3 tips (templates, massive-gen, steel-calculator) | UX-007e (descubrimiento) |
| `src/components/views/TerminalShell.tsx` | viewName "Hojas de Costo" → "Fichas de Costo" (solo nombre de ErrorBoundary) | UX-004 (glosario) |
| `src/__tests__/navigation/gate1-navigation.test.ts` | + 4 describe blocks GATE 1.4R (30 asserts) | §17/§22 (protección de contrato) |

## Componentes/contratos NO modificados (verificación negativa)

| Elemento | Estado |
|---|---|
| ViewTypes | 0 nuevos, 0 renombrados (`cost-analytics` intacto como viewId) |
| Routes/URL params | Los deep-links pre-existentes resuelven idénticos (tests 94/94 navigation + browser) |
| Permisos/roles | `roles` de dominio Costo reutilizados; 0 cambios en isViewAllowedForRole/RLS |
| CostSheetView / useCostSheetActions / ArenaFC / motor normativo / cálculos | **0 líneas tocadas** |
| Supabase / RLS / datos | 0 toques |
| /fc/FC.html | 0 toques |
| MobileTabBar / Sidebar | 0 toques (derivan de la fuente) |
| Labels modificados | Solo "Tablero Dinámico"→"Análisis de Fichas" (+ leaf labels NUEVOS de breadcrumb; + viewName ErrorBoundary) |

## Regresión ejecutada (§15 del mandato)

| Flujo | Antes de modificar | Después de modificar |
|---|---|---|
| Generar Ficha (gen-easy) | — | ✅ (browser) |
| Análisis (cost-analytics) | — | ✅ render CENTRO DE ANÁLISIS DE COSTOS |
| Editor (main) | — | ✅ tablist + contenido |
| Guardar / Importar / Excel / PDF | — | ✅ presentes y ejecutables (palette + editor) |
| Asistido / Informe | — | ✅ wizard/narrativa renderizan vía palette |
| Suite completa vitest | 2164 pass (baseline verificado en REACT-2026-09-22) | **2164 pass, 0 fail** |

## STOP check (§22)

Ninguna modificación sin hallazgo vinculado. La keyword 'generar ficha' añadida a `cost-sheets` se originó en la validación browser de palette (query "generar ficha" sin hit principal) — vinculado a UX-004/§8 del mandato.
