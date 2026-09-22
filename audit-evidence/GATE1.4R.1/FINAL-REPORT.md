# GATE 1.4R.1 — FINAL REPORT · RECONSTRUCCIÓN INTEGRAL DE FICHAS DE COSTO

Fecha: 2026-09-22 · Base: 3cf6446c · Remediación: **b9a8075c** · Veredicto: **CERTIFIED**

## Alcance ejecutado

Reconstrucción de la arquitectura funcional del módulo Fichas de Costo sobre la evidencia real
(GATE 1.4 FINAL REPORT, 02-ficha-costo-audit, 12-information-architecture, 14-proposed-navigation
y toda la evidencia browser del GATE 1.4/1.4R), con el modelo de cuatro categorías:
**VISTAS · MODOS · ACCIONES · HERRAMIENTAS** — sin duplicar componentes, rutas, lógica ni motores.

## Arquitectura final (verificada en navegador real)

```text
FICHAS DE COSTO (clic en menú → aterriza en el NÚCLEO)
│  nav de 2º nivel siempre visible (CostSheetModuleNav)
├── GENERAR              → generación rápida/fácil (gen-easy)
│     └── Generación Masiva como herramienta interna (mismo componente)
├── EXPERTO              → ex "Tablero Principal": Plantillas · Datos Generales ·
│                          Estructura de Costos · Anexos (+Firmas)  [sub-tabs]
├── MASIVA               → Generación Masiva (massive-gen)
├── ANÁLISIS             → Análisis de Fichas (cost-analytics)
└── ARENA FC (beta)      → comparador (arena-fc)

FICHA ABIERTA (scope Experto)
├── Modo: Completo · Asistido (gráfico) · Informe · Vistazo (+ Resumen, Auditoría)
└── Acciones: Guardar Ficha · Importar JSON · Exportar Excel · Exportar PDF
```

## Respuestas al mandato (§32 — 21 preguntas)

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Fichas de Costo abre un segundo nivel de navegación? | **SÍ** — barra de módulo siempre visible (browser-landing-experto-1440) |
| 2 | ¿Existe Experto? | **SÍ** — tab del 2º nivel + palette + breadcrumb |
| 3 | ¿Experto abre la vista antes llamada Tablero Principal? | **SÍ** — aterriza en `main` con sus 4 sub-tabs (evidencia en código del nombre histórico) |
| 4 | ¿Plantillas es accesible? | **SÍ** — sub-tab de Experto (explorador completo) |
| 5 | ¿Datos Generales es accesible? | **SÍ** — sub-tab (desktop y móvil; bug móvil corregido) |
| 6 | ¿Estructura de Costos es accesible? | **SÍ** — sub-tab default de Experto |
| 7 | ¿Anexos es accesible? | **SÍ** — sub-tab (anexos + firmas) |
| 8 | ¿Generación Masiva dejó de llamarse Generación Experta? | **SÍ** — cero labels "Generación Experta" (test contractual) |
| 9 | ¿Generación Masiva tiene acceso claro? | **SÍ** — tab MASIVA + dentro de Generar (mismo componente) |
| 10 | ¿Análisis de Fichas es accesible? | **SÍ** — tab ANÁLISIS + hoja del menú ANÁLISIS |
| 11 | ¿Arena FC dejó de ser orphan? | **SÍ** — tab ARENA FC (beta) + tarjeta en Generar + palette |
| 12 | ¿Asistido es accesible como modo gráfico? | **SÍ** — control Modo visible; hint "Modo gráfico guiado paso a paso"; wizard verificado |
| 13 | ¿Informe/Reporte accesible en el contexto correcto? | **SÍ** — MODO "Informe" de la ficha abierta (no página, no confundido con Reportes de ANÁLISIS) |
| 14 | ¿Guardar Ficha es accesible? | **SÍ** — zona de acciones + palette + ⌘S (descarga verificada) |
| 15 | ¿Exportar Excel es accesible? | **SÍ** — zona de acciones + palette (descarga verificada) |
| 16 | ¿Exportar PDF es accesible? | **SÍ** — zona de acciones + palette (modal verificado) |
| 17 | ¿Importar JSON es accesible? | **SÍ** — zona de acciones + palette (trigger + lógica por puente/tests) |
| 18 | ¿Palette descubre las capacidades correctas? | **SÍ** — 7 consultas medidas, candidato correcto primero, sin falsos (08-palette.md) |
| 19 | ¿Breadcrumbs correctos? | **SÍ** — 8 rutas verificadas; cero "Módulo No Disponible" |
| 20 | ¿Mobile conserva la arquitectura? | **SÍ** — MISMA IA (mapeo compartido), 390/375 sin truncado |
| 21 | ¿Se evitó toda duplicación? | **SÍ** — 1 editor, 1 motor, 1 Arena, 1 generador masivo; código nuevo = 1 componente de navegación/acciones justificado por §21 |

## Descubribilidad de novato (§27) — resumen

Un usuario sin conocimiento de ViewType/deep-links puede responder desde la UI:
¿trabajo completo? → EXPERTO · ¿crear? → GENERAR · ¿muchas? → MASIVA · ¿analizar? → ANÁLISIS ·
¿comparar? → ARENA · ¿modo gráfico/informe? → control MODO de la ficha · ¿guardar/exportar/importar?
→ zona ACCIONES de la ficha. Todo verificado por navegador real con storage limpio (11-browser.md).

## Nota de Producto (documentada, no bloqueante)

- **MIS FICHAS = PENDIENTE DE PRODUCTO** (§19): no existe listado/almacenamiento/historial de
  fichas en el código (solo una ficha activa + exportación JSON manual + versiones de autosave
  en memoria). NO se inventó (mandato §19). No implica pérdida de acceso a capacidades existentes.
- `CostSheetActionsPanel.tsx` es código muerto heredado (no renderizado); su rol funcional lo
  cumple la nueva zona de acciones. Eliminación diferida a higiene de código (fuera del alcance).
- `next build` no ejecutable en este host (OOM SIGKILL, 4GB sin swap — también con webpack y con
  el dev server parado); equivalente de compilación cubierto por tsc limpio + suite completa +
  compilación runtime verificada por navegador (13-tests.md, misma condición documentada en GATE 1.4R).

## Veredicto: CERTIFIED

Criterio cumplido: el núcleo de Fichas de Costo vuelve a ser completamente descubrible y
funcional — EXPERTO → Plantillas/Datos Generales/Estructura de Costos/Anexos — más GENERAR,
GENERACIÓN MASIVA, ANÁLISIS y ARENA FC; y dentro de la ficha: ASISTIDO, INFORME, GUARDAR,
IMPORTAR JSON, EXPORTAR EXCEL, EXPORTAR PDF — sin duplicación y sin regresiones
(suite completa 2175/0, tsc limpio, ESLint 0 errores, 5 viewports, flujos A-F PASS,
deep-links compatibles, HEAD == origin/main, worktree limpia).
