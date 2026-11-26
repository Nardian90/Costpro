# ADNEGOCIO-PDF-REPORT-POLISH-002 · INFORME
## Corrección de gráficos, contenedores de texto y composición editorial del Informe Ejecutivo

- **Fecha:** 2026-11-27
- **Rama:** `fix/informe-pdf-report-polish-20261127`
- **Base:** `main` @ 819c0adca (incluye PR #1722, rediseño ejecutivo ya fusionado)
- **Documento de referencia:** `Informe3.pdf` (adjunto de la misión). **Nota:** el adjunto NO llegó al sandbox (solo llegó la plantilla de prompt de inicio). La verificación se realizó con una **réplica fiel** construida con la MISMA cadena de producción real (`PeriodProductRow[] → buildComparison → buildInformeEjecutivo → buildInformeEjecutivoPdf → PDF`) y los hechos citados literalmente en la misión (ALTA Inicio Z «$30,600.00 CUP … 0.35 unidad/día»; AGOTADO «No calculable (sin existencia)» y «No calculable (sin ventas en el tramo)»; gráfico 3.C en página 9; bloques ALTA Espejo/Mortero/Inicio Z en páginas 2–6). La réplica reproduce página a página la composición descrita (3.C cae en la página 9).

---

## 1. Causa técnica de las líneas discontinuas superpuestas (gráfico 3.C)

En `drawGraficoCobertura` las guías D/2 y D se trazaban con:

```
doc.line(xUm, yStart + headerH + 1, xUm, rowsEndY);
```

donde `rowsEndY` cubría **TODAS** las filas del gráfico. Como `seleccionCobertura` ordena los casos `agotado` en primer lugar, las filas AGOTADO (cuyas etiquetas textuales se dibujaban en `xBar + 1.5`, DENTRO de la zona de barras) quedaban siempre bajo las guías: el texto «AGOTADO — No calculable (…)» sobrepasaba las posiciones D/2 y D y las líneas lo atravesaban. Además, aunque NINGÚN caso tuviera cobertura cuantificable, se dibujaban igualmente escala, eje y umbrales (`maxCobertura` caía al valor por defecto `diasPeriodo * 1.15`), produciendo una composición sin sentido.

**Corrección (§1 de la misión):**
- **Arquitectura por zonas** (`zonasCobertura`): 1) columna de nombres; 2) zona de cobertura CUANTITATIVA (barras + escala + umbrales); 3) zona de estados CUALITATIVOS (chips textuales de los casos no calculables, sin posicionarse sobre una escala); 4) escala al pie de la zona cuantitativa; 5) leyenda con SOLO los estados presentes.
- Las guías D/2 y D se trazan **únicamente dentro de la extensión vertical de las filas cuantitativas** (`zonaTop → zonaBottom`).
- Todo texto que convive con las guías (valor «N d», etiqueta de estado) se dibuja sobre un **apagado blanco** (`apagarGuiaBajoTexto`), de modo que ninguna guía cruza jamás un texto.
- Si NO hay valores cuantificables: **no se dibuja escala, eje ni umbrales**; título y subtítulo se adaptan («sin cobertura calculable en los casos mostrados», «SIN ESCALA DE COBERTURA APLICABLE»); los casos se presentan como categoría textual propia (chip de color + texto oficial del motor). Nunca se inventan valores para dibujar barras.
- Caso mixto: subtítulos «CON COBERTURA CALCULABLE (días)» / «SIN COBERTURA CALCULABLE — ESTADO OPERATIVO» separan visualmente ambas categorías.
- **Colores inequívocos** con los MISMOS tokens reutilizados de Estados Financieros (ningún color nuevo): agotado = `#dc2626` (negative), insuficiente = `#b45309` (moderada), moderada = `#475569` (axis), baja rotación = `#15803d` (series[0]), sin movimiento/sin dato = `#94a3b8`. Antes AGOTADO y «Cobertura insuficiente» compartían el mismo rojo.
- Correcciones adicionales del mismo gráfico detectadas en auditoría: el valor de la barra máxima desbordaba el margen derecho → ahora entra en la barra en blanco; la leyenda mostraba 4 estados fijos (los estados presentes `sin_movimiento`/`sin_dato` jamás aparecían) → leyenda dinámica por estados presentes; nombres truncados con «…» verificado por ancho; contabilidad de altura **idéntica al dibujo** (la anterior dejaba la escala solapada con el subtítulo de zona y la leyenda pegada a la última fila).

## 2. Causa técnica del recorte del sombreado (bloques de prioridades)

Dos defectos combinados en `alturaBloquePrioridad`:

1. **Medición con el estado de fuente VIGENTE:** `doc.splitTextToSize(p.situacion, textoW)` se ejecutaba con el tamaño de fuente que quedara activo al llegar a cada bloque (9.6 tras la cabecera de grupo, 8.6 tras un chip, 12 tras un título…), mientras el dibujo envuelve el texto a **10.4 pt**. A tamaño menor caben más caracteres por línea → la cuenta de líneas de la medición era MENOR que la del dibujo → el fondo quedaba 4.7 mm corto por cada línea de diferencia. Como el estado de fuente variaba por bloque, el defecto aparecía de forma intermitente (claramente en Inicio Z, Mortero, Espejo, Arena, Regulador…).
2. **Contabilidad vertical incompleta** incluso con conteo exacto: la fórmula reservaba `10.5` mm superiores donde el dibujo usa `14` (baseline de la etiqueta EVIDENCIA) y el colchón inferior no cubría el descensor — el fondo era ~2.9 mm más corto que el contenido.

**Corrección (§2 de la misión):**
- **Una sola función de medición compartida** (`medirBloquePrioridad`) que fija la fuente EXACTA de dibujo (helvetica normal 10.4) y devuelve las líneas y el alto; el dibujo pinta ESAS mismas líneas. Medición y dibujo no pueden divergir por construcción.
- Contabilidad fiel al dibujo: `14 (top) + 4.7·(nSit) + 3.2 (gap) + 4.7·(nDec) + 0.9 (descensor) + 4.0 (colchón inferior)`. Tras la última palabra queda un margen inferior coherente (§2) y la separación al siguiente bloque se mantiene (5.5 mm adicionales).
- **Bloques menores que una página nunca se parten** (ensureSpace con el alto completo).
- **Bloques mayores que una página** (defensivo; el motor no los genera hoy): salto gestionado de manera controlada — fondo pintado por segmentos de página (cada segmento hasta el pie), cierre del segmento final en el contenido real (recorte en blanco de fondo y barra de acento sobrantes) y sin títulos de grupo huérfanos (la guarda de `drawSeccionPrioridades` limita la reserva al alto útil de una página y el bloque oversized arranca bajo el título).

## 3. Archivos y componentes modificados

| Archivo | Cambio |
| --- | --- |
| `src/components/views/terminal/views/product_comparison/informe-ejecutivo-pdf.ts` | ÚNICO archivo de producción modificado: gráfico 3.C reescrito por zonas (`zonasCobertura`, `alturaGraficoCobertura`, `drawGraficoCobertura`, `apagarGuiaBajoTexto`), colores de `ESTADO_COBERTURA` diferenciados, bloques de prioridades (`medirBloquePrioridad`, `pintarSegmentoBloque`, `drawBloquePrioridad`, guarda de `drawSeccionPrioridades`), `alturaResumenMinuto` (medición en la fuente exacta), tarjetas de cifra de portada (`alturaTarjetaCifra` + 2 líneas de explicación), tarjeta hero (`heroValor`/`alturaTarjetaHero`/`drawTarjetaHero` con altura y tamaño adaptativos y descriptor final sin líneas perdidas), nota metodológica de 3.C adaptada al contenido. |
| `scripts/pdf-informe3-replica.ts` | NUEVO: réplica de las condiciones de Informe3.pdf (escenarios G/H/I) con la cadena real de producción. Re-ejecutable (fixtures en memoria, sin BD). |
| `docs/audits/ADNEGOCIO-PDF-REPORT-POLISH-002/` | NUEVO: este informe + evidencia (14 archivos: antes/después, comparaciones lado a lado, muestras PDF). |

**Cero cambios** en `src/lib/product-comparison/compare.ts` y `informe.ts` (motor y cálculos congelados §6), en la vista, en consultas ni en agregaciones.

## 4. Solución implementada

Resumen por requisito de la misión:
- **§1 gráfico 3.C:** arquitectura por zonas + guías confinadas a la zona cuantitativa + apagado bajo textos + caso todo-agotado sin escala + colores inequívocos + leyenda dinámica. Verificado en las configuraciones: mixta (G, I, B, F), todo-agotado (H) y solo-cuantitativa (B/F anexos internos).
- **§2 contenedores:** medición única en la fuente exacta de dibujo + contabilidad fiel + colchón inferior de 4 mm bajo el descensor. El fondo cubre hasta la última palabra de cada párrafo en TODOS los bloques (ALTA, MEDIA, PREVENTIVA).
- **§3 auditoría de equivalentes:** corregidos además — `alturaResumenMinuto` (medía en negrita 9.8 y dibujaba normal 9.2), tarjetas de cifra de la portada (medían a 8.6 y dibujaban a 7.9; la explicación se recortaba a 1 línea perdiendo contenido → ahora 2 líneas medidas y dibujadas igual), tarjeta hero (el descriptor se recortaba a 2 líneas perdiendo la tercera cuando el motor añade «Valor exacto: … CUP.»; el valor se dibujaba a 26 pt fijo porque la medición del ajuste heredaba el tamaño vigente del kicker 8.6 — defecto PREEXISTENTE de la versión fusionada, confirmado en la muestra anterior del escenario F — y la cifra desbordaba la tarjeta), conclusión gerencial y tablas revisadas sin defectos, nota huérfana de Anexo I-A documentada como limitación preexistente (§7).
- **§4 maquetación:** alturas dinámicas basadas en contenido real, sin recortes ni superposiciones, saltos de página controlados (bloques pequeños íntegros; bloques gigantes por segmentos con cierre limpio), encabezados/pies conservados, tablas con encabezados repetidos y filas sin partir (mecanismo autoTable intacto), sin saltos innecesarios (el flujo anti-huérfano se conserva).

## 5. Pruebas ejecutadas

| Prueba | Resultado |
| --- | --- |
| `tsc --noEmit` (proyecto completo) | 0 errores |
| `eslint` sobre el módulo modificado | 0 problemas |
| `vitest` product-comparison (motor + vista) | 35/35 PASS |
| `scripts/pdf-integrity-check.ts` (integridad de datos del PDF) | PASS — todas las celdas del Anexo I + indicadores + conciliación + estructura + metadatos |
| `scripts/pdf-informe-stress.ts` (A–F) | 6/6 generados (13/20/23/21/37/37 págs) — reflujo benigno por los nuevos espaciados; contenido idéntico (motor congelado) |
| `scripts/pdf-informe3-replica.ts` (G/H/I) | 3/3 generados (23/13/17 págs) |
| **Revisión visual** (pdftoppm 100 dpi + inspección página a página) | G completo (23/23), H (13/13 vía montajes), I (17/17 con foco en bloques oversized), portada y 3.C de B y F |

Verificaciones específicas exigidas por la misión:
- **Caso A (página 6, G):** ALTA Inicio Z con la evidencia EXACTA citada («registró $30,600.00 CUP en el tramo comparativo… 0.35 unidad/día») y ACCIÓN RECOMENDADA íntegra — fondo cubre hasta «demanda.» con colchón inferior; ALTA Espejo, Mortero, Batería, Pintura, Bloque, Cable, Ventilador, Clavos, Arena y MEDIA Regulador íntegros.
- **Caso B (página 9, G):** las guías D/2 y D solo dentro de la zona cuantitativa; NINGUNA etiqueta ni texto cruzado; AGOTADOS como categoría textual independiente; colores y leyenda inequívocos.
- **Caso C:** párrafos cortos y extensos (G), párrafos de más de una página con salto controlado (I), nombres largos truncados con «…» (F), estados de agotamiento (G/H/I), coberturas cuantificables (G/B/F), datos mixtos (G/I/B/F), tarjetas consecutivas (G/D), contenido que pasa de página (I), magnitudes extremas con cifras hero adaptativas (F).

## 6. Resultado de la nueva exportación

- Las muestras PDF corregidas están en `evidencia/` (`muestra_despues_G-replica-informe3.pdf`, `muestra_despues_H-todo-agotado.pdf`, `muestra_despues_I-modelo-extenso.pdf`, `muestra_despues_F-magnitudes.pdf`).
- Comparaciones lado a lado: `comparacion_pag6-antes-vs-despues.png` y `comparacion_pag9-antes-vs-despues.png`.
- El documento conserva la identidad visual del rediseño aprobado (tipografía §7, tokens de Estados Financieros, portada dashboard, índice con enlaces, marcadores y metadatos — verificados por `pdf-integrity-check`), sin líneas que interfieran con el texto, sin fondos incompletos, sin párrafos pegados y sin contenido desbordado.

## 7. Incidencias restantes

1. **Nota en página propia tras el Anexo I-A** (p. ej. página 15 de la réplica): cuando la tabla horizontal termina exactamente a pie de página, su nota metodológica pasa sola a la página siguiente. Comportamiento **preexistente** (idéntico en la versión fusionada y en Informe3.pdf); corregirlo exigiría reservar sitio a la nota dentro de la paginación de autoTable (riesgo de regresar el layout aprobado). No forma parte de los defectos señalados por la misión; documentado para decisión del propietario.
2. **Informe3.pdf no disponible:** el adjunto no llegó al sandbox; toda la verificación se apoyó en la réplica G/H/I construida con la cadena real y los hechos citados en la misión. Al fusionar, conviene re-exportar el informe con los datos reales desde la vista y contrastar las páginas 6 y 9.
3. `seleccionCobertura` muestra hasta 12 casos TOTALES ordenados por severidad (no 12 por severidad como dice su comentario) — comportamiento preexistente conservado; el detalle completo sigue en el Anexo II.

## Integridad (§6 de la misión)

- No se modificó NINGÚN cálculo, importe, cantidad, porcentaje, clasificación ni dato de inventario: el diff de producción toca exclusivamente la capa de presentación (`informe-ejecutivo-pdf.ts`).
- El contenido impreso sigue siendo exactamente el del motor (verificado por `pdf-integrity-check` tras los cambios).
- No hay dependencias nuevas; no hay soluciones especiales para Inicio Z (todas las correcciones son genéricas por contenido).
