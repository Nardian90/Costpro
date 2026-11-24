# CP-PDF-EXECUTIVE-REPORT-001 · Diagnóstico forense del generador PDF anterior

**Módulo:** Inicio → ANÁLISIS → Comparar Productos · tab «INFORME EJECUTIVO»
**Fecha:** 2026-11-24 · **Rama:** `feat/informe-pdf-editorial-20261124`

## 1. Mecanismo real de generación (identificado antes de tocar código)

El PDF del informe NO es HTML+CSS: es un documento construido en cliente con
**jsPDF + jspdf-autotable** (carga diferida por `createPDFDocument` en
`src/lib/export/lazy-pdf.ts`, import dinámico con gate de bundle W2/W3):

```
ProductComparisonView.tsx (tab INFORME EJECUTIVO)
  ├─ buildInformeEjecutivo()          ← src/lib/product-comparison/informe.ts
  │    (motor analítico PURO: única fuente de redacción y cifras; el PDF no
  │     recalcula nada — se consume tal cual, regla §9 de la misión)
  ├─ buildInformeEjecutivoPdf()       ← informe-ejecutivo-pdf.ts  (ESTE archivo)
  │    ├─ vista preliminar → doc.output('bloburl') en iframe
  │    └─ Exportar PDF      → doc.save(nombre oficial)
  └─ Tablas: jspdf-autotable (encabezados repetidos, rowPageBreak 'avoid')
```

Los problemas procedían del **generador documental** (`informe-ejecutivo-pdf.ts`
del commit anterior, reutilizado del patrón «Reporte de Entrega»), no de CSS ni
de conversión HTML→PDF: no existe tal conversión en este informe.

## 2. Defectos del baseline (evidencia: `evidencia/antes_*.jpg`)

| # | Defecto de la misión | Causa raíz en el código anterior | Evidencia |
|---|---|---|---|
| 1 | Sin portada ejecutiva | Solo una banda institucional de 30 mm al inicio de la página 1; el contenido arrancaba en y=44 | `antes_B-mediana-1.jpg` |
| 2 | Encabezados huérfanos | El subtítulo del gráfico se dibujaba ANTES de medir el gráfico (`ensureSpace` dentro de `drawGrafico`): el título quedaba al pie de la página 1 y el gráfico saltaba a la 2 | `antes_B-mediana-1.jpg` (pie) + `-2.jpg` (gráfico) |
| 3 | Anexos a continuación del contenido (§7) | Anexos I-IV se dibujaban en el flujo continuo tras «Anexos» con un solo párrafo introductorio; ningún `addPage()` real | `antes_B-mediana-5.jpg` |
| 4 | Formato Letter, no A4 (§3) | `createPDFDocument('p','mm','letter')` | código línea 429 |
| 5 | Márgenes deficientes (§3) | `M = 15 mm` lateral + reserva inferior 18 mm (margen real ≈ 15-18 mm vs. 20-22 mm exigidos) | código líneas 91-93 |
| 6 | Jerarquía tipográfica débil (§3) | Título de portada 12.5 pt, secciones 11 pt, sin sistema de tamaños; cuerpo 9.2 pt | código líneas 452-454, 209 |
| 7 | Pie en la portada | El loop final numeraba «Página 1 de N» sobre la página 1 (la misión permite portada sin numeración) | `antes_B-mediana-1.jpg` |
| 8 | Páginas internas de tablas sin encabezado institucional | autoTable añadía páginas por salto sin `didDrawPage`; solo la tabla repetía SU encabezado de columnas | `antes_E-anexos-110-7.jpg` |
| 9 | Tabla de 10 columnas comprimida (§5) | Anexo I a 6.8 pt en Letter vertical (185.9 mm útiles); descripciones y montos al límite | `antes_E-anexos-110-7.jpg` |
| 10 | Dimensiones de página capturadas UNA vez | `pw/ph` leídos fuera del loop de pies: con orientación mixta habrían quedado mal calculados | código líneas 431-432 |

## 3. Decisiones de diseño del nuevo sistema editorial (§2-§8)

- **A4 vertical + márgenes de 20 mm** (retícula única; reserva inferior 20 mm).
- **Portada ejecutiva** (página 1, sin numeración): identificación editorial
  (kicker + título «COMPARACIÓN DE PRODUCTOS» 21 pt + subtítulo oficial),
  ficha institucional (entidad, períodos, elaboración/ámbito), resumen de
  indicadores y contenido del documento. Sin elementos de marca repetitivos.
- **Jerarquía tipográfica** (Helvetica, métrica Arial — compatibilidad total de
  exportación con fuentes estándar de PDF): portada 21 pt · secciones 13 pt con
  regla de acento · subtítulos 10.5 pt · cuerpo 9.3/4.9 · auxiliar 8.2 ·
  tablas 7.2-8.0 pt con cabecera en gris azulado y filas alternadas al 4 %.
- **Anexo I en orientación horizontal** (§5 lo autoriza para tablas que exceden
  el ancho útil): 10 columnas a 7.4 pt en 257 mm útiles; los saltos internos de
  autoTable conservan la orientación y repiten el encabezado de columnas.
- **Regla §7 implementada con el motor real**: `doc.addPage('a4', …)` antes de
  cada anexo (I, II, III y IV); nunca espacios ni saltos de línea simulados.
- **Identidad de anexo (§8)**: kicker «ANEXO I/II/III/IV» en acento con
  tracking, título 13 pt, regla, introducción del propio modelo y nota al pie
  de la tabla; los anexos extensos continúan con encabezados repetidos.
- **Guardas anti-huérfanos por bloque**: títulos de sección reservan
  título+primer bloque (46 mm); subtítulos de gráfico reservan el gráfico
  completo; títulos de tabla reservan subtítulo+intro+cabecera+2 filas (30 mm).
- **Pies de página**: línea + identificación del documento a la izquierda y
  «Página X de Y» en negrita a la derecha, dibujados en un loop final que lee
  las dimensiones DE CADA página (convivencia con páginas horizontales).
- **Encabezado institucional en páginas continuas** (título + entidad + regla),
  incluidas las páginas internas que autoTable añade, vía `didDrawPage`
  comparando el número ABSOLUTO de página (`getCurrentPageInfo()`; el
  `data.pageNumber` del hook es relativo a la tabla y no sirve).

## 4. Integridad del análisis (§9) — intocada

`src/lib/product-comparison/informe.ts` (algoritmos, selección, períodos,
cálculos, rankings, indicadores, redacción) NO se modificó: 0 líneas cambiadas.
El verificador `scripts/pdf-integrity-check.ts` demuestra celda a celda que el
PDF contiene exactamente las cifras del modelo (204 verificaciones PASS).

## 5. Limitación del entorno de verificación

El sandbox de trabajo tiene 4 GB de RAM: `tsc --noEmit` global y la fase
«Running TypeScript» de `next build` mueren por OOM ANTES de evaluar el código
(el compilado Turbopack de producción sí concluye: «Compiled successfully»).
Cobertura alternativa aplicada: type-check estricto dirigido al archivo (0
errores), ESLint del repo (0 errores), suites vitest del módulo (29/29) y el
build completo queda garantizado por el CI del PR (mismo que los PRs #1699-1701).
