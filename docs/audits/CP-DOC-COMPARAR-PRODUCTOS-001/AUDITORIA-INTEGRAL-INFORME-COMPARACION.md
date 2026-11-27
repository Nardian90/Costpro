# AUDITORÍA INTEGRAL — INFORME EJECUTIVO DE COMPARACIÓN DE PRODUCTOS

**Misión:** CP-DOC-COMPARAR-PRODUCTOS-001 · **Fecha:** 2026-11-27
**Objeto auditado:** el tipo de informe «Comparación de Productos» (Informe Ejecutivo de Desempeño Comercial y Abastecimiento) generado por el módulo `src/lib/product-comparison/` (motor analítico) y `src/components/views/terminal/views/product_comparison/informe-ejecutivo-pdf.ts` (render vectorial jsPDF).
**Referencia del propietario:** «Productos Enervida.pdf» (ENERVIDA-VITALLCONS, elaboración 27/11/2026 08:35, 01/11→27/11/2026 vs. 01/10→27/10/2026, 27 páginas).
**Motor de verificación:** `scripts/cp-auditoria-informe.ts` (sandbox) — reconstruye el informe con los DATOS EXACTOS de los Anexos I-A/I-B/II del PDF del propietario y recalcula cada cifra con código.

---

## 1. Alcance y método

La auditoría cubre las cuatro capas del documento y su honestidad estadística:

1. **Motor analítico** (`buildComparison`): unión de Tops, variación absoluta/porcentual, evolución (`crece`/`desciende`/`nuevo`/`dejo_de_venderse`/`sale_del_top`), participación oficial.
2. **Síntesis del informe** (`buildInformeEjecutivo`): diagnóstico, indicadores, matriz de prioridades, gráficos 3.A/3.B/3.C, análisis complementario, anexos I-IV, metodología y limitaciones.
3. **Render PDF** (`informe-ejecutivo-pdf.ts`): estructura documental, reglas de no-invención de datos, delimitación visual de los gráficos (objeto de esta misión).
4. **Verificación aritmética con código**: 39 comprobaciones contra las afirmaciones publicadas del PDF del propietario, más verificación visual de las páginas de gráficos de una muestra regenerada.

Método de trazabilidad: el fixture de auditoría se construye EXCLUSIVAMENTE con los números publicados en los anexos del propio informe (ninguna cifra nueva inventada), la evidencia del mayor de inventario declarada por el informe (12 productos sin salidas + MC4 con salidas fuera del Top) y la participación oficial del agregado (Inversor 24.77%).

## 2. Petición del propietario y mejora implementada

**Petición (2026-11-27):** en los gráficos 3.A «Comparación de ventas por producto» y 3.B «Evolución de las variaciones» no quedaba claro a qué producto pertenece cada barra; se pidió etiquetas más pegadas a las barras o una línea suave entre productos para delimitar cada grupo.

**Implementada (PR #1737, commit `6df06ffaf`):**

| Mejora | Detalle |
|---|---|
| Banda de asociación visual | alterna (`C_BAND` #F8FAFC), encierra nombre + ambas barras + marcador de tendencia del MISMO producto (ceil(n/2) bandas) |
| Línea separadora suave | entre productos consecutivos (`C_SEPARADOR` #E2E8F0, 0.2 mm, n−1 hairlines), sin cruzar contenido |
| Etiquetas de valor pegadas | 1.4 mm → **1.0 mm** desde el extremo de cada barra (3.A ambos tramos; 3.B ambos lados del eje divergente, insignia NUEVO y porcentaje) |
| Espaciado | gapProd 3.4→5.0 mm (3.A) y 3.8→4.6 mm (3.B) para alojar banda + hairline sin apretar |

**Reglas del documento verificadas como INTACTAS después del cambio:** insignia «NUEVO» textual y sin porcentaje ficticio (§4.D) — 4 casos en la muestra (Inversor, XT60 I, Espejo, Grey cerámico), idéntico al original; fallback de etiqueta interior con texto blanco cuando no cabe (§11) — verificado con la barra −1,53 M; guardas anti-huérfanos; paleta institucional; notas metodológicas.

**Evidencia de la mejora:**
- Test nuevo `src/__tests__/components/product-comparison-informe-pdf-charts.test.ts` — **9/9 PASS** (jsPDF real con spy sobre `createPDFDocument`): bandas ceil(n/2) de ancho completo, hairlines n−1, z-order (banda bajo las barras), proximidad de etiquetas (1.0 mm exactos en 5 casos), fallback interior §11, insignia NUEVO sin %, integridad del documento.
- Regresión del módulo: **29/29** (20 del motor + 9 nuevos). TypeCheck 0 errores · ESLint 0 errores.
- Muestra regenerada con los datos reales del propietario: `Comparar-Productos-MUESTRA-mejorada.pdf` (26 páginas, 8 series en 3.A, 14 filas en 3.B, 4 insignias NUEVO) — verificación visual de las páginas 7-8: bandas, hairlines y etiquetas pegadas visibles, sin solapamientos.

## 3. Verificación aritmética integral — 39/39 SIN DESVIACIONES

Salida del motor de auditoría (`bun scripts/cp-auditoria-informe.ts` → `39 verificados / 0 desviaciones`):

| # | Comprobación | Publicado | Recalculado | Resultado |
|---|---|---|---|---|
| 1 | Productos de la unión de ambos Top 20 | 33 | 33 | ✓ |
| 2 | Σ ingresos actuales del conjunto | $1,529,080.00 | 1,529,080.00 | ✓ |
| 3 | Σ ingresos tramo comparable del conjunto | $3,561,315.00 | 3,561,315.00 | ✓ |
| 4 | Variación CUP | −$2,032,235.00 | −2,032,235.00 | ✓ |
| 5 | Variación % del conjunto | −57.1% | −57.06 → −57.1 | ✓ |
| 6 | Productos que crecen | 17 | 17 | ✓ |
| 7 | Productos que se contraen | 16 | 16 | ✓ |
| 8 | Productos nuevos (sin base) | 13 | 13 | ✓ |
| 9 | Dejan de registrar salidas (con evidencia del mayor) | 12 | 12 | ✓ |
| 10 | Crecimiento relevante (+50% o más) | 3 | 3 | ✓ |
| 11 | Contracción relevante (−50% o más) | 14 | 14 | ✓ |
| 12 | Agotados con antecedente comercial | 10 | 10 | ✓ |
| 13 | Cobertura insuficiente | 4 | 4 | ✓ |
| 14 | Líder del período | Inversor | Inversor | ✓ |
| 15 | Participación oficial del líder | 24.77% | 24.77% (del agregado oficial) | ✓ |
| 16 | Participación del líder SOBRE el conjunto | — | 24.98% (alcance distinto, ambos correctos) | ✓ |
| 17-24 | Coberturas del Anexo II (Royal Cole 2.19 u/d → 2.7 d; Espejo 0.41 → 7.4 d; Cemento Blanco 9 d; Losa Porcelanato 4.5 d; Barilla 13.5 d; Terminales 858 d) | publicadas | existencia ÷ (unidades/27) exactas | ✓ ×8 |
| 25 | Gráfico 3.A: series | 8 | 8 (GRAFICO_MAX_PRODUCTOS=8) | ✓ |
| 26 | Gráfico 3.A: primera serie (mayor impacto) | Cemento TBV 50 Kg | Cemento TBV 50 Kg | ✓ |
| 27 | Gráfico 3.B: filas | 14 | 14 (7 subidas + 7 bajadas, VARIACION_MAX_LADOS=7) | ✓ |
| 28 | Insignias NUEVO en 3.B | 4 | 4 | ✓ |
| 29 | Gráfico 3.C: casos mostrados | 12 | 12 (tope por severidad) | ✓ |
| 30 | Matriz: casos del bloque CRÍTICA/ALTA | 12 | 12 | ✓ |
| 31-32 | Matriz: sin casos MEDIA / PREVENTIVA | 0 / 0 | 0 / 0 | ✓ |
| 33 | Anexo III: filas solo con evidencia del mayor | 12 | 12 | ✓ |
| 34 | MC4 (fuera del Top, CON salidas evidenciadas) excluido de Anexo III | excluido | excluido | ✓ |
| 35 | Metodología: limitaciones declaradas | sí | sí | ✓ |
| 36 | TBV: disclaimer «no constituye una pérdida comprobada ni una demanda no atendida» | presente | presente | ✓ |
| 37 | Matriz: sin afirmaciones de pérdida/demanda cuantificada | ninguna | ninguna | ✓ |
| 38 | Conciliación con alcance exacto declarado | sí | sí | ✓ |
| 39 | Velocidad de salida histórica TBV (2.89 u/d) | 2.89 | 78/27 = 2.888… → 2.89 | ✓ |

## 4. Auditoría de honestidad del documento (reglas anti-invención)

Verificadas EN EL CÓDIGO y en la muestra regenerada:

| Regla | Implementación | Estado |
|---|---|---|
| «NUEVO» sin porcentaje ficticio | `esNuevo` certificado por `evolucion==='nuevo'`; el % solo con base comparable | ✓ INTACTA |
| Cobertura jamás inventada | gráfico 3.C: casos no calculables se muestran como etiqueta textual (AGOTADO / No calculable) y, en caso todo-agotado, NO se dibuja escala numérica | ✓ INTACTA |
| «Sin ventas» solo con evidencia del mayor | `ventasEnPeriodoActual` (kardex) separa «dejó de venderse» de «sale del Top»; sin evidencia la clasificación es conservadora | ✓ INTACTA |
| El importe anterior no es pérdida | disclaimer explícito en cada caso de interrupción (TBV, Panel 550W, Tunder, Juego de pata, MPPT, Masilla, Brecker 63 AMP, Tanqueta, Mortero, Inicio Z) | ✓ INTACTA |
| Productos fuera del Top no cuentan como sin ventas | tabla «fuera del Top» con lectura diferenciada (MC4: demanda vigente fuera del recorte) | ✓ INTACTA |
| Participación oficial ≠ participación del conjunto | la participación proviene del agregado oficial (`participacion_pct` del RPC, 24.77%); el alcance del conjunto se concilia en el Anexo IV | ✓ INTACTA |
| Rotación financiera no calculada | declarada como limitación (no hay existencia promedio ni costo de ventas) | ✓ INTACTA |
| Series diarias no simuladas | «cuando la fuente no provee una serie diaria, no se simula evolución» | ✓ INTACTA |
| Cobertura sin fechas de agotamiento | no parametriza plazos de reposición ni inventario de seguridad — declarado | ✓ INTACTA |

## 5. Auditoría de estructura documental

- **Portada** con entidad, períodos, elaboración y resultados del conjunto comparado.
- **Sección 1** diagnóstico + «La situación en un minuto» (resumen gerencial).
- **Sección 2** matriz de prioridades ordenada por severidad con evidencia y decisión específica por caso (12 ALTA en el informe del propietario — cada una con su texto propio, sin plantilla repetida).
- **Sección 3** tres gráficos sobre los MISMOS datos del motor (3.A comparación, 3.B variaciones divergentes, 3.C disponibilidad) — el objeto de la mejora de esta misión.
- **Sección 4** análisis complementario (principales, agotados con demanda interrumpida, riesgo de desabastecimiento, baja rotación, nuevos/emergentes, fuera del Top, dejaron de venderse) — cada tabla solo si tiene contenido.
- **Anexos I-A/I-B** ranking completo 33 productos con importes y cantidades por U.M. propia (las cantidades nunca se suman entre unidades distintas).
- **Anexo II** disponibilidad y cobertura con umbrales D/2 y D (D=27) y alertas de existencia mínima del catálogo.
- **Anexo III** productos sin ventas SOLO con evidencia del mayor (12; MC4 excluido correctamente).
- **Anexo IV** metodología, fuentes (agregado oficial `get_sales_dashboard_analytics`, catálogo, mayor de inventario con RLS por tienda), definiciones de indicadores y limitaciones.
- Numeración «Página X de Y», índice con enlaces internos, marcadores PDF, pie institucional.

## 6. Alcances y observaciones (por diseño, no defectos)

1. **Subconjuntos documentados:** 3.A muestra 8 de 33 productos (`GRAFICO_MAX_PRODUCTOS=8`), 3.B hasta 7+7 variaciones y 3.C hasta 12 casos por severidad — cada recorte está declarado en su nota al pie y el detalle completo vive en los anexos. Sin ocultamiento engañoso.
2. **Formato compacto es-CU:** las etiquetas de los gráficos usan formato compacto (1.53 M / 482 k) — el valor exacto de cada producto está en el Anexo I-A. Diferencia visual, no numérica.
3. **Participación 24.77% vs 24.98%:** dos alcances distintos y ambos correctos — el oficial de la tienda (agregado, incluye productos fuera del conjunto) y el del conjunto comparado. El informe etiqueta el primero como «participación oficial del período» y concilia el segundo en el Anexo IV.
4. **Muestra regenerada (26 pp.) vs original (27 pp.):** diferencia de paginación de tablas por aproximación del fixture (el app real lee la existencia mínima y el catálogo completo de la BD); TODAS las cifras y reglas verificadas coinciden. La muestra es instrumento de verificación visual, no re-emisión oficial.
5. **Opcionales futuros (no bloquean nada):** incluir el código de producto en la etiqueta de los gráficos 3.A/3.B; leyenda de marcadores de tendencia (▲/▼) en 3.A; paginación opcional «por familia de producto». Registrados como ideas, no como deuda.

## 7. Hallazgo corregido durante la auditoría (transparencia)

Durante la verificación se detectó que una PRIMERA versión del fixture de muestra incluía filas con ventas cero en el Top del tramo comparable; el motor, correctamente, no clasifica esos productos como «nuevo» (el agregado oficial solo lista productos CON movimientos). El fixture se corrigió a la semántica real (Top 20 CON ventas por tramo, unión = 33) y la muestra final reproduce exactamente las 8 series, las 14 variaciones y las 4 insignias NUEVO del original. **El generador no tenía defecto** — el hallazgo fue del instrumento de auditoría y queda documentado para trazabilidad.

## 8. CERTIFICADO

> **AUDITORÍA INTEGRAL DEL INFORME EJECUTIVO DE COMPARACIÓN DE PRODUCTOS: VERIFICADA — SIN DESVIACIONES.**
>
> - **Resuelto en esta misión:** la petición del propietario sobre los gráficos 3.A y 3.B (banda de asociación por producto + línea separadora suave + etiquetas de valor pegadas a las barras) — PR #1737 con 9/9 tests nuevos, 29/29 regresión del módulo y verificación visual de las páginas de gráficos.
> - **Verificado sin desviaciones:** la aritmética completa del informe del propietario (39/39), las reglas de honestidad estadística (9/9), la estructura documental completa y la coherencia motor↔gráficos↔anexos.
> - **Lo que falta: NADA bloqueante.** Las observaciones de la sección 6 son alcances documentados por diseño u opciones futuras; ninguna afecta cifras, decisiones ni honestidad del documento.
> - **Estado del tipo de informe:** apto para uso gerencial tal como está; el estándar de no-invención de datos del motor es la pieza más fuerte del documento y permanece intacto.

## 9. Evidencia re-ejecutable

```bash
# Verificación aritmética integral (39 comprobaciones, requiere bun)
bun scripts/cp-auditoria-informe.ts            # sandbox: /home/z/my-project/scripts/

# Tests de la mejora visual y del motor
bunx vitest run src/__tests__/components/product-comparison-informe-pdf-charts.test.ts   # 9/9
bunx vitest run src/__tests__/lib/product-comparison-informe.test.ts                     # 20/20

# Muestra visual regenerada (datos del propietario)
bun /home/z/my-project/scripts/cp-comparar-pdf-sample.ts
# → download/Comparar-Productos-MUESTRA-mejorada.pdf
```
