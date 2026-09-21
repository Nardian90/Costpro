# GATE 1.4R — 11 TESTS (§17 del mandato)

Fecha: 2026-09-22 · Comando: `bunx vitest run` (suite completa) · `bunx tsc --noEmit` · `bunx eslint` (archivos tocados)

## Resultados

| Suite | Resultado |
|---|---|
| **vitest completa** | **102 archivos passed · 2164 tests passed · 24 skipped · 0 failed** (217s) |
| navigation (gate1-navigation + url-sync + viewid-contract) | 94 passed (incluye ~30 asserts GATE 1.4R nuevos) |
| TypeScript (`tsc --noEmit`) | ✅ sin errores |
| ESLint (7 archivos tocados) | ✅ 0 errores; 4 warnings V2.12.25 (raw `<button>` — patrón pre-existente del propio GenEasyView; 3 de ellas en líneas ya advertidas antes del cambio) |
| build | No ejecutado explícitamente: el servidor dev compiló y sirvió todas las vistas probadas con HMR (compilación runtime equivalente verificada por browser); el CI de push ejecuta su propio pipeline |

## Tests nuevos (protección del contrato GATE 1.4R)

`describe('GATE 1.4R — Palette del dominio Costo')`:
- arena-fc es acción de palette con module-route a SU tab (no al default del módulo)
- modos/herramientas/acciones (9 ids) presentes en palette
- tool-* resuelven su tab (puente de ejecución)
- massive-gen/steel-calculator resuelven module-route
- "generar" sin duplicados (solo cost-sheets cubre generación principal — §8)
- roles: clerk NO ve extensiones Costo; encargado SÍ
- mobileHide en nuevas extensiones (sheet móvil sin duplicados)
- test "caja" de GATE 1.3 sigue resolviendo exactamente ['cash']

`describe('GATE 1.4R — Breadcrumb de tabs técnicas')`:
- path completo para arena-fc / main / templates / massive-gen / steel-calculator / view-assisted / view-reading
- cost-analytics → ['ANÁLISIS','Análisis de Fichas']
- tabs sin registro conservan comportamiento previo (leaf = hoja del módulo)
- loop anti-"Módulo No Disponible" sobre 12 tabs

`describe('GATE 1.4R — Semántica del nombre')`:
- label de cost-analytics === 'Análisis de Fichas'
- "Tablero Dinámico" ya no existe como label
- keywords 'fichas'/'análisis de fichas' presentes

`describe('GATE 1.4R — Contrato anti-duplicación')`:
- arena-fc NO es hoja de menú
- view-assisted/view-reading/tool-* NO son hojas de menú (siguen siendo modo/acción)
- default-open técnico preservado (sin cambios de permisos)

## Contratos OLD/NEW (§17)

| Contrato | OLD | NEW | REASON |
|---|---|---|---|
| Label ANÁLISIS | "Tablero Dinámico" | "Análisis de Fichas" | UX-004: nombre ambiguo que no comunica QUÉ analiza; colisiona con Tablero Consolidado/Dashboard de Tiendas. viewId `cost-analytics` SIN cambio |
| Palette extensiones | action.route = view (tab perdido) | action.route = id (module-route con tab) | defecto mecánico; sin él las entradas module-route son falsas pistas |
| Breadcrumb cost-sheets tabs | fallback "Módulo No Disponible" | leaf del registro COST_SHEETS_TABS | UX-002: vistas reales con breadcrumb falso |
| viewName ErrorBoundary 'cost-sheets' | "Hojas de Costo" | "Fichas de Costo" | glosario único (GATE 1.4 §12) |

Ningún test fue eliminado ni debilitado para lograr verde; los asserts existentes del GATE 1/1.3 pasan sin cambios.
