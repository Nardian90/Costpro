# GATE 1.4R — FINAL REPORT · REMEDIACIÓN UX/IA · FICHAS DE COSTO

Proyecto: COSTPRO · Fecha: 2026-09-22 · Modo: remediación por mandato GATE 1.4R (alcance exclusivo: descubribilidad, arquitectura de información y navegación del dominio Fichas de Costo)

## BASELINE / FINAL HEAD / ORIGIN/MAIN / WORKTREE

```text
BASELINE:     472027e49c5abfa85902ecc9bf1f1713d95edbc1 (== audit GATE 1.4)
FINAL HEAD:   63918468bf183e34631a1476298f065d34bb986f
ORIGIN/MAIN:  63918468bf183e34631a1476298f065d34bb986f  (HEAD == origin/main ✅, fetch verificado)
WORKTREE:     limpia ✅
COMMITS:      63918468 (remediación) + commit de cierre documental
```

## ARCHITECTURE BEFORE → AFTER (síntesis)

| Antes | Después |
|---|---|
| Arena FC ORPHAN (0 triggers UI, paletteinvisible, breadcrumb falso) | **VISTA del dominio con camino único**: tarjeta en el módulo + palette + breadcrumb correcto (beta) |
| Modos (Asistido/Informe) palette-invisibles | MODO preservado + **acciones contextuales de palette** que activan el modo vía el puente existente |
| Acciones (Guardar/Import/Excel/PDF) palette-gap | **ACCIONES contextuales en palette** reutilizando los 4 handlers existentes (0 duplicación) |
| Herramientas (Plantillas/Masiva/Estructural) atrapadas | Contextuales (decisión clasificada) + camino palette |
| Tabs técnicas con falso "Módulo No Disponible" | **Fuente de verdad corregida** (registro COST_SHEETS_TABS + fix actions.ts) — leaf semántico por tab |
| "Tablero Dinámico" (ambiguo) | **"Análisis de Fichas"** (viewId `cost-analytics` intacto) |

## VIEWS / MODES / ACTIONS

- **VISTAS** (autónomas con camino visible): Generar Ficha · Editor de Ficha (contexto del módulo) · Análisis de Fichas · Arena FC (beta).
- **MODOS** (solo en el editor): Completo · Asistido · Informe · Vistazo · Audit — palette como descubrimiento, NUNCA tarjetas/vistas.
- **ACCIONES** (contextuales, aparecen cuando pueden ejecutarse): Guardar (JSON) · Importar JSON · Exportar Excel · Exportar PDF — handlers originales; guards existentes (p. ej. PDF sin cálculo → toast) intactos.

## ARENA FC (P0) — checklist §6 completo

10/10 validaciones en browser real (ver 03-arena-fc.md): localizar → abrir → render → breadcrumb → volver → contexto → permisos → deep-link → refresh. Un único camino (módulo → tarjeta); palette como canal complementario. **Deja de ser orphan.**

## PALETTE (medido, 15 queries)

Las 12 queries del mandato correctas (06-command-palette.md): "arena"→Arena FC (antes falsa pista) · "asistido"→Abrir Modo Asistido (antes ∅) · "informe"→Informe de la Ficha (antes Reportes) · "json"→Importar/Guardar (antes solo falsos) · exportar pdf/excel exactos · "generar ficha"→Fichas de Costo 1ª. Regresiones protegidas por test ("caja"→['cash'] exacto).

## BREADCRUMBS

Cero "Módulo No Disponible" para las 12 tabs conocidas del módulo (test en loop + browser). Fix en la FUENTE (registro con label), sin excepciones aisladas. Las 4 vistas UX-002 de OTROS dominios (storefront-config, customers, bank-reconciliation, ofertas) quedan explícitamente fuera de alcance (Fase A del plan GATE 1.4).

## MOBILE

Paridad estructural preservada por fuente única (0 cambios en MobileTabBar; 0 entradas nuevas en sheet — mobileHide). Arena FC/Análisis de Fichas encontrables y operativas en 390/375 (screenshots). Deuda pre-existente documentada y NO tocada: drawer auto-abierto (UX-007c, Fase E).

## BROWSER

16/16 flujos del mandato en desktop 1440; spot-checks 1280/1024; móvil 390/375. Evidencia gráfica en la carpeta. Comandos reales, no mocks.

## TESTS

- Suite completa: **2164 passed · 0 failed · 24 skipped** (102 archivos).
- +30 asserts GATE 1.4R nuevos (palette-rutas, breadcrumbs, semántica, contrato anti-duplicación).
- tsc --noEmit limpio · ESLint 0 errores (warnings pre-existentes del patrón raw-button).
- 0 tests eliminados o debilitados. Contratos OLD/NEW documentados en 11-tests.md.

## REGRESSIONS

Ninguna. Cada archivo modificado tiene hallazgo vinculado (10-regression.md). CostSheetView/useCostSheetActions/ArenaFC/motor normativo: **0 líneas**. Supabase/RLS/permisos/datos/FC.html: 0 toques. Deep-links pre-existentes: idénticos.

## FILES CHANGED (producto)

1. `src/config/navigation/navigation-definition.ts` — registro COST_SHEETS_TABS + entradas palette + rename + keyword
2. `src/config/navigation/navigation-map.ts` — rutas massive-gen/steel-calculator + breadcrumb por registro
3. `src/config/actions.ts` — fix route: ext.id (preserva tab)
4. `src/components/views/terminal/views/cost_sheet/GenEasyView.tsx` — tarjeta Arena FC
5. `src/config/navigation/view-tips.ts` — +3 tips
6. `src/components/views/TerminalShell.tsx` — viewName glosario
7. `src/__tests__/navigation/gate1-navigation.test.ts` — +30 asserts

## CI

Pipeline del remoto se ejecuta en GitHub tras el push (el repo no requiere CI local para el cierre; suite local completa en verde documentada en 11-tests.md).

## NOVATO (prueba §19 — descubribilidad por un usuario nuevo, sin conocer la arquitectura)

| Pregunta del novato | Veredicto | Canal |
|---|---|---|
| ¿Dónde creo una ficha? | **PASS** | Menú Fichas de Costo → Generar Ficha (breadcrumb lo nombra) |
| ¿Dónde veo mis fichas? | **SEMANTICALLY AMBIGUOUS** | El listado no existe en el terminal (UX-014 — decisión de producto pendiente; NO se inventó). El editor muestra la ficha activa; Arena FC lista las fichas disponibles para comparar |
| ¿Dónde analizo las fichas? | **PASS** | ANÁLISIS → "Análisis de Fichas" (nombre dice qué analiza) |
| ¿Dónde comparo dos fichas? | **PASS** | Módulo → tarjeta "Arena FC — Compara dos fichas lado a lado" / palette "arena" |
| ¿Cómo uso el modo asistido? | **PASS** | Palette "asistido" → "Abrir Modo Asistido"; o panel del editor |
| ¿Cómo genero un informe? | **PASS** | Palette "informe" → "Informe de la Ficha"; o panel del editor |
| ¿Cómo exporto una ficha? | **PASS** | Palette "exportar pdf/excel" / botones del editor |
| ¿Cómo importo una ficha? | **PASS** | Palette "importar json" → acción contextual |

7 PASS · 1 SEMANTICALLY AMBIGUOUS (depende de decisión de producto, documentada — no "funciona por URL").

## OPEN QUESTIONS (no bloqueantes)

1. **"Mis Fichas"** como listado del terminal: no existe implementación — requiere decisión de producto (¿listar `product_cost_sheets`?) antes de exponer. Recomendación: gate posterior con alcance de feature, no de navegación.
2. Header de tabs de módulo muestra el nombre del módulo (pre-existente): evaluar mostrar el leaf del registro en un gate futuro.
3. Plantillas: si producto decide que es flujo de entrada principal (sin ficha), promover a vista — el registro ya provee label/breadcrumb.

## RESIDUAL RISKS

- UX-002 en 4 vistas FUERA del dominio (storefront-config, customers, bank-reconciliation, ofertas): persiste (fuera de alcance; mismo patrón de fix ya probado).
- UX-007c/007d móviles (drawer auto-abierto, sheet plano): persisten (Fase E).
- La keyword "dinámico" se mantuvo como keyword legacy en Análisis de Fichas (transición de usuarios que la buscaban) — candidata a limpieza en Fase F.

## VEREDICTO

```text
GATE 1.4R = CERTIFIED
```

Fundamento (criterio §25): Arena FC tiene camino visible y verificado (10/10) · clasificación VISTA/MODO/ACCIÓN coherente y protegida por tests · cero duplicación (0 nuevos ViewTypes/componentes/handlers; ArenaFC/costo-motor intactos) · palette descubre sin falsas pistas (15 queries medidas) · breadcrumbs correctos en fuente · mobile con paridad (deuda pre-existente documentada, no introducida) · regresión limpia (2164 tests + 16 flujos browser) · tests en verde · browser real pasa · Git remoto coincide y worktree limpia.

La única pregunta de producto abierta ("Mis Fichas") fue tratada según el mandato (§3 "no inventar", §11 "no publicar por defecto") y NO constituye pérdida funcional ni decisión bloqueante: la arquitectura implementada es consistente y la capacidad inexistente no se ocultó ni se simuló.
