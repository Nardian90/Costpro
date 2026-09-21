# GATE 1.4R — 01 CLASSIFICATION (GATE 1 + GATE 2 del mandato)

Fecha: 2026-09-22 · Método: re-inspección de código en HEAD `472027e4` (navigation-definition.ts, navigation-map.ts, actions.ts, CostSheetView.tsx 787 lín, useCostSheetActions.ts, CostSheetActionsPanel.tsx, GenEasyView.tsx, CommandPalette.tsx, TerminalShell.tsx registry, MobileTabBar.tsx, view-tips.ts) + evidencia browser GATE 1.4.

## Matriz del mandato §3 — resuelta con evidencia de código

| Capacidad | Tipo real | Implementación existente | Trigger actual (verificado) | ¿Menú? | ¿Palette? | Acción GATE 1.4R |
|---|---|---|---|---|---|---|
| **Generar Ficha** (`gen-easy`) | VISTA — entrada del módulo | GenEasyView (2 tabs internas Rápida/Experta) | Menú `Fichas de Costo` (route tab gen-easy) — 1 clic | Sí (ya está) | Sí (ya está) | **preservar** (sin duplicar: NO crear "Generar fácil/nueva/rápida" paralelos) |
| **Mis Fichas** | **NO EXISTE** como listado en terminal | El editor `main` edita la ficha activa; listado solo en MVP /fc/ (fuera de alcance) | — | — | — | **no inventar** — queda como pregunta de producto (UX-014); NO se crea vista falsa |
| **Análisis de Fichas** (`cost-analytics`) | VISTA — análisis del dominio Costo (dual: menú ANÁLISIS + tab de cost-sheets) | CostAnalyticsView | Menú ANÁLISIS "Tablero Dinámico" + tab interna | Sí (ya está) | Sí (ya está) | **corregir nombre** → "Análisis de Fichas" (§7 del mandato); viewId técnico `cost-analytics` se conserva |
| **Arena FC** (`arena-fc`) | VISTA — comparador de fichas (beta) | ArenaFC.tsx (1179 lín, motor calculateFicha) | **NINGUNO en UI** (orphan P0 — solo deep-link) | Sí (vía dominio) | Sí | **recuperar**: tarjeta visible en GenEasyView + palette + breadcrumb corregido; reutiliza ArenaFC existente (0 duplicación) |
| **Modo Asistido** (`view-assisted`) | **MODO** del editor (viewMode `assisted` → CostSheetWizard) | Panel flotante del editor + puente deep-link | Editor (requiere ficha) + deep-link | NO (es modo) | Sí como **acción contextual** | **preservar modelo** + acción palette "Abrir Modo Asistido" (reusa puente view-assisted → handleSetViewMode('assisted')) |
| **Informe** (`view-reading`) | **MODO** del editor (viewMode `reading` → CostSheetNarrative) | Ídem | Ídem | NO (es modo) | Sí como **acción contextual** | Ídem → "Informe de la Ficha" |
| **Plantillas** (`templates`) | HERRAMIENTA contextual (arranque de ficha) | CostSheetTemplateExplorer | Editor tab `templates` (CostSheetMainTabs) + ActionsPanel | No (contextual) | Sí | **no asumir vista autónoma** — evidencia: solo tiene sentido para iniciar/editar una ficha; se da camino palette + se mantiene contextual |
| **Generación Masiva** (`massive-gen`) | HERRAMIENTA — sub-capacidad de Generar | CostSheetMassiveGenerator | **YA VISIBLE** como tab "Generación Experta" dentro de gen-easy + ActionsPanel | No (sub-capacidad) | Sí | clasificar como sub-capacidad de Generar (no vista autónoma); entrada palette para el término "masiva" (mismo componente, 0 duplicación) |
| **Calculadora Estructural** (`steel-calculator`) | HERRAMIENTA contextual | SteelStructureCalculator | Solo ActionsPanel "Calculadora Estructura" | No (contextual) | Sí | **no publicar como vista** (sin evidencia de uso autónomo); entrada palette; se documenta decisión |
| **Guardar** (`tool-save`) | **ACCIÓN** del editor | handleExportJSON (CostSheetNav + ActionsPanel) | Editor | NO | Sí como acción contextual | palette "Guardar ficha (JSON)" — reusa puente tool-save existente |
| **Importar JSON** (`tool-import`) | **ACCIÓN** del editor | handleImportJSON | Editor | NO | Sí como acción contextual | palette "Importar ficha (JSON)" — puente tool-import |
| **Exportar Excel** (`tool-export-excel`) | **ACCIÓN** del editor | handleExportExcel | Editor | NO | Sí como acción contextual | palette "Exportar ficha a Excel" — puente existente |
| **Exportar PDF** (`tool-export-pdf`) | **ACCIÓN** del editor | handleExportPDF (modal Res. 148/2023) | Editor | NO | Sí como acción contextual | palette "Exportar ficha a PDF" — puente existente |

## Regla crítica aplicada (§3)

Ninguna capacidad se convirtió en VISTA por tener ViewType/tab/URL/componente/deep-link:
- `view-assisted`/`view-reading` tienen tab y deep-link, pero son **MODOS** (render por `viewMode`, no por `activeCostSection` — CostSheetView líneas 713-734).
- `tool-*` tienen tab y ruta técnica, pero ejecutan una acción y **vuelven a `main`** en el mismo tick (useCostSheetActions useEffect líneas 262-265) — son **ACCIONES**.
- `templates`/`massive-gen`/`steel-calculator` se quedan **contextuales** (criterio A del §11: sin usuario/objetivo/retorno autónomo demostrado en la evidencia).
- Única reclasificación de exposición: `arena-fc` (VISTA beta del dominio) y las entradas palette de modos/acciones/herramientas.

## Diseño del hub (GATE 3) — decisión

La estructura §5 del mandato NO se implementa literalmente (regla §20). Se verifica primero:
- `Mis Fichas`: no existe → no se inventa (queda documentada como decisión de producto).
- Plantillas/Masiva/Estructural: sin criterio de VISTA AUTÓNOMA → contextuales con descubrimiento palette.
- El módulo `Fichas de Costo` (entrada única) **ya es el hub de facto**; su tab de aterrizaje (gen-easy) recibe la tarjeta Arena FC como camino visible del dominio → cumple "Fichas de Costo → Arena FC" con UN solo camino semántico y sin duplicar navegación.

Estructura resultante:

```text
OPERACIÓN
└── Costo
    └── Fichas de Costo  (entrada única — preservada)
        ├── Generar Ficha            (vista de aterrizaje, con tarjeta → Arena FC)
        ├── Editor de Ficha          (tab main — breadcrumb corregido)
        │   └── modos: Completo · Asistido · Informe · Vistazo · Auditoría  (en el editor)
        │   └── acciones: Guardar · Importar · Exportar Excel/PDF  (en el editor + palette)
        ├── Análisis de Fichas       (menú ANÁLISIS, renombrado; tab dual intacta)
        ├── Arena FC                 (tarjeta en Generar + palette + breadcrumb; beta)
        └── herramientas contextuales: Plantillas · Masiva · Estructural (palette)
```

## Defecto mecánico descubierto (nuevo, bloqueante para palette de módulo)

`actions.ts` línea 66: `route: ext.route.view` — al derivar ACTION_EXTENSIONS **descarta `route.tab`**. Cualquier extensión module-route (con tab) aterrizaría en el default del módulo (gen-easy) → falsa pista exactamente la prohibida por §12. Corrección: `route: ext.id` (cada extensión resuelve su propia ruta en NAVIGATION_MAP — idéntico para las existentes, y con tab para las nuevas).
