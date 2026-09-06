# W9.5 — B-10b-OBS-2 · REPAIR DESIGN · 15-option-comparison.md
# Comparación formal de opciones (GATE 16) — NINGUNA se ejecuta aquí

Universo de referencia: 98 productos / 6.427 u demostradas (94 Set A + 4 Set B) +
10 Test (126 u) + 16 stock-0. Valor reparable ESTIMATED 9.932.216,94.

## OPTION A — Reconstrucción histórica (replay del ledger)

Reinsertar movimientos históricos (242 del payload 08-02 + delta 08-02..08-17 desde BE)
retro-fechados, luego la apertura del residuo.

| Dimensión | Evaluación |
|---|---|
| Ventajas | kardex/movements con fechas y tipos «originales» 07-30..08-02 (payload exacto); historial aparentemente completo |
| Riesgos | **ALTO**: 08-02..08-17 solo es parcialmente reconstruible (ventas directas sin BE: F5.3) → una TERCERA versión de la historia; retro-fechado corrompe orden de balance_after y semántica WAC futura; 242+ movimientos × asserts = superficie de error grande; mezcla replay+apertura crea transición artificial |
| Trazabilidad | Débil: imposible distinguir fila reconstruida de original salvo por convención (reference_doc de replay) |
| Complejidad | Alta (replay por movimiento + apertura) |
| Impacto | Ledger completo pero parcialmente FABRICADO en el tramo 08-02..08-17 |
| Auditoría | Requiere disclaimer permanente «replay» |
| Reversibilidad | Compleja (cientos de filas de compensación) |
| Riesgo de fabricar historia | **SÍ — explícitamente lo que el mandato prohíbe** |

## OPTION B — Apertura formal auditada (solo posición demostrable)

1 movimiento 'initial' por producto (98), unit_cost=WAC, fecha de ejecución,
reference_doc=batch, audit de lote. Excluye Test.

| Dimensión | Evaluación |
|---|---|
| Ventajas | Determinista (98 filas congeladas en este pack); usa SOLO escritores canónicos; WAC invariante; reconocimiento honesto sin historia falsa; ejecutable en 1 transacción; verificación total por invariantes |
| Riesgos | MEDIO-BAJO: consagra el estado congelado (ya validado contra backup + BE); requiere firmante; ventana de mantenimiento |
| Trazabilidad | Fuerte: batch único en reference_doc + kardex + audit_logs + pack SHA256 |
| Complejidad | Media-baja (script único) |
| Impacto | Ledger operativo restaurado; POS desbloqueado para 98 productos |
| Auditoría | Limpia: «apertura por reconciliación con evidencia», no «historial fingido» |
| Reversibilidad | Sí (17-rollback-design.md) |
| Riesgo de fabricar historia | **NO** (la fecha de regularización se declara como tal) |

## OPTION C — Excluir/eliminar residuos Test

Para los 10 Test: stock_current→0 vía ajuste auditado o archivo del producto
(DEPRECATED), sin DELETE de catálogo.

| Dimensión | Evaluación |
|---|---|
| Ventajas | Limpia el detector de huérfanos; elimina distorsión de valor (12 M de WAC de test) |
| Riesgos | BAJO (evidencia TEST_RESIDUE demostrada); toca catálogo → requiere su propia firma |
| Trazabilidad | Media (ajuste o cambio de status auditado) |
| Complejidad | Baja |
| Impacto | No resuelve el residuo comercial por sí sola (98 productos seguirían huérfanos) |
| Auditoría | Correcta si se documenta como decisión de datos |
| Reversibilidad | Media (reactivar status / re-apertura) |
| Riesgo de fabricar historia | NO |

## OPTION D — B + C (apertura formal + exclusión Test)

Ejecuta B (98 aperturas) y C restringido (Test fuera del alcance de la apertura; su
limpieza/archivo como decisión separada que puede acompañar la misma firma).

| Dimensión | Evaluación |
|---|---|
| Ventajas | Resuelve el residuo vivo completo: 98 reconocidos + 126 Test clasificados/fuera; detector queda limpio y semánticamente correcto; valor patrimonial reconocido = real (9,93 M, sin los 12 M fantasma) |
| Riesgos | Suma de B y C (ambos bajos, ambos con firma) |
| Trazabilidad | Máxima (dos sellos de lote: apertura + exclusión) |
| Complejidad | Media |
| Impacto | Estado final íntegro y explicable |
| Auditoría | Óptima |
| Reversibilidad | Sí (rollback de apertura; reversión de status) |
| Riesgo de fabricar historia | **NO** |

## Matriz comparativa

| Criterio (mandato §G16) | A | B | C | D |
|---|---|---|---|---|
| Trazabilidad | Débil | Fuerte | Media | **Máxima** |
| Complejidad | Alta | Media-baja | Baja | Media |
| Impacto en operación | Positivo | Positivo | Parcial | **Positivo completo** |
| Posibilidad de auditoría | Con disclaimers | **Sí** | Sí | **Sí** |
| Reversibilidad | Compleja | Sí | Media | **Sí** |
| Riesgo de fabricar historia | **ALTO** | No | No | **No** |
| Riesgo técnico | Alto | Medio-bajo | Bajo | Medio-bajo |

## Recomendación

**OPTION D** — apertura formal auditada (B) sobre las 98 posiciones demostradas +
exclusión formal de los 10 Test (C restringido). Fundamentos: es la única combinación
que reconoce TODA la posición demostrable sin fabricar una sola fila histórica; hereda
y supera la recomendación OBS-2 (B + C restringido) gracias al journal BE que convirtió
los 4 deltas de «no reconstruibles» a «CONFIRMED evento a evento»; y es la única con
reversibilidad limpia y trazabilidad end-to-end de un solo batch.
