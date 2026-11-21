# CP-CI-007 — Rendimiento (medido, no especulativo)

**Área**: rendimiento · **Prioridad**: P6 · **Estado inicial**: queued

## Objetivo
Identificar y resolver oportunidades REALES de rendimiento con medición antes/después. Prohibido optimizar sin dato: cada unidad parte de una métrica degradada o un patrón conocido que afecta a vistas de alto uso.

## Criterios de entrada
- STATE.json sin lock; skill `react-best-practices` (reglas `async-*`, `bundle-*`, `rerender-*`, `rendering-*`, `js-*`) y `costpro-frontend-engineering` §3 leídas.
- Métrica disponible para la unidad (bundle gate, traza Playwright, React Profiler, tamaños de chunk en `analyze`).

## Unidades (candidatas verificables)
- **U1 — Puerta de bundle**: `bun run gate:bundle` + `bun run analyze`: si hay chunks de primera carga por encima del gate, identificar módulos pesados no-primarios y aplicar `next/dynamic` según patrones del repo (ChatBot, QueryInspector, exportadores PDF, gráficos cuando no son la vista principal). Métrica: tamaño de primera carga antes/después.
- **U2 — Waterfalls en dashboards**: revisar vistas que agregan varias fuentes (dashboard, sales_hub, financial_statements): `Promise.all` para independientes, `React.cache` para dedup por request (reglas `async-parallel-*`). Métrica: tiempo de carga de la vista (traza Playwright) antes/después.
- **U3 — Re-render en vistas de filtrado/tabla**: verificar con React Profiler (o conteo de renders en dev) si un filtro dispara renders excesivos; aplicar reglas `rerender-*` (derivar en render, memo con props hoistadas, `useDeferredValue`) SOLO donde la medición lo justifique.
- **U4 — Operaciones costosas en catálogos grandes**: lookups O(n²) en catálogo/inventario → `Set`/`Map` (reglas `js-*`), con benchmark simple antes/después si es medible.

## Límites de alcance
No introducir complejidad arquitectónica sin justificación medible. No cambiar semántica de datos ni redondeos (Decimal.js intacto). No "modernizar" hooks/patrones canónicos del repo. Todo cambio de rendimiento pasa por los tests de la zona (regresión primero).

## Procedimiento
Fases A–H con medición EXPLÍCITA: capturar métrica antes (comando/traza) → cambio mínimo → métrica después → documentar ganancia real. Si la ganancia no es medible o es <5%, reconsiderar (o rechazar la unidad con datos).

## Pruebas y criterios de aceptación
1. Métrica antes/después documentada con el comando exacto usado (reproducible).
2. `bun run test` + specs de zona en verde; `gate:bundle` en verde si tocaste primera carga.
3. Sin cambios de comportamiento funcional (specs + verificación E2).
4. Informe con la tabla de métricas y el razonamiento.

## Certificación esperada
APROBADA solo CON medición antes/después. Sin métrica → BLOQUEADA o RECHAZADA (nunca "parece más rápido").
