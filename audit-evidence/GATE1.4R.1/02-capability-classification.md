# GATE 1.4R.1 — 02 CLASIFICACIÓN DE CAPACIDADES (mandato §4/§21/§GATE2)

Fecha: 2026-09-22 · Modelo: VISTA / MODO / ACCIÓN / HERRAMIENTA.

| Capacidad | Componente real (evidencia) | Clase | Decisión GATE 1.4R.1 |
|---|---|---|---|
| Generar (rápida/fácil) | GenEasyView tab 'quick' → CostSheetQuickMode | VISTA (entrada) | Tab 2º nivel "Generar" (id técnico gen-easy intacto) |
| **Experto (ex "Tablero Principal")** | activeCostSection 'main' + CostSheetMainTabs (Plantillas/Datos Generales/Estructura/Anexos) | VISTA (núcleo de trabajo) | Tab 2º nivel **"Experto"** + **landing por defecto** del módulo; label de registro main: "Editor de Ficha"→"Experto"; palette:true |
| Plantillas | CostSheetTemplateExplorer vía section 'templates' (sub-tab de Experto) | HERRAMIENTA contextual | Se conserva como sub-tab de Experto + palette (sin nueva página) |
| Datos Generales | CostSheetHeaderEditor vía 'header' (sub-tab de Experto) | Sub-vista del editor | Sub-tab de Experto + fix bug móvil 'general' |
| Estructura de Costos | AllContentConsolidated vía 'main' (sub-tab de Experto) | Sub-vista del editor | Sub-tab de Experto |
| Anexos | CostSheetAnnexEditor + Firmas vía 'all-annexes'/'annex-*'/'signature' | Sub-vista del editor | Sub-tab de Experto |
| Generación Masiva | CostSheetMassiveGenerator (GenEasyView tab 'expert' + tab técnica 'massive-gen') | HERRAMIENTA | **Rename "Generación Experta"→"Generación Masiva"**; tab 2º nivel propio + sigue dentro de Generar (mandato §12: decisión basada en implementación existente — ambas entradas reutilizan el MISMO componente, 0 duplicación) |
| Análisis de Fichas | CostAnalyticsView vía 'cost-analytics' (alias del menú ANÁLISIS) | VISTA | Tab 2º nivel "Análisis de Fichas" (id técnico cost-analytics se conserva) |
| Arena FC | ArenaFC.tsx vía 'arena-fc' | VISTA (beta) | Tab 2º nivel "Arena FC" + tarjeta existente en Generar (sin 2ª implementación) |
| Calculadora Estructural | SteelStructureCalculator vía 'steel-calculator' | HERRAMIENTA contextual | Sin tab 2º nivel (contextual); palette + deep-link intactos |
| Modo Completo | viewMode 'expert' (editor completo) | MODO | Label "Experto"→**"Completo"** en dropdown; se renderiza el control |
| Modo Asistido (gráfico) | viewMode 'assisted' → CostSheetWizard | MODO | Label "Asistido"; keywords + 'gráfico'; visible en control Modo |
| Modo Informe | viewMode 'reading' → CostSheetNarrative | MODO | Label "Resumido"→**"Informe"** (mandato §13; coincide con palette "Informe de la Ficha") |
| Modo Vistazo | viewMode 'preview' → CostSheetPreview | MODO | Label "Vistazo" (sin cambio) |
| Modo Resumen (KPIs) | viewMode 'kpis' → CostSheetSummary | MODO | Label "Tablero"→**"Resumen"** (evita colisión con dashboards de CostPro — mandato §8) |
| Modo Auditoría | viewMode 'audit' → CostSheetAuditView | MODO | Label "Audit"→"Auditoría" (consistencia de idioma) |
| Guardar Ficha | handleExportJSON (bridge tool-save, ⌘S) | ACCIÓN | Zona de acciones visible (barra de contexto de ficha) + palette |
| Importar JSON | handleImportJSON (bridge tool-import) | ACCIÓN | Zona de acciones visible + palette |
| Exportar Excel | handleExportExcel (bridge tool-export-excel) | ACCIÓN | Zona de acciones visible + palette |
| Exportar PDF | handleExportPDF + CostSheetExportModal (bridge tool-export-pdf) | ACCIÓN | Zona de acciones visible + palette |
| Mis Fichas | NO existe listado/almacenamiento/componente | — | **PENDIENTE DE PRODUCTO** (documentado, no inventado — §19) |
| Informe/Reporte como artefacto | No existe salida independiente; view-reading ES modo de lectura de la ficha abierta | MODO | Permanece como MODO (mandato §13 regla) |

## Anti-duplicación (mandato §21/§22)

- ÚNICO editor: CostSheetView. ÚNICO motor: useCostSheetCalculator. ÚNICO comparador: ArenaFC.
- ÚNICO generador masivo: CostSheetMassiveGenerator (2 entradas → mismo componente).
- Código NUEVO permitido y justificado: **CostSheetModuleNav.tsx** — la capacidad
  "navegación de segundo nivel del módulo + zona Modo/Acciones" NO tiene mecanismo de
  acceso hoy (el dropdown de modos es código muerto y no existe barra de módulo).
  Es un componente de NAVEGACIÓN/ACCIONES (dispara setActiveCostSection + handlers
  existentes), no duplica lógica de negocio.
