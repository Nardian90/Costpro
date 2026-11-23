# REDESIGN-EJECUTIVO-20261123 — Evidencia visual (capturas antes/después)

Misión: «Rediseño ejecutivo del Dashboard y Estados Financieros» (§2, §9.3).
Capturas contra el servidor local (PM2, bun server.ts, Next dev) con la **BD
AISLADA desechable** (proyecto `CostproE2E`), seed de demostración: 19 ventas
oct+nov contabilizadas por el motor (fin_backfill) + plano comercial del caso
de la misión (líder anterior que deja de venderse con stock 0, nuevo líder,
producto nuevo en el ranking).

## ANTES (`capturas/before/`) — estado de `main` previo a la misión

| Archivo | Contenido |
| --- | --- |
| `inicio-1920.png` | Panel de Control con el **velocímetro semicircular** (la misión exige retirarlo, no retocarlo) + mini-stats Ventas/Costos/Utilidad (N/D) y el botón «Comparar productos» colgado del indicador. |
| `inicio-375.png` | El mismo velocímetro en móvil: sin ranking comercial, sin contexto comparativo por producto. |
| `rendimiento-1920.png` | Estados Financieros → Estado de rendimiento con el informe contable (permanece intacto). |
| `rendimiento-desglose-1920.png` | La zona de **gráficos deficientes**: ComposedChart «Ingresos vs Gastos por mes» + pie «Distribución de gastos» (recharts) — retirados por la misión. |

## DESPUÉS (`capturas/after/`) — misión implementada

| Archivo | Contenido | Criterios |
| --- | --- | --- |
| `inicio-1920.png` | Resumen de Indicadores ejecutivo: ventas netas CUP del mes en curso vs MISMO TRAMO del mes anterior (variación absoluta, % y dirección), transacciones, ticket promedio, unidades; referencia USD separada; fechas de ambos períodos y hora de actualización. Sin velocímetro ni mini-stats repetidas. | UX-01, UX-02 |
| `ranking-comercial-1920.png` | Ranking Comercial del Inicio: Top con posiciones, unidades, barras comparativas discretas, movimiento (Sube/Baja/Nuevo), cambio de líder y «Salieron del Top» con clasificación honesta («Dejó de venderse» por evidencia real del mayor de inventario). Botón «Comparar productos» INTEGRADO EN EL ENCABEZADO. | UX-03, UX-04, UX-05 |
| `comparar-productos-1920.png` | Vista analítica abierta desde el encabezado del ranking. Header/breadcrumb «Comparar Productos» (antes caía en el fallback «Módulo No Disponible» — residual eliminado con el registro en la navegación). | UX-03, UX-06, UX-07 |
| `rendimiento-1920.png` | Estado de rendimiento: informe contable íntegro (Ingresos → Netos → −Costo → Utilidad bruta → Gastos → Resultado operativo → Resultado neto) — SIN los gráficos deficientes. | UX-08, UX-09 |
| `rendimiento-desglose-1920.png` | Los desgloses que alimentaban los gráficos retirados, preservados como tablas financieras profesionales («Evolución mensual»: mes · ingresos · gastos · resultado). Sin gráficos nuevos. | UX-08, UX-09 |
| `inicio-375.png` / `ranking-comercial-375.png` | Móvil real (375×812): composición KPI legible, tarjetas apiladas, ranking con jerarquía intacta y botón accesible. | UX-10 |

## Verificación de datos reales

Todos los importes provienen de las fuentes canónicas del sistema
(`get_sales_dashboard_analytics` ×2 con `previousMonthEquivalentWindow`,
`fin_get_dashboard`, catálogo/kardex para la evidencia de inventario). Sin
metas inventadas, sin división entre cero, sin mezcla de monedas. La captura
«antes» y la «después» se tomaron sobre la MISMA BD de demostración.
