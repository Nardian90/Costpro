# INFORME — Reporte Entrega: persistencia de configuración, panel lateral y Excel profesional sin corrupción

**Misión:** 2026-10-22 · **Módulo:** `Inicio → OPERACIÓN → Ventas → Reporte Entrega` · **Producto:** COSTPRO 4 Multitienda
**Rama:** `fix/reporte-entrega-config-panel-excel` · **PR:** (ver enlace en el cuerpo del PR de este commit)

---

## 1. Rama y commits

- Rama: `fix/reporte-entrega-config-panel-excel`, base `main` (head `7b6ce8b`, post-fusión de #1448).
- Archivos: 9 modificados + 1 nuevo (+1.705 / −1.031).
  - `src/components/views/terminal/views/cash/cash-report-core.ts` — persistencia del desglose laboral.
  - `src/components/views/terminal/views/cash/cash-report-pdf.ts` — nueva opción + persistencia de opciones + gating real en las 3 plantillas.
  - `src/components/views/terminal/views/cash/cash-report-excel.ts` — fix de la corrupción + reestructura espejo del PDF + impresión completa.
  - `src/components/views/terminal/views/cash/CashReportView.tsx` — panel lateral + restauración/persistencia + indicador de pendientes.
  - Tests: `cash-report-excel.test.tsx` (reescrita), `cash-report-view.test.tsx` (+12 de misión), `cash-report-options-persistence.test.ts` (nueva, 13), ajustes de mocks en 2 archivos.

## 2. Causa raíz de la falta de persistencia de «Desglose de efectivo»

Dos defectos independientes, ambos demostrados en código antes de tocar nada:

1. **Las opciones del documento NO tenían persistencia alguna.** `CashReportView` inicializaba `pdfOptions` con `useState(DEFAULT_PDF_OPTIONS)` y jamás leía/escribía `localStorage` — a diferencia de plantilla, orientación, denominaciones, nombres de firmas e historial, que SÍ persistían (claves legacy + `costpro:cash-report:*`). Al reabrir el módulo (o recargar), todas las opciones volvían a los defaults: el usuario activaba/modificaba el desglose, «Guardaba» (la entrada de historial) y la opción en sí se perdía.
2. **«Guardar desglose» solo persistía una entrada de HISTORIAL** (`costpro_cash_breakdown_history`, máx. 10): el conteo en marcha (`cupBreakdown`/`usdBreakdown`) vivía solo en memoria de React y se perdía al salir del módulo. Restaurar exigía buscar la entrada manualmente en «Restaurar».

**No se añadió una segunda fuente de verdad**: la misma única fuente (estado React + `localStorage` como capa de persistencia) se completó con las dos piezas que faltaban.

## 3. Clave y esquema de almacenamiento definitivos

| Clave | Esquema | Modelo de guardado |
|---|---|---|
| `costpro:cash-report:pdf-options:v1` | `{ [clave de CashReportPdfOptions]: boolean }` — solo claves conocidas del dominio; se valida clave a clave al cargar | **Automático al cambiar** (mismo patrón vigente de plantilla/orientación; no existía botón Guardar para las opciones) |
| `costpro:cash-report:working-breakdown:v1` | `{ CUP: Breakdown, USD: Breakdown, savedAt: string }` — conteos físicos por denominación, sin datos de ventas ni info sensible (mismo nivel que el historial que YA se guardaba) | **Explícito**: «Guardar desglose» / Restaurar historial persisten; «Limpiar» borra la preferencia |

Recuperación segura: JSON corrupto/antiguo → defaults/conteos vacíos; claves desconocidas o valores no booleanos se descartan y esa clave conserva el default; claves válidas se respetan (regla B-1: los defaults SOLO aplican sin preferencia válida). El versionado `:v1` evita colisiones con otros esquemas. `localStorage` no disponible → la interfaz no se bloquea (try/catch en todo, mismo patrón preexistente).

## 4. Valores predeterminados implementados

Activados por defecto cuando no hay preferencia previa (ya venían así en `DEFAULT_PDF_OPTIONS`; ahora son efectivos y documentados):

- [x] **Desglose de billetes** (`includeBreakdown`)
- [x] **Cuadre USD** (`includeUsd`)
- [x] **Líneas de firma** (`includeSignature`)
- [x] **USD en hoja separada** (`usdSeparatePage`)
- [x] **Desglose de efectivo** (`includeCashBreakdown` — nueva opción; inicial `true` = coherente con el comportamiento preexistente del Diario, que renderizaba el bloque incondicionalmente; NO se confunde con «Desglose de billetes»: esta gobierna el bloque completo, aquella las filas por denominación dentro del bloque)

Resto de defaults sin cambio: `detailPayments`/`detailProduction` false, `includeOtReport`/`includeCommissionColumn` true.

**Hallazgo corregido de paso:** «Desglose billetes» NO tenía efecto en la plantilla Diario (solo en Estándar) — opción visual sin efecto funcional. Ahora gobierna las filas por denominación en las tres plantillas, y «Desglose de efectivo» gobierna el bloque completo con efecto consistente en **UI** (pestaña de conteo + cuadro de cuadre en Resultados), **PDF** (Diario/Estándar) y **Excel**.

## 5. Panel lateral y accesibilidad

- **Estructura:** la configuración de documento (Tipo de reporte, Orientación, Opciones del documento con los 9 toggles, Nombres del pie de firmas) vive en un **drawer lateral derecho** (420px en escritorio, hoja completa en móvil) que **no desplaza la interfaz**. La vista principal prioriza: tarjeta de Periodo (filtro esencial) + pestañas (Resultados/Desglose/Vista previa) + Generar/Exportar en el encabezado.
- **Comportamiento:** se abre con el botón visible «Configuración del reporte» (en el encabezado, `aria-haspopup="dialog"`); se cierra con botón explícito, backdrop o **Escape**; el **foco** entra al panel al abrirse y **vuelve al disparador** al cerrarse; los valores se conservan al abrir/cerrar (mismo estado React); la vista previa y los filtros no se reinician (la firma de cache no cambia por abrir/cerrar).
- **A11y:** `role="dialog"` + `aria-modal` + `aria-labelledby`; controles nativos (radiogroup con `role="radio"`/`aria-checked`, toggles con `aria-pressed`, inputs con `label` asociado) → navegación por teclado en orden natural y foco visible; estados hover/activo/guardado con la identidad visual COSTPRO (mismos componentes y clases, sin estilos globales nuevos).
- **Indicador de pendientes:** con el guardado explícito del conteo, «Guardar desglose» muestra un punto discreto cuando hay cambios sin guardar y el estado («Guardado {fecha} — se restaura al reabrir» / «Conteo sin guardar…») — nunca indica «guardado» falso. Para las opciones de documento rige el patrón auto (documentado en el pie del panel).

## 6. Causa raíz del archivo Excel dañado

**Reproducción forense del binario (antes de tocar el generador):** se generó el .xlsx con el código vigente y se desempaquetó el ZIP. En `xl/workbook.xml` del archivo final, el elemento `<calcPr>` quedaba insertado **entre** `</sheets>` y `<definedNames>`:

```
workbook → workbookPr → sheets → calcPr → definedNames   ← ORDEN INVÁLIDO
```

El esquema **CT_Workbook** (ECMA-376 §18.2.10) exige la secuencia `… sheets → functionGroups? → externalReferences? → definedNames? → calcPr? …`. La causa exacta: en `patchWorkbook`, el regex alternado `/(<\/definedNames>|<\/sheets>)/` (sin bandera `g`) empareja `</sheets>` **primero** porque aparece antes en el documento, e inserta `<calcPr fullCalcOnLoad="1"/>` en esa posición. El PR #1446 (sin fórmulas) no inyectaba `calcPr`; el #1448 añadió fórmulas + `Print_Titles`/autofiltro (→ `definedNames` existe) y con ello activó el bug: **Excel de escritorio valida el orden de elementos de workbook.xml y declara el archivo dañado** («hemos detectado un problema con el contenido»). openpyxl y LibreOffice toleran el desorden — por eso el round-trip del CI nunca lo detectó y solo el usuario con Excel real lo sufría.

**Corrección:** `injectCalcPrInWorkbookXml()` inserta `calcPr` SIEMPRE tras `</definedNames>` cuando existen (y solo tras `</sheets>` en su ausencia), con prueba de regresión unitaria del orden + prueba de regresión integrada sobre el binario final (assert del orden `sheets < definedNames < calcPr` del XML real del blob).

## 7. Biblioteca utilizada y razón de su elección

**`xlsx-js-style` ^1.2.0 + `jszip` ^3.10.1** (ya presentes en el stack, adoptadas en las misiones anteriores):
- `xlsx-js-style`: fork de SheetJS con **estilos de celda** (negrita, rellenos, bordes, alineación, formatos numéricos) que SheetJS comunitario no escribe — requisito de «documento empresarial terminado, no una tabla sin formato». Serializa .xlsx real (ZIP+OOXML), mantiene `@e965/xlsx` sin cambios.
- `jszip`: post-proceso quirúrgico de las piezas que `xlsx-js-style` no escribe (pane congelado, `pageSetup`, `headerFooter`, `calcPr`) — dependencia ya directa del stack, sin añadir nada nuevo.
- Alternativas descartadas: ExcelJS (nueva dependencia pesada + reescritura completa del módulo ya verificado), SheetJS puro (sin estilos), CSV renominado (prohibido por la misión).

## 8. Validaciones estructurales del .xlsx (D3) — todas ejecutadas

Sobre el blob final y sobre el archivo real exportado desde la app en ejecución:

1. ZIP válido (JSZip + zipfile) ✓
2. `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels` presentes ✓
3. Todos los XML internos parseables (DOMParser + ElementTree) ✓
4. El libro abre con lector compatible (round-trip `XLSX.read` + **openpyxl**) ✓
5. Nombres de hoja, dimensiones, celdas y valores numéricos verificados (`t="n"`, `z="#,##0.00"`, valores cacheados = fórmula central) ✓
6. Descarga real del binario en el navegador (exportación en la app en marcha → `COSTPRO_Reporte_Entrega_ENERVIDA-VITALLCONS_2026-10-22.xlsx`, toast de éxito) y validación forense del archivo descargado: **orden `sheets < definedNames < calcPr` VÁLIDO** ✓
7. **Microsoft Excel de escritorio NO disponible en este entorno** — se declara la limitación. En su lugar: validación del orden contra el esquema ECMA-376 (la regla exacta que Excel aplica), openpyxl, **LibreOffice Calc** (conversión sin errores) y análisis XML directo.

## 9. Evidencia visual del Excel (pantalla e impresión)

- **Vista de impresión** (LibreOffice Calc → PDF, 5 páginas A4 **apaisadas** 841.89×595.3pt): `download/excel-repro/print-pdf/` (PDF + PNG por página). Inspección asistida por visión: «impecablemente formateada para impresión… sin cortes ni contenido amontonado… numeración Página 1 de 5».
- **Exportación real en la app** (capturas): `download/evidencia-panel/` — 01 vista principal, 02 panel de configuración abierto, 03 reporte generado, 04 exportación Excel con toast de éxito, 05 pestaña Desglose de efectivo, 06 vista previa del PDF.
- Impresión configurada expresamente: A4 (`paperSize="9"`), orientación por columnas (horizontal en hojas con tabla, vertical en la nota), `fitToWidth="1" fitToHeight="0"` (el largo fluye a páginas legibles), márgenes equilibrados, **área de impresión delimitada** (`_xlnm.Print_Area` al rango usado), **encabezado de tabla repetido** al imprimir (`_xlnm.Print_Titles`, solo en hojas de una tabla — en modo compacto no se repite un encabezado CUP sobre filas USD), **encabezado/pie con numeración** (`&P de &N`), paneles congelados tras el bloque de identidad.

## 10. Comparación de totales Excel ↔ PDF ↔ UI

Mismo fixture (17/10/2026 EnerVida) generado con el builder REAL por las tres vías:

| Total | PDF (texto extraído) | Excel (celdas, valores cacheados) | Fórmula central (computeDailySummary) |
|---|---|---|---|
| Ventas totales CUP | 169.000,00 | 169000 | 169000 |
| Ventas en efectivo CUP | 169.000,00 | 169000 | 169000 |
| Efectivo esperado CUP | 169.000,00 | 169000 | 169000 |
| Efectivo contado CUP | 169.000,00 | 169000 | 169000 |
| Ventas USD / contado USD | 150,00 | 150 | 150 |

Las tres superficies comparten fuente (`fetchDiarioSummaries` + `computeDailySummary` + `salesTable*`); los tests de regresión fijan la igualdad numérica y de estructura.

## 11. Resultados de las pruebas

**Automatizadas (vitest):**
- Suite COMPLETA: **3693 passed / 0 failed** (46 skipped preexistentes; 232 archivos).
- Nuevas/actualizadas de la misión: Excel 27 (estructura espejo, opciones con efecto, **regresión del orden XML**, ZIP/XML, fórmulas, round-trip, anti-inyección, reproducibilidad), persistencia 13 (reales, sin mocks: defaults/claves/corrupción/antiguo/esquema), vista +12 (F-1/2/5/6/7/8/9/10/12 + Limpiar + corrupción + gating de pestaña) y mocks de 3 archivos actualizados.
- eslint: 0 errores (33 warnings preexistentes de `<button>` crudo, estilo del codebase).
- tsc: 0 errores. Contrato de seguridad estático: 137/137, 0 divergencias.

**Manuales/en vivo (app real, BD viva):** F-1 (defaults ON en el panel), F-2 (toggle → persistido → recarga de página → se conserva), F-14 (exportación con opciones ON), F-20-descarga (toast + archivo), y validación forense del binario descargado real.

**Casos NO ejecutados y limitaciones (declarados):**
- **F-11 pantalla estrecha física**: el panel es responsive por clases (`w-full sm:w-[420px]`) y el test cubre la lógica, pero no se probó en un dispositivo físico real.
- **F-18 multipágina extrema**: la impresión multipágina se validó con 5 páginas A4 del fixture; no se generó un período de cientos de filas.
- **F-21 permisos por tienda en la exportación Excel**: la exportación es client-side con el reporte YA calculado por `/api/cash-report` (que aplica autorización y aislamiento por tienda — verificado en misiones anteriores); no se añadió un caso nuevo porque no se tocó ninguna ruta de API.
- **Excel de escritorio**: no disponible en el entorno (ver §8).

## 12. PR preparado para revisión humana — SIN FUSIONAR

PR nuevo sobre `main` con la rama `fix/reporte-entrega-config-panel-excel`. Sin merge, sin despliegue, sin modificaciones de producción (solo lecturas del reporte ya calculado; la exportación es de solo lectura y no crea ventas ni movimientos). Ninguna funcionalidad existente eliminada: se conservan fórmulas reales, comprobaciones de consistencia (ahora en la misma hoja), autofiltro, OT, nota metodológica, historial y todas las capacidades del desglose.

**Criterios de cierre:** las preferencias persisten (§2-3, probado en vivo con recarga), las cuatro opciones tienen los defaults solicitados (§4, probado), el panel lateral funciona con a11y (§5, probado incl. Escape/foco), y el Excel abre como libro válido con presentación profesional de impresión (§6-9, probado incl. el archivo real descargado de la app).

---

## 13. REFINAMIENTO 2026-10-22 (feedback del propietario sobre el Excel exportado)

Tras revisar el Excel real exportado, el propietario pidió cuatro ajustes de limpieza («la tercera imagen es como espero que quede, lo mismo aplica para el USD»). Todos aplicados a las hojas «Reporte Entrega» y «Reporte Entrega USD»:

| # | Feedback | Implementación |
|---|----------|----------------|
| 1 | «Tipo de reporte» y «Monedas…» no son necesarios | Filas eliminadas de la hoja; la metodología de monedas vive en «Nota metodológica» |
| 2 | Tienda/Dirección/Período/Generado «puede estar en dos filas y no en 4» | Identidad compacta: fila 1 = Tienda \| Período, fila 2 = Dirección \| Generado (hoja USD: fila 1 = Tienda \| Período, fila 2 = Generado) |
| 3 | «* Importe cobrado difiere…» tampoco es necesario | Nota al pie eliminada y el asterisco ya no se prefija al nombre del producto (tabla limpia; los importes cobrados reales se conservan) |
| 4 | «las filas que pone inmovilizadas son innecesarias» | Paneles congelados eliminados de TODAS las hojas (sin `<pane>` en ningún XML de hoja) |

**Corrección adicional (gap preexistente detectado al refinar):** la fila `TOTALES` de la tabla de ventas no entraba en las listas de estilo → salía con formato «General», sin negrita ni relleno (a diferencia de los demás totales). Ahora lleva `#,##0.00`, negrita, relleno y línea superior — igual que «Efectivo esperado» y «Efectivo contado», como en el PDF de entrega.

**Sección «COMPROBACIÓN DE CONSISTENCIA» retirada del documento** (CUP y USD): era verificación de auditoría redundante para el documento de entrega (los TOTALES son `=SUM` vivos, por lo que la coincidencia tabla↔resumen se verifica al editar cualquier celda). La «Nota metodológica» ahora lo explica así. El PDF de entrega nunca la imprimió — el Excel queda más espejo del PDF.

**Pruebas:** 30/30 en `cash-report-excel.test.tsx` (3 nuevas de regresión: identidad compacta sin metadatos, incidencias sin asterisco ni nota al pie, ninguna hoja con `<pane>`; round-trip y cuadre actualizados; aserción del estilo de TOTALES). Relacionadas: vista 37/37, botón 3/3, persistencia 13/13. tsc 0 errores · eslint 0 errores.

**Evidencia real:** `download/reporte-entrega-evidencia-excel.xlsx` regenerado con el builder de producción (fixture 17/10 EnerVida) e inspeccionado con openpyxl (aplicación compatible): identidad 2 filas, sin metadatos/comprobación/nota al pie/congelado, A4 landscape fitToWidth=1, numeración «Página N de M», Print_Titles por hoja, TOTALES con `=SUM` + `#,##0.00` + negrita. Vista de impresión LibreOffice → PDF 4 páginas A4 apaisadas, verificada visualmente (VLM): encabezado compacto, sin secciones extrañas, TOTALES destacado, sin paneles, numeración correcta.
