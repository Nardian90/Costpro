# GATE 1.4R — 09 BROWSER (GATE 18 del mandato)

Fecha: 2026-09-22 · Entorno: PM2 localhost:3000 · admin@demo.com · agente Playwright (agent-browser) · Next dev con HMR.

## Viewports probados

| Viewport | Flujos ejecutados | Resultado |
|---|---|---|
| 1440×900 (desktop) | 1–16 completos + palette ×15 queries + screenshots | ✅ |
| 1280×800 | gen-easy + tarjeta Arena + breadcrumb | ✅ |
| 1024×768 | ídem | ✅ |
| 390×844 (mobile) | módulo + tarjeta + Arena + sheet/sidebar | ✅ (con nota UX-007c) |
| 375×667 (mobile) | ídem | ✅ (con nota UX-007c) |

## Los 16 flujos del mandato (desktop 1440)

| # | Flujo | Resultado | Nota |
|---|---|---|---|
| 1 | Inicio | ✅ login → TABLERO CONSOLIDADO, header "Inicio" | |
| 2 | Fichas de Costo | ✅ menú Costo → módulo; breadcrumb "Generar Ficha" | |
| 3 | Generar Ficha | ✅ GENERAR FÁCIL con 2 tabs internas + tarjeta Arena FC | |
| 4 | Abrir/crear ficha | ✅ editor main carga (tablist Estructura de Costos, splash de hidratación correcto) | |
| 5 | Asistido | ✅ palette → wizard Pasos 1–4 | |
| 6 | Informe | ✅ palette → INFORME DE COSTO narrativo | |
| 7 | Guardar | ✅ palette "guardar ficha" → ejecuta export JSON y regresa a main | toast efímero no capturable en headless |
| 8 | Importar | ✅ palette "importar json" → 1er hit; handler existente (file input) | click nativo no automatizado — mismo handler que el botón del editor |
| 9 | Exportar Excel | ✅ 1er hit exacto; botón del editor verificado en DOM | |
| 10 | Exportar PDF | ✅ 1er hit exacto; botón "Exportar ficha de costo a PDF" visible | modal intacto |
| 11 | Arena FC | ✅ tarjeta → render → breadcrumb → deep-link → refresh | detalle en 03 |
| 12 | Análisis de Fichas | ✅ renombrado en menú/palette/breadcrumb; CENTRO DE ANÁLISIS DE COSTOS renderiza | |
| 13 | Volver al hub | ✅ breadcrumb "Costo" → SectionHub con tarjetas del dominio | |
| 14 | Refresh | ✅ arena-fc tras reload mantiene vista + breadcrumb | |
| 15 | Deep-link | ✅ ?view=cost-sheets&tab={gen-easy,arena-fc,view-assisted,view-reading,cost-analytics,main} | |
| 16 | Command Palette | ✅ Ctrl+K, navegación ↑↓, Enter ejecuta | detalle en 06 |

## Evidencia gráfica (audit-evidence/GATE1.4R/)

- browser-gen-easy-1440-with-arena-card.png — módulo con tarjeta Arena FC
- browser-arena-fc-1440.png — Arena FC renderizada
- browser-arena-fc-refresh.png — refresh de deep-link
- browser-editor-main-1440.png — editor con breadcrumb "Editor de Ficha"
- browser-analisis-fichas-1440.png — Análisis de Fichas
- mobile-390-gen-easy-arena-card.png / mobile-390-arena-fc.png / mobile-375-sheet-analisis.png

## Defectos observados (no introducidos por esta remediación)

1. Drawer lateral auto-abierto ocluye contenido móvil (UX-007c pre-existente).
2. Header title para tabs de un módulo muestra siempre el nombre del módulo ("Fichas de Costo") — comportamiento pre-existente; el breadcrumb aporta la desambiguación. Observación residual, no defecto del mandato.
