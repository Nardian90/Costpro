# GATE 1.4R.1 — 01 ARQUITECTURA REAL ANTES DE REMEDIAR (mandato §3)

Fecha: 2026-09-22 · Baseline 3cf6446c. Reconstrucción forense por lectura de código
(NO se confiaron los nombres actuales — mandato §3).

## 1. Cadena de render del módulo `cost-sheets`

```text
Sidebar "Fichas de Costo" (hoja de menú, route {view:'cost-sheets'})
  └─ TerminalShell.handleNavClick → setCurrentView('cost-sheets')   [NO toca activeCostSection]
      └─ CostSheetView.tsx (switch por useUIStore().activeCostSection)
          ├─ 'cost-analytics' → <CostAnalyticsView/>   (return temprano, línea 471)
          ├─ loading (sin hidratar) → ViewLoadingSplash label="Tablero Principal"  (¡evidencia del nombre histórico!)
          └─ resto → editor; sub-branches por activeSection:
              ├─ 'main' | 'all-content' | 'expert-content' → CostSheetNav + AllContentConsolidated (Estructura)
              ├─ 'templates'    → CostSheetTemplateExplorer
              ├─ 'header'       → CostSheetHeaderEditor
              ├─ 'all-annexes' / annex-id / 'signature' → CostSheetAnnexEditor + Firmas
              ├─ 'audit'        → CostSheetAuditView
              ├─ 'ai-chat'      → DarianEditor
              ├─ 'arena-fc'     → ArenaFC
              ├─ 'massive-gen'  → CostSheetMassiveGenerator
              ├─ 'gen-easy'     → GenEasyView (Rápida + "Experta")
              ├─ 'steel-calculator' → SteelStructureCalculator
              └─ viewMode 'assisted'|'reading'|'quick' → Wizard | Narrative | QuickMode
```

Puente estado→modo (`useCostSheetActions.ts` líneas 250-272):
`view-assisted`→setViewMode('assisted') · `view-reading`→setViewMode('reading') ·
`tool-save/import/export-excel/export-pdf`→ejecutan acción y vuelven a 'main' ·
`gen-quick/gen-expert` (legacy)→quick · `main`→expert.

## 2. El "Tablero Principal" — dónde vive REALMENTE

Evidencia en código (baseline):

1. `CostSheetView.tsx:480` — `ViewLoadingSplash label="Tablero Principal"` (splash de carga del editor).
2. `CostSheetView.tsx:256-258` — comentario C2-C6: "Cuando activeSection es 'main' (Tablero Principal)
   y viewMode es 'expert', se muestran 4 tabs internos: Plantillas / Datos Generales / Estructura / Anexos".
3. `CostSheetView.tsx:502-512` — "C2-C6: Sistema de tabs del Tablero Principal de Costos".
4. `CostSheetMainTabs.tsx:52,90` — `aria-label="Secciones del Tablero Principal de Costos"`.
5. `CostSheetMainTabs.tsx:37-42` — los 4 tabs: Plantillas / Datos Generales / Estructura de Costos / Anexos.

→ **El tab técnico `main` ES el "Tablero Principal" histórico** (el espacio de trabajo con
Plantillas/Datos Generales/Estructura de Costos/Anexos). En el registro GATE 1.4R estaba
etiquetado "Editor de Ficha" con `palette:false` — sin NINGÚN camino visible (solo deep-link
`?tab=main` o el alias técnico `cost-sheet-editor`).

## 3. Landing actual del módulo

- `store/index.ts:109` — default `activeCostSection: 'cost-analytics'` (persist v4).
- `store/index.ts:202-208` — migración v<3 "FIX-TABLERO-PRINCIPAL (2026-07-04)": `main`→`cost-analytics`
  (la consolidación anterior RELEGÓ el núcleo de trabajo a favor del análisis — exactamente lo que
  el mandato §1 prohíbe: "NO debe quedar... relegada a 'Análisis'").
- `useViewUrlSync.ts` popstate fallback también aterriza en 'cost-analytics'.
- Consecuencia: clic en "Fichas de Costo" abre el centro de análisis dinámico (pivot),
  NO el hub del módulo ni su núcleo de trabajo.

## 4. Navegación de segundo nivel

**NO EXISTE.** Dentro del módulo no hay barra de navegación entre
Generar/Experto/Masiva/Análisis/Arena. Los únicos caminos visibles (baseline):

- GenEasyView: tabs internos Rápida/Experta + tarjeta Arena FC (GATE 1.4R).
- Palette (⌘K): entradas ACTION_EXTENSIONS del registro COST_SHEETS_TABS.
- MobileTabBar: cuando currentView=cost-sheets sustituye los tabs del bottom bar por
  Plant./Datos/Estruct./Anexos/Más — los SUB-tabs de Experto, mostrados incluso
  cuando estás en Arena FC o Generar (IA móvil incoherente con el módulo).

## 5. Modos de la ficha

- `CostSheetModeDropdown.tsx` — componente con modos kpis/expert/assisted/reading/preview/audit
  con labels "Tablero/Experto/Asistido/Resumido/Vistazo/Audit".
- **`<CostSheetModeDropdown` NO se renderiza en ninguna parte** (grep 0 resultados de JSX).
  → El control "Modo" (mandato §15) no existe en la UI. Los modos solo se alcanzan por
  palette ("Abrir Modo Asistido", "Informe de la Ficha") o estado interno.
- Colisión semántica: el MODO 'expert' se llama "Experto" — igual que el futuro TAB Experto;
  el modo 'reading' se llama "Resumido" mientras palette/tips lo venden como "Informe".

## 6. Acciones de ficha

- Handlers vivos en `useCostSheetActions`: handleExportJSON (Guardar), handleImportJSON,
  handleExportExcel, handleExportPDF (modal). Atajos: ⌘S (useExpertModeKeyboard → save).
- Caminos visibles baseline: SOLO la toolbar `CostSheetNav` dentro del tab Estructura
  (activeSection main/all-content/expert-content + isEditing + viewMode expert):
  Exportar PDF directo + OptionsDropdown (Importar/Guardar/Excel/PDF/Auditoría).
- `CostSheetActionsPanel.tsx` (365 líneas, slide-over de acciones) — **componente muerto**:
  `<CostSheetActionsPanel` no aparece en ningún JSX; `isActionsPanelOpen` no consume UI.
- En Datos Generales/Plantillas/Anexos/Asistido/Informe NO hay zona de acciones.

## 7. Registro COST_SHEETS_TABS (fuente de labels palette/breadcrumb)

gen-easy "Generar Ficha" · main "Editor de Ficha" · arena-fc "Arena FC" (beta) ·
view-assisted "Abrir Modo Asistido" · view-reading "Informe de la Ficha" ·
templates "Plantillas de Fichas" · massive-gen "Generación Masiva" ·
steel-calculator "Calculadora Estructural" · tool-save "Guardar ficha (JSON)" ·
tool-import "Importar ficha (JSON)" · tool-export-excel "Exportar ficha a Excel" ·
tool-export-pdf "Exportar ficha a PDF".

## 8. Breadcrumbs

navigation-map.getBreadcrumbForView resuelve tabs desde COST_SHEETS_TABS (fix GATE 1.4R);
`cost-analytics` resuelve como hoja de menú ANÁLISIS "Análisis de Fichas".
Con el rename de 'main' a "Experto" el breadcrumb se corrige en la fuente.

## 9. "Mis Fichas" (mandato §19) — búsqueda de evidencia

- `useCostSheetStore` (store/cost-sheet-store) persiste UNA ficha activa (no listado).
- No existe componente de listado/historial/búsqueda de fichas guardadas:
  grep "mis fichas|MySheets|SheetList|savedSheets" en src/ → sin resultados funcionales
  (solo exportación JSON manual y autoguardado de versiones en memoria de sesión).
- Veredicto: **MIS FICHAS = PENDIENTE DE PRODUCTO** (no inventar — mandato §19).

## 10. Bug móvil descubierto en la reconstrucción

MobileTabBar setea `setActiveCostSection('general')` (tab "Datos"), pero CostSheetView
solo renderiza el editor de cabecera para `'header'` (línea 538) y el mapeo mainTab
solo cubre 'header' (línea 263). Resultado: la tab móvil "Datos" renderiza contenido
VACÍO (ninguna rama matchea 'general'). Se corrige en esta remediación.
