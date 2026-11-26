# ADN-ANALISIS-COMPARAR-PRODUCTOS-EXECUTIVE-PDF-001 · Informe final

**Misión:** rediseño ejecutivo premium del PDF de «Comparar Productos» — de impresión de tablas a herramienta de dirección empresarial.
**Módulo:** Inicio → ANÁLISIS → Comparar Productos · tab «INFORME EJECUTIVO»
**Fecha:** 2026-11-26 · **Rama:** `feat/comparar-productos-executive-pdf-20261126`
**REGLA §10 cumplida:** la lógica de negocio está INTACTA — `buildComparison` sin tocar; `buildInformeEjecutivo` solo recibe extensiones ADDITIVAS (derivaciones de los MISMOS cálculos y evaluaciones); cero reglas, umbrales, rankings, cobertura o conciliación modificados.

---

## 1. Problemas encontrados (auditoría FASE 0)

El baseline (PR #1702/#1705, CP-PDF-EXECUTIVE-REPORT-001) era editorialmente correcto pero quedaba corto frente a la nueva misión:

| # | Brecha (§ misión) | Situación del baseline |
|---|---|---|
| 1 | Tipografía (§7) | Cuerpo 9.3 pt, tablas 7.2-7.6 pt, secciones 13 pt, título 21 pt, indicadores 14.5-15 pt — por debajo del estándar solicitado (12 / 10.5-11 / 17-20 / 24-30 / 22-30 pt) |
| 2 | Gráficos (§4) | UN solo gráfico comparativo pequeño con colores hard-coded; faltaban el divergente de variaciones y el de cobertura/riesgo |
| 3 | Coherencia con Estados Financieros (§2) | La paleta del gráfico no provenía de los tokens del gráfico de referencia «Evolución acumulada de ventas» |
| 4 | Tablas (§6) | Anexo I de 10 columnas comprimido a 7.4 pt; §6 pide separar información comercial de cantidades |
| 5 | Narrativa (§5) | Diagnóstico sólido pero sin estructura explícita ¿qué ocurrió / riesgo / decisión?; recomendaciones sin bloques Evidencia/Acción separados |
| 6 | Resumen <1 min (§3) | No existía como bloque explícito |
| 7 | SEO/Documento (§9) | Sin metadatos PDF, sin marcadores de navegación, sin enlaces internos ni índice con páginas |
| 8 | Legibilidad (§7) | Estados comunicados solo por color en la matriz (sin etiqueta textual en el gráfico de cobertura) |

## 2. Componentes reutilizados de Estados Financieros (§2)

- **Referencia localizada:** «Evolución acumulada de ventas» = `SalesRhythmDashboard.tsx` (recharts `LineChart`), con tokens de `src/lib/sales-dashboard/chart-theme.ts`.
- **Tokens adoptados en el PDF (CHART_THEME_LIGHT):** `series[0]` **#15803d** (período analizado), `axis` **#475569** (tramo comparable), `negative` **#dc2626** (reducciones/agotado), `grid` **#cbd5e1**, `series[2]` **#b45309** (cobertura moderada).
- **Patrones replicados:** leyenda diferenciada, escala con formato compacto, grid punteado, rótulos de eje, jerarquía título-nota. El motor del PDF sigue siendo jsPDF (vectorial, sin rasterizar): se replican los TOKENS, no el motor — así Estados Financieros queda 100 % intacto (0 líneas modificadas) y ambos módulos comparten idioma visual.

## 3. Mejoras realizadas

### Portada ejecutiva (§3)
- Título 26 pt + ficha institucional; **dashboard de indicadores**: fila hero «Ingresos del conjunto» / «Variación vs. tramo comparable» a 26 pt con descripción y contexto en cada tarjeta (el alcance estadístico queda explícito: «mide solo el conjunto comparado, no la tienda completa»).
- Grupos semánticos: DESEMPEÑO COMERCIAL (crecimiento/contracción/sin ventas, 15.5 pt) y DISPONIBILIDAD E INVENTARIO (agotados/cobertura), con explicación breve bajo cada cifra.
- Banda «PRODUCTO LÍDER DEL PERÍODO» + **«LA SITUACIÓN EN UN MINUTO»** (resumen gerencial de 5 viñetas derivado del motor: ingresos y variación con advertencia de alcance cuando es negativo, líder, movimiento del ranking, disponibilidad, decisión urgente).
- Cifras NUNCA truncadas: ajuste tipográfico adaptativo y, en magnitudes extremas, cifra compacta con valor EXACTO trasladado al contexto.

### Gráficos analíticos (§4)
- **A · Comparación (3.A):** barras horizontales agrupadas — nombre del producto, dos barras por producto (gris anterior / verde actual), valores al final de cada barra, marcador de tendencia **vectorial** (triángulo ▲ verde / ▼ rojo / punto gris + diferencia compacta), leyenda diferenciada y nota que explica las barras ausentes (nuevo o dejó de venderse). Selección razonable: los productos de mayor impacto definidos por el motor (`GRAFICO_MAX_PRODUCTOS`).
- **B · Variaciones divergentes (3.B):** mayores incrementos (verde, derecha) y reducciones (rojo, izquierda) con eje cero; valores al extremo con % SOLO con base comparable; los productos nuevos llevan etiqueta **NUEVO** y jamás un porcentaje ficticio (§4.D).
- **C · Cobertura (3.C):** barras de cobertura estimada en días con umbrales D/2 y D dibujados (los MISMOS del motor), estados diferenciados por color Y etiqueta textual (AGOTADO / Cobertura insuficiente / Cobertura moderada / Baja rotación — nunca solo color, §7), escala en días, tope 12 casos por severidad con nota hacia el Anexo II.
- **Integridad gráfica (§4.D):** cero series inventadas; la vista sigue usando agregados de dos períodos (no simula evolución diaria).

### Narrativa gerencial (§5)
- El diagnóstico responde explícitamente: **¿Qué ocurrió en el período?** (párrafos del motor) → **¿Qué riesgo u oportunidad representa?** (lectura por severidades) → **¿Qué decisión se recomienda?** (banda CONCLUSIÓN GERENCIAL destacada).
- Recomendaciones en **bloques** (no celdas gigantes) agrupados CRÍTICA / ALTA · MEDIA · PREVENTIVA con chip de nivel, producto 12 pt, **EVIDENCIA E INTERPRETACIÓN** y **ACCIÓN RECOMENDADA** etiquetadas — contenido real del motor, sin plantillas repetidas.
- El alcance estadístico se recuerda en portada, diagnóstico y metodología (una caída del conjunto comparado no se presenta como caída de toda la tienda).

### Tablas y editorial (§6, §8)
- Tablas a **10.5 pt** (cabecera 10.2 bold), filas alternas con contraste visible, `rowPageBreak: 'avoid'`, encabezados repetidos en multipágina, anchos automáticos por contenido (`anchosAuto`) que evitan partir cabeceras y cifras.
- **Anexo I separado en I-A (ranking comercial, horizontal) e I-B (cantidades, vertical)** — §6: separar comercial de cantidades; sin perder información.
- Anexos II/III/IV en páginas propias con identidad; flujo natural sin páginas casi vacías; A4 y márgenes 20 mm conservados.

### Tipografía y accesibilidad (§7)
- Portada 26 · indicadores 26/15.5 · secciones 17.5 · subtítulos 12.5 · cuerpo 11.3 · auxiliar 9.8 · notas 9.0 · tablas 10.5 pt.
- Estados de cobertura con color + texto; marcadores de tendencia vectoriales (glifos ▲/▼ no renderizables en WinAnsi — lección aplicada de 29d185c55).

### SEO y documento buscable (§9)
- Metadatos: `Title: Informe ejecutivo de comparación de productos — {entidad}`, `Subject`, `Author: ADNegocio (CostPro)`, `Keywords`, `Creator`.
- **9 marcadores de navegación** (outline) con las páginas reales de cada sección/anexo.
- **Índice con enlaces internos** (navegación por clic) y numeración «Página X de Y».
- Texto 100 % seleccionable/buscable (verificado con pdftotext y pypdf). Informe privado: sin exposición pública.

## 4. Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/components/views/terminal/views/product_comparison/informe-ejecutivo-pdf.ts` | Rediseño integral del generador (sistema tipográfico, dashboard de portada, 3 gráficos con tokens de la referencia, bloques de recomendaciones, I-A/I-B, metadatos, marcadores, índice con enlaces). |
| `src/lib/product-comparison/informe.ts` | Extensiones ADDITIVAS: interfaces `InformeVariacion`/`InformeCoberturaItem`, campos `variaciones`, `riesgoCobertura`, `resumenGerencial` — derivados de las MISMAS filas/evaluaciones (cero reglas nuevas; secciones existentes intactas). |
| `scripts/pdf-integrity-check.ts` | Verificador ampliado: 231 verificaciones (indicadores, conciliación, conclusión, Anexo I celda a celda, resumen gerencial, prioridades evidencia/decisión, estructura 1-4 + ANEXO I-A/I-B, metadatos vía pdfinfo). |
| `docs/audits/ADN-ANALISIS-COMPARAR-PRODUCTOS-EXECUTIVE-PDF-001/` | Este informe + 15 evidencias (capturas antes/después y muestras PDF). |

`compare.ts`, la vista `ProductComparisonView.tsx` y TODA la lógica de análisis: **0 cambios**.

## 5. Pruebas ejecutadas

| Verificación | Resultado |
|---|---|
| `tsc --noEmit` (proyecto completo) | **0 errores** |
| ESLint (generador + motor) | **0 errores** |
| Vitest del módulo (informe + comparación + vista con PDF real en jsdom + navegación) | **44/44 PASS** |
| Integridad de datos (`scripts/pdf-integrity-check.ts`) | **PASS — 231 verificaciones** (todas las celdas del Anexo I fila a fila, indicadores, conciliación, conclusión, resumen gerencial, prioridades, estructura, metadatos) |
| Estrés documental A-F (`scripts/pdf-informe-stress.ts`) | 6/6 escenarios generados: A 15 págs · B 19 · C 22 · D 20 · E 37 (109 productos) · F 37 (montos de $116 mil millones y nombres de 80-120 caracteres) |
| Metadatos + marcadores (pypdf/pdfinfo) | Title/Subject/Author/Keywords correctos; 9 marcadores con páginas correctas; texto seleccionable |
| Revisión visual página a página (pdftoppm 90 dpi + VLM) | Portada, índice, diagnóstico, prioridades, 3 gráficos, complementario, anexos I-A/I-B/II/IV, continuación de anexos en E y magnitudes extremas en F — **conformes** (defectos detectados durante la iteración: truncamiento de cifras hero, solape de portada, glifos no WinAnsi, subtítulo huérfano de gráfico, etiquetas cortadas, cabeceras partidas — TODOS corregidos y re-verificados) |

## 6. Antes / después (resumen)

| Aspecto | Antes | Después |
|---|---|---|
| Portada | indicadores en líneas pequeñas | dashboard ejecutivo (cifras 26 pt + contexto) + líder + resumen <1 min |
| Gráficos | 1 comparativo pequeño | 3 analíticos (A/B/C) con paleta de Estados Financieros |
| Cuerpo/tablas | 9.3 / 7.2-7.6 pt | 11.3 / 10.5 pt |
| Anexo I | 10 columnas a 7.4 pt | I-A comercial + I-B cantidades a 10.5 pt |
| Recomendaciones | matriz de 4 columnas | bloques por severidad con EVIDENCIA/ACCIÓN |
| Navegación | sin marcadores ni enlaces | índice con enlaces + 9 marcadores + metadatos |
| Páginas (escenario B) | 10 | 19 (mayor legibilidad, anexos completos) |

## 7. Limitaciones pendientes

1. La comparación se basa en agregados de dos tramos (fuente oficial): no existe evolución diaria por producto para «Evolución acumulada» por producto — se usan gráficos comparativos apropiados (§4.D) y NO se simulan series.
2. La cobertura sigue siendo una estimación operativa con existencia instantánea (sin plazos de reposición ni inventario de seguridad parametrizados): el gráfico no fija fechas de agotamiento.
3. En magnitudes excepcionales (escenario F: montos de 9-12 dígitos) las celdas numéricas del Anexo I-A reducen su fuente hasta el mínimo 7.6 pt antes de partir un dígito — preserva la cifra exacta con legibilidad aceptable; en operación real esos montos son atípicos.
4. La banda «PRODUCTO LÍDER DEL PERÍODO» de la portada aparece solo cuando el agregado oficial informa participación del líder (misma condición del motor).
5. El índice queda en la página 2 cuando el dashboard + resumen ocupan la portada completa (flujos con indicadores de 3 líneas de etiqueta); el diseño lo resuelve automáticamente sin solapes.

## 8. Entregables

- Muestras reales en `evidencia/`: `muestra_antes_B.pdf` (baseline) · `muestra_despues_B.pdf` · `muestra_despues_F-magnitudes.pdf` + 12 capturas antes/después.
- Reproducibles: `bun run scripts/pdf-informe-stress.ts --out <dir> --tag <prefijo>` (escenarios A-F) y `bun run scripts/pdf-integrity-check.ts`.
