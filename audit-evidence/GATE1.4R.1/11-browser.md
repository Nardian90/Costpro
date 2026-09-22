# GATE 1.4R.1 — 11 BROWSER (mandato §26/§29 — sesiones reales)

## Sesión

- URL base `http://localhost:3000` · login `/?login=1` · admin@demo.com (rol admin).
- Usuario nuevo simulado: `localStorage.clear()` + `sessionStorage.clear()` antes del login
  (descubrimiento sin estado previo).
- Herramienta: agent-browser (Playwright headless) · dev server PM2 (compilación runtime).

## Viewports y capturas (audit-evidence/GATE1.4R.1/)

| Viewport | Archivo | Estado capturado |
|---|---|---|
| 1440×900 | browser-landing-experto-1440.png | Landing del módulo = Experto, nav 2º nivel, zona Modo/Acciones |
| 1440×900 | browser-experto-datos-generales-1440.png | Sub-tab Datos Generales con ficha real |
| 1440×900 | browser-experto-estructura-1440.png | Sub-tab Estructura de Costos |
| 1440×900 | browser-experto-anexos-1440.png | Sub-tab Anexos (Firmas y Aprobaciones) |
| 1440×900 | browser-experto-plantillas-1440.png | Sub-tab Plantillas (Explorador) |
| 1440×900 | browser-generar-1440.png | Generar: Rápida/Masiva + tarjeta Arena FC |
| 1440×900 | browser-generacion-masiva-1440.png | Generación Masiva (componente + breadcrumb) |
| 1440×900 | browser-analisis-fichas-1440.png | Centro de Análisis + nav 2º nivel |
| 1440×900 | browser-arena-fc-1440.png | Arena FC comparador |
| 1440×900 | browser-modo-asistido-1440.png | Modo Asistido (wizard gráfico, pasos 1-5) |
| 1440×900 | browser-modo-informe-1440.png | Modo Informe (INFORME DE COSTO) |
| 1440×900 | browser-exportar-pdf-modal-1440.png | Modal Exportar Documentos (PDF) |
| 1440×900 | browser-palette-*.png (7) | Palette: experto/json/arena/asistido/informe/generación masiva/guardar |
| 1280×800 | browser-experto-1280.png | Arquitectura completa (nav+Modo/Acciones+sub-tabs+sidebar activo) |
| 1024×768 | browser-experto-1024.png | 1024 |
| 390×844 | mobile-390-experto.png / mobile-390-arena.png | Móvil Experto / Arena |
| 375×667 | mobile-375-generar.png | Móvil Generar |

## Matriz de flujos (mandato §26)

| Flujo | Ruta probada | Veredicto |
|---|---|---|
| A | Inicio → Fichas de Costo → Experto → Datos Generales → Estructura → Anexos (+ Plantillas) | PASS |
| B | Fichas de Costo → Generar → generación rápida (tab default + GENERAR AHORA) | PASS |
| C | Fichas de Costo → Generación Masiva | PASS |
| D | Fichas de Costo → Análisis de Fichas | PASS |
| E | Fichas de Costo → Arena FC | PASS (desktop + móvil) |
| F | ficha abierta: Modo→Asistido, Modo→Informe, Guardar Ficha, Importar JSON, Exportar Excel, Exportar PDF | PASS (ver 05/06) |

## Deep-links (§24) — re-verificados por URL

`?tab=main` · `?tab=gen-easy` · `?tab=massive-gen` · `?tab=cost-analytics` · `?tab=arena-fc` ·
`?tab=templates` · `?tab=view-assisted` · `?tab=view-reading` → todos renderizan su destino.
Identificadores públicos SIN cambios (los tabs técnicos conservan su id; solo labels visibles).

## Consola

`agent-browser errors` sin errores de página durante la sesión de pruebas.
