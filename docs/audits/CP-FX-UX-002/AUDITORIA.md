# AUDITORÍA — Misión CP-FX-UX-REDESIGN-AND-SIMULATOR-CONSOLIDATION-002

Fecha: 2026-11-28 · Rama: `feat/fx-ux-redesign-simulator-20261128` (base main @ 44b2ff27b, merge del PR #1745)
Alcance: Inicio → ANÁLISIS → Inteligencia Cambiaria (`src/components/views/terminal/views/exchange_intelligence/`)

## 1. Mapa real de la implementación (FASE 0)

| Elemento | Ubicación |
|---|---|
| Vista principal (2711 líneas) | `ExchangeIntelligenceView.tsx` — tabs: dashboard, history, variations, mi-producto, alerts, simulator, configuracion |
| Tab Histórico (1435 líneas) | `lazy/HistoryTab.tsx` — serie unificada, filtros, proyección |
| Tab Variaciones (353 líneas) | `lazy/VariationsTab.tsx` — **contiene la tabla 24h/7d/30d Y el «Simulador de inversión»** |
| Tab Mi Producto (1073 líneas) | `lazy/MiProductoTab.tsx` — costo/margen/proyección de producto |
| Fórmulas de producto | `src/lib/exchange-intelligence/product-analysis.ts` (puro, probado) |
| Serie unificada | `src/lib/exchange-history.ts` — regla: real > estimated > carry_forward; activo > histórico; frescura |
| Consulta del archivo compartida | `src/lib/exchange-intelligence/archive-loader.ts` — caché en memoria TTL 2 min, dedup en vuelo |
| API | `GET /api/exchange-rates` — `days=90&segment=3` (vista) y `days=all&source=all` (Histórico/Mi Producto); carry-forward virtual SOLO fuentes activas; `informal_latest` exige `capture_method='real'` |
| Captura | `src/lib/exchange-capture.ts` — upsert `on_conflict=rate_date,currency,source,segment` merge-duplicates |
| Fecha operativa | `src/lib/operative-date.ts` — civil de Cuba (America/Havana), compartida cliente/servidor |
| Preferencias | `src/hooks/useUserPreferences.ts` — Supabase `user_preferences` (RLS) + fallback localStorage + migración |
| Tema | `src/styles/tokens.css` — light warning #b45309 / **dark warning #fbbf24** (amarillo saturado) |

## 2. FASE 2 — Causa raíz documentada de la gráfica (910 vs 980 el 28/11/2026)

### Evidencia de producción (consultas read-only al proyecto wthkddeleylijmonclxg)

1. **La BD de producción hoy es CORRECTA**: `2026-11-28 | Diviza | 980 | real | captured_at 15:14:41 UTC (10:14 a.m. Cuba) | source_updated_at 15:00 UTC (10:00 a.m. Cuba)` y `2026-11-28 | BCC seg3 | 879 | real`. La serie 11-20→11-28 (950,955,960,970,970,975,980,980,980) coincide exactamente con el caso de prueba del usuario.
2. **La captura del usuario muestra el tooltip «procedencia pendiente del archivo»** → la gráfica estaba renderizando la SERIE FALLBACK (prop `data` de la vista, 90 días), no la del archivo: la consulta del archivo (`days=all&source=all`) había fallado o no había terminado.
3. **El punto 11-28 mostraba (910 informal, 825 oficial)** = exactamente los valores REALES almacenados del **2026-11-13**. Es decir, el navegador sostenía un snapshot del estado de la BD de la mañana del 28/11 (o antes), cuando existían filas rancias (11-28=910/825) que la captura ADNegocio de las 10:14 corrigió por upsert (merge-duplicates).
4. **Momento**: el PR #1745 se fusionó a las 11:02 a.m. Cuba; la captura es de las 11:11 a.m. Cuba → producción aún ejecutaba el código anterior (Vercel desplegando). El despliegue NO es la causa del dato (la BD ya era correcta desde las 10:14), pero sí explica el tooltip sin procedencia del código nuevo.

### Causas técnicas identificadas (en el código, aplicables hoy)

- **C1 — La gráfica no se revalida**: la consulta del archivo (`loadExchangeArchive`) se hace UNA vez al montar el tab; caché TTL 2 min solo aplica a remontajes. El auto-refresh de 5 min (`useIntervalWhenVisible`) refresca la serie de 90 días (tarjetas/KPIs) pero JAMÁS el archivo → tras una captura, la tarjeta muestra 980 y la gráfica se queda congelada (divergencia exacta que reportó el usuario).
- **C2 — Fallos silenciosos y snapshot rancio sin marca**: si las peticiones fallan (token expirado, red), `rates` y `archiveRows` conservan el snapshot previo que se sigue mostrando con autoridad visual total; solo hay un toast efímero. No existe indicador de «datos actualizados a las HH:MM» ni banner persistente de frescura.
- **C3 — Fallback sin procedencia**: cuando el archivo falla, la serie fallback se dibuja sin `informalSource` («procedencia pendiente del archivo») y sin marca visual diferenciada de provisionalidad.
- **C4 — Selección oficial por `rates.find`**: la serie fallback de la vista toma el PRIMER registro BCC del día (captura más ANTIGUA), mientras los indicadores toman el más fresco — inconsistencia latente.
- **D1 — Filas rancas del proveedor (dato, no código)**: la mañana del 28/11 existieron filas (11-28, 910/825) provenientes de fuentes que servían valores viejos; la captura de las 10:14 las corrigió. El patrón BCC en lotes retrasados (11-01→02 capturadas el 11-07; 11-17→21 el 11-23; 11-22→28 el 11-28 10:14) evidencia un planificador EXTERNO poco fiable: `vercel.json` SOLO programa `purge-snapshots` — la ruta `/api/cron/exchange-rates` NO está programada en Vercel.

### Correcciones aplicadas (ver PR)

- El archivo se revalida periódicamente cuando el tab está visible (misma cadencia honesta que la vista, respetando TTL) y cuando la vista detecta datos más nuevos (fecha operativa/captura) → la gráfica converge con la tarjeta en ≤1 ciclo.
- Sello visible «Datos actualizados a las HH:MM (Cuba)» + banner persistente cuando la última actualización falló (nada de toasts efímeros como único canal).
- Fallback marcado expresamente como parcial (ya existía aviso; ahora el estado de error es persistente y el sello de hora no aparece si el dato es rancio).
- La serie fallback de la vista usa el registro BCC más FRESCO del día (misma regla que los indicadores) → gráfica = tarjeta.
- La garantía del último punto se mantiene: observada (real) para la línea sólida; estimada en discontinua ámbar; arrastre etiquetado en el tooltip — jamás se presenta una estimación como cotización.

## 3. FASE 3 — Auditoría de la fragmentación actual

- «Simulador de inversión» vive DENTRO del tab «Variaciones» (VariationsTab líneas 84-113: `investUsd`/`investDateIdx`).
- «Variaciones» también tiene la tabla 24h/7d/30d — calculada POR ÍNDICE (`valid[len-1-n]`), no por fecha calendario: con huecos en la serie, «% 7d» compara fechas separadas >7 días (error de exactitud).
- «Mi Producto» (tab) + `product-analysis.ts` (fórmulas puras) + consulta propia del archivo.
- «Simulador» (tab) = Simulador de Escenarios con 4 modelos de tendencia y regresiones LOCALES duplicadas (`linearReg`, `polyReg2` dentro del componente).
- **Causa raíz de la contradicción 843 vs 989 CUP/USD**: Mi Producto entrena la regresión sobre la SERIE UNIFICADA COMPLETA (elToque ~620-910 + zona muerta interpolada ~780-840 + Diviza 840→980; ~340 puntos, mayoría plana), mientras el Simulador de Escenarios entrena sobre la serie de 90 días de la FUENTE ACTIVA (~35-90 puntos en subida 840→980). Pendientes radicalmente distintas → proyecciones contradictorias con R² altos ambos. NO es un bug de índices: son DOS conjuntos de datos y DOS ventanas distintas sin declarar.
- **Margen vs recargo**: `product-analysis.ts` usa `precio = costo × (1 + margen/100)` — matemáticamente es RECARGO sobre costo (markup), pero toda la UI lo etiqueta «margen». El ejemplo de la misión (236/980 ≈ 24.08%) confirma la confusión: 24.08% es recargo realizado sobre costo, no margen bruto sobre ventas (que sería 236/1216 ≈ 19.41%).

## 4. FASE 4 — Auditoría del Dashboard BCC:MIPYMES

Estructura actual: abanico Segmento BCC + Actualizar BD → 2 tarjetas principales (BCC/Informal, correctas y conservadas) → tarjeta Brecha (grande, con estadística en popover) → 3 KPIs secundarios (Volatilidad 7d, Cambio semanal, Proyección 10d) → Análisis Ejecutivo (4 tarjetas) → (tab Alertas aparte duplica variación mensual/semanal/brecha).

Problemas:
- KPIs calculados sobre series con métodos inconsistentes: `usdInformalRates` sin deduplicar por fecha y sin filtrar `capture_method` en algunos KPIs; volatilidad sobre `slice(-8)` por índice.
- `AlertsTab` compara `diffPct > 400` — `diffPct` llega como STRING (`toFixed(0)`) → comparación siempre falsa → la alerta de brecha nunca escala (bug de exactitud).
- Proyección 10d presentada como KPI sin marcar expresamente que es una ESTIMACIÓN estadística (R² sí se muestra en tooltip).
- Redundancia: variación mensual/semanal aparecen en Dashboard, Alertas y Variaciones.

## 5. FASE 5 — Auditoría visual

- **Dark mode**: `--warning: #fbbf24` (amber-400, saturado) tiñe banners de arrastre, badges «Estimada», estados y superficies `bg-warning/15` — el amarillo fluorescente que el usuario rechaza. Light usa #b45309 (elegante) — el problema es solo el token oscuro.
- Tarjetas con `border-2` + `p-6` + títulos `uppercase tracking-widest` en exceso → sensación de tarjetas gigantes repetidas.
- Responsive: los grids usan `grid-cols-1 md:grid-cols-*` correctos; el riesgo está en tablas con `overflow-x-auto` correcto y en el gráfico (alto fijo 420px, aceptable).
- Asignación categórica de series (BCC azul / informal naranja / estimada ámbar discontinua) es COHERENTE entre tabs — se conserva (identidad de la misión CP-FX-001).

## 6. Decisiones de diseño (resumen)

1. Tabs finales: **Dashboard · Histórico · Simulador · Alertas · Configuración** (Simulador unifica inversión + producto + escenarios; Variaciones desaparece como tab: su tabla pasa a «Indicadores de mercado» del Dashboard y su simulador de inversión a la Sección A).
2. Filtros del Histórico: persistencia vía `useUserPreferences('inteligencia-cambiaria:historico-filtros')` (Supabase RLS + localStorage fallback) — sin almacenamiento nuevo ni duplicado.
3. Rango por defecto y «Restablecer»: primer día del mes actual → fecha operativa de Cuba (dinámico, jamás codificado).
4. Presets: 7 / 30 / 90 días + Mes actual + Personalizado. «Todo el período» ELIMINADO de la interfaz y de la lógica (9999 desaparece).
5. Motor de proyección ÚNICO compartido (`src/lib/exchange-intelligence/forecast.ts`) con ventana declarada, mínimo de muestras, umbrales R² y etiqueta de estimación — usado por Escenarios y por el producto.
6. Margen: la UI distinguirá expresamente «Recargo sobre costo (%)» (fórmula actual, conservada) y «Margen bruto sobre precio (%)» (`precio = costo / (1 − m/100)`).
