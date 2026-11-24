# CP-PDF-EXECUTIVE-REPORT-001 · Resultados, pruebas de estrés y criterios de aceptación

**Fecha:** 2026-11-24 · **Rama:** `feat/informe-pdf-editorial-20261124`

## 1. Pruebas de estrés documental (§10) — 6 escenarios, render visual real

Ejecución reproducible: `bun run scripts/pdf-informe-stress.ts --out <dir> --tag <prefijo>`
(misma cadena de producción que la aplicación: `buildComparison →
buildInformeEjecutivo → buildInformeEjecutivoPdf`; fixtures en memoria, sin BD).

| Escenario | Contenido | Antes (Letter, flujo) | Después (A4 editorial) | Inspección visual |
|---|---|---|---|---|
| A · pequeña | 4 productos, casos reales del enunciado | 5 págs. | 8 págs. | portada + anexos en páginas propias |
| B · mediana | 14 productos, 5 complementarias, 12 prioridades | 7 págs. | 10 págs. | gráfico sin huérfanos; Anexos I-IV en páginas nuevas |
| C · extensa | 40 productos | 9 págs. | 12 págs. | Anexo I horizontal multipágina con cabeceras repetidas |
| D · conclusiones extensas | 28 productos caídas fuertes, matriz llena | 8 págs. | 12 págs. | matriz con filas dinámicas, sin partidas |
| E · anexos extensos | 109 productos (Anexo I 3 págs. horiz., Anexo II 3 págs.) | 14 págs. | 18 págs. | encabezado institucional en TODAS las páginas internas |
| F · nombres largos + magnitudes | 30 productos, descripciones de 80-120 caracteres, montos de decenas a $116 mil millones | 12 págs. | 16 págs. | nombres envueltos sin invadir columnas numéricas |

Comprobaciones en cada escenario: sin superposiciones, sin pérdida de
información, tablas legibles, anexos en páginas independientes, márgenes
consistentes, numeración correcta, encabezados y pies correctamente ubicados.

## 2. Criterios de aceptación (§11)

| Criterio | Resultado |
|---|---|
| Tipografía — jerarquía profesional | CUMPLE · portada 21 pt, secciones 13 pt, subtítulos 10.5, cuerpo 9.3, auxiliar 8.2 |
| Márgenes uniformes | CUMPLE · 20 mm laterales + reserva inferior 20 mm en todo el documento |
| Espaciado consistente | CUMPLE · interlineados fijos por rol (4.9 cuerpo, 4.0 auxiliar, 3.8 notas) |
| Sangrías | CUMPLE · sin sangrías arbitrarias; párrafos de una sola columna a ancho completo |
| Tablas claras y legibles | CUMPLE · cabecera gris azulado + regla superior, filas alternadas 4 %, rejilla 0.12 mm |
| Textos largos sin superposición | CUMPLE · `overflow: linebreak` + alturas dinámicas verificadas en F |
| Filas extensas con altura dinámica | CUMPLE · ninguna fila partida (`rowPageBreak: 'avoid'`) |
| Continuación de tablas | CUMPLE · autoTable repite el encabezado de columnas en cada página |
| Encabezados institucionales en páginas internas de tablas | CUMPLE · `didDrawPage` + `getCurrentPageInfo()` (fix de defecto detectado en E/F) |
| Conclusiones — paginación correcta | CUMPLE · banda CONCLUSIÓN GERENCIAL medida antes de dibujar (nunca partida) |
| Anexo I en página nueva obligatoria | CUMPLE · `addPage('a4','landscape')` real |
| Anexo II en página nueva obligatoria | CUMPLE · `addPage('a4','portrait')` real |
| Anexos III y IV en página nueva | CUMPLE · `addPage()` real para cada uno |
| Anexos extensos — continuación ordenada | CUMPLE · E: Anexo I en 4 páginas horizontales, Anexo II en 3, con cabeceras repetidas |
| Numeración correcta | CUMPLE · «Página X de Y» en todas las páginas salvo portada (§4: «puede estar libre de numeración») |
| Integridad de datos | CUMPLE · 204/204 verificaciones (`scripts/pdf-integrity-check.ts`), informe.ts intacto (0 diffs) |

## 3. Verificación de integridad (§12.9) — método y resultado

`bun run scripts/pdf-integrity-check.ts` genera el informe con el fixture del
escenario B, construye el PDF, extrae su texto con `pdftotext` y exige:

- los valores de TODOS los indicadores relevantes (7/7);
- la conciliación del conjunto (productos analizados);
- la conclusión gerencial completa;
- **el Anexo I completo: 16 filas × 10 columnas verificadas celda a celda**;
- primera y última fila del Anexo II y del Anexo III;
- estructura: secciones 1-3, identificaciones ANEXO I-IV, portada (título,
  entidad, períodos).

Resultado: **PASS 204/204**. Las celdas de texto largo se verifican por tokens
porque `pdftotext -layout` intercala las líneas envueltas con las celdas
vecinas (artefacto de extracción, no del PDF — verificado visualmente en el
zoom 150 dpi `evidencia/despues_B-anexo1-cabecera-150dpi.jpg`).

## 4. Resultados TypeScript / ESLint / pruebas / build (§12.10)

| Verificación | Resultado |
|---|---|
| `tsc` estricto dirigido al generador | 0 errores |
| `tsc --noEmit` global | OOM del sandbox (4 GB RAM) — lo cubre el CI del PR |
| `eslint src` (repo completo) | 0 errores (1632 warnings preexistentes del repo; el archivo nuevo no añade ninguno) |
| `vitest` módulo comparación (lib + vista + navegación) | 29/29 PASS (el test de la vista construye el PDF real en jsdom) |
| `next build` (producción, Turbopack) | **Compiled successfully in 63s**; fase «Running TypeScript» OOM del sandbox (límite de RAM, no del código) — el CI del PR ejecuta el build completo |
| Gate de bundle | sin dependencias nuevas (jsPDF/autotable ya existían con carga diferida; se conserva el gate W2/W3) |

## 5. Comparación antes/después (resumen visual)

| Aspecto | Antes | Después |
|---|---|---|
| Primera página | banda pequeña + diagnóstico apretado | portada ejecutiva completa sin numeración |
| Gráfico | título huérfano al pie de pág. 1 | título+gráfico como bloque indivisible |
| Anexos | flujo continuo a mitad de página | ANEXO I en horizontal, II/III/IV en páginas nuevas propias |
| Páginas internas de tablas | sin encabezado institucional | encabezado institucional en todas |
| Anexo I (10 col.) | 6.8 pt comprimido en Letter vertical | 7.4 pt en A4 horizontal (257 mm útiles) |
| Pie | en todas las páginas incl. portada | identificación + «Página X de Y» desde la pág. 2 |

Evidencia gráfica: `evidencia/` (antes_*, despues_*, muestra_*.pdf).
