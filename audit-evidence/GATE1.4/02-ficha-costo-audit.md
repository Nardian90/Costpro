# GATE 1.4 — 02 FICHAS DE COSTO AUDIT (GATE 2 + GATE 3)

Fecha: 2026-09-21 · Método: código (CostSheetView.tsx 800 líneas, useCostSheetActions.ts, navigation-map.ts, actions.ts, view-tips.ts) + navegador real (admin, deep-links probados, palette probada).

## Aclaración de alcance

El usuario confirmó: `/fc/FC.html` es un **MVP de demostración** (que los usuarios vean rápido cómo se hace una ficha), **no la aplicación**. Esta auditoría cubre el módulo **Fichas de Costo del terminal COSTPRO** (`OPERACIÓN > Costo > Fichas de Costo` → `CostSheetView`). La coexistencia terminal-MVP se documenta en 11-duplication.md.

## Arquitectura real del módulo (código)

`CostSheetView` es una **vista-módulo** con dos dimensiones de navegación interna:

1. **`activeCostSection`** (tabs técnicas, persistidas, URL `?tab=`): `gen-easy` (Generar Fácil), `main` (editor de ficha), `templates`, `arena-fc`, `cost-analytics` (Tablero Dinámico), `massive-gen`, `steel-calculator`, `ai-chat`, `audit`, `header`, `signature`, `all-content`, `expert-content`, `all-annexes`, `view-assisted`, `view-reading`, `tool-save`, `tool-import`, `tool-export-excel`, `tool-export-pdf`.
2. **`viewMode`** (modos del editor): `expert` (Completo), `assisted` (Asistido), `reading` (Informe), `preview` (Vistazo), `audit`, `quick`.

Fusión por código: deep-link `tab=view-assisted` → `handleSetViewMode('assisted')`; `tab=view-reading` → `('reading')`. Es decir, **Modo Asistido e Informe NO son vistas: son modos del editor** (la maqueta §5 del mandato los trata como tarjetas — el código dice otra cosa).

## Respuesta por capacidad (las 10 preguntas del mandato)

### 1. Chat con DarianAI
Existe (ChatBotView, viewId `chat`). viewId `chat`. Componente ChatBotView (+ DarianEditor embebido en ficha = sección `ai-chat`). Ruta directa `/?view=chat`. **Sin entrada en sidebar**, pero: Command Palette SÍ ("Chat con Darian (IA)", keywords darian/ia/asistente), FAB flotante "Abrir chat con Darian" en TODAS las vistas (browser ✓), botón "Volver al chat con Darian" en sidebar, breadcrumb propio ("Chat con Darian"). Permisos: universal. **No está oculta: es global contextual por diseño** (ACTION_EXTENSIONS). Descubribilidad ALTA (3 canales). ¿Huérfana? NO.

### 2. Tablero Principal (→ hoy "Tablero Dinámico", viewId `cost-analytics`) — GATE 3
Existe (CostAnalyticsView, "tabla dinámica tipo Power BI"). **Fue renombrado** (comentario navigation-definition.ts línea 345: "Renombrado aprobado: Tablero Principal → Tablero Dinámico") y **re-ubicado en ANÁLISIS** con entrada de menú propia; sigue siendo un tab interno de cost-sheets (URL `/?view=cost-sheets&tab=cost-analytics`). Store lo considera el default del módulo (migración FIX-TABLERO-PRINCIPAL v3: `main`→`cost-analytics`).
- ¿Qué representa? Análisis dinámico de costos/márgenes de fichas (pivot). Es **dashboard del dominio Costo**, NO dashboard general de CostPro (ese es `dashboard`/Inicio "Tablero Consolidado" y "Dashboard de Tiendas" en ANÁLISIS).
- ¿Accesible? SÍ: sidebar ANÁLISIS → Tablero Dinámico (browser ✓, 1 clic + sección).
- ¿Nombre semánticamente correcto? "Tablero Dinámico" es vago (¿dinámico en qué?). Colisiona con Tablero Consolidado (Inicio) y Dashboard KPI avanzado (cards) — ver 13-findings UX-004. Glosario recomienda "Análisis de Fichas" o "Tablero de Fichas".
- NO está huérfano. Diferencia con otros dashboards documentada en 03/12.

### 3. Generar fichas (gen-easy)
Existe. Entrada de menú principal del módulo (`Fichas de Costo` → tab `gen-easy`). Browser ✓: heading GENERAR FÁCIL con 2 tabs internas (GENERACIÓN RÁPIDA / GENERACIÓN EXPERTA), botón GENERAR AHORA (no ejecutado — read-only de datos). Palette "ficha" → 1er resultado. ACCESIBLE. Sub-capacidades: Generación Masiva (`massive-gen`) y Calculadora Estructural (`steel-calculator`) existen como secciones **solo lanzables desde el panel de acciones del editor** (CostSheetActionsPanel) — no desde gen-easy.

### 4. Modo Asistido (view-assisted)
Existe (CostSheetWizard). **NO es vista independiente: viewMode del editor.** Caminos reales: (a) deep-link `/?view=cost-sheets&tab=view-assisted` — browser ✓ funciona; (b) botón "Asistido" en CostSheetActionsPanel (panel flotante del editor, requiere ficha abierta). **Palette: "asistido" → 0 resultados** (medido, script palette-raw-results.md). Menú: no existe. **Estado: HIDDEN** — un usuario que sabe que existe el modo asistido NO puede encontrarlo salvo que abra una ficha y descubra el panel flotante. Es accesible-solo-por-contexto + deep-link.

### 5. Informe (view-reading)
Ídem Modo Asistido: viewMode `reading` del editor ("Informe de Costo" — browser ✓ deep-link renderiza). Palette "informe" solo devuelve "Reportes" (ANÁLISIS) — falsa pista hacia otro módulo. **Estado: HIDDEN.**

### 6. Arena FC
Existe (ArenaFC.tsx, "Comparación de Fichas lado a lado", con motor calculateFicha). **ORPHAN REAL**: grep completo de src/ no encontró NINGÚN componente que navegue a `arena-fc` (ningún `setActiveSection('arena-fc')`, ningún botón). Único acceso: deep-link `/?view=cost-sheets&tab=arena-fc` (browser ✓ renderiza) o estado persistido previo. Palette "arena" devuelve "Fichas de Costo" que aterriza en gen-easy, NO en Arena FC. El tip existe ("Compara fichas de costo lado a lado" — view-tips) → **la capacidad se construyó, se documentó en tips, y la reorganización la dejó sin camino**. P0 del dominio Costo.

### 7. Guardar Ficha / 8. Exportar Excel / 9. Exportar PDF / 10. Importar JSON (Herramientas)
Todas existen y son **acciones del editor** (CostSheetNav dentro del tab `main`: onImport→Importar JSON, onSave→Guardar JSON, onExportExcel, PDF vía modal; + CostSheetActionsPanel "Guardar (JSON)"/"Importar JSON"/"Exportar Excel"/"Exportar PDF"). Navegación a tabs técnicas `tool-*` declarada en navigation-map (compat), pero la UX real es contextual **dentro de una ficha abierta** — CORRECTO por principio de contexto (§14 del mandato): no son vistas, son ACCIONES.
- Problema de descubrimiento previo: palette "json" → devuelve Usuarios/Vitrina (fuzzy) y NO cualquier acción de importación; un usuario sin ficha abierta no recibe pista de que exista importación. Clasificación: herramienta contextual correcta + **palette-gap** (sin entrada de tipo acción en palette).
- view-tips documenta las 4 (`tool-save` "Guarda con ⌘S", `tool-export-pdf` "PDF cumple formato Res. 148/2023", `tool-export-excel` "Excel incluye fórmulas dinámicas", `tool-import` "Importa JSON de fichas existentes").

## Respuesta GATE 3 — ¿Dónde debería vivir Tablero Principal?

Evidencia: es el análisis consolidado del dominio Costo. Hoy vive en ANÁLISIS (global) y a la vez como tab de cost-sheets (dual-dominio). La doble pertenencia funciona (dos entradas, un componente, un viewId) pero: (1) el usuario de Costo no lo encuentra desde su dominio sin salir a ANÁLISIS; (2) el nombre no dice "de qué". **Recomendación (no implementar)**: dentro de un hub Fichas de Costo (ver 14-proposed-navigation.md), como entrada "Tablero/Análisis de Fichas", manteniendo entrada en ANÁLISIS si el análisis transversal lo justifica — decisión a gate de implementación.

## Conclusión del dominio Costo

| Capacidad | ¿Existe? | ¿ viewId? | ¿Ruta? | ¿Menú? | ¿Palette? | ¿Desde otra vista? | ¿Deep-link? | ¿Permisos? | ¿Oculta intencional? | ¿Huérfana? |
|---|---|---|---|---|---|---|---|---|---|---|
| DarianAI | Sí | chat | Sí | No (global) | Sí | Sí (FAB) | Sí | universal | global-contextual | NO |
| Tablero Principal | Sí | cost-analytics | Sí | Sí (ANÁLISIS) | Sí | desde cost-sheets | Sí | universal | no | NO |
| Generar fichas | Sí | cost-sheets/gen-easy | Sí | Sí | Sí | — | Sí | costo-group | no | NO |
| Modo Asistido | Sí | tab view-assisted | Sí | No | **NO** | Sí (editor) | Sí | costo-group | ¿? | HIDDEN |
| Informe | Sí | tab view-reading | Sí | No | **NO** | Sí (editor) | Sí | costo-group | ¿? | HIDDEN |
| Arena FC | Sí | tab arena-fc | Sí | No | **NO** | **NO — sin trigger en src/** | Sí | costo-group | no hay evidencia de intención | **SÍ (ORPHAN)** |
| Guardar/Export/Import | Sí | tool-* | Sí | No (acciones) | NO | Sí (editor) | Sí | costo-group | contextual por diseño | NO (palette-gap) |
| Plantillas | Sí | tab templates | Sí | No | NO | Sí (ActionsPanel) | Sí | costo-group | ¿? | HIDDEN |
| Generación Masiva | Sí | tab massive-gen | Sí | No | NO | Sí (ActionsPanel) | Sí | costo-group | ¿? | HIDDEN |
| Calculadora Estructural | Sí | tab steel-calculator | Sí | No | NO | Sí (ActionsPanel) | Sí | costo-group | ¿? | HIDDEN |

**La reorganización NO dejó el dominio roto (Generar + Tablero funcionan) pero sí dejó: Arena FC huérfana, Asistido/Informe/Plantillas/Masiva/Estructural palette-invisibles y menu-invisibles, y las herramientas sin pista en palette.** La maqueta §5 (hub con todo como tarjetas) NO debe aceptarse tal cual: Asistido/Informe son modos, las tools son acciones — convertir todo en tarjetas duplicaría UI y rompería el modelo mental. Propuesta diferenciada VISTA/ACCIÓN/MODO en 12-information-architecture.md y 14-proposed-navigation.md.
