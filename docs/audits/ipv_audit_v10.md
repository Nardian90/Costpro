# AUDITORÍA ENTERPRISE IPV - COSTPRO v3.0

**Fecha:** 2026-04-10
**Auditor:** Principal Software Engineer (Jules)
**Módulo:** IPV / Reporte IPV

---

## FASE 1 — EVALUACIÓN INICIAL (SCORING MILIMÉTRICO)

| Dimensión | Score | Justificación Técnica |
| :--- | :---: | :--- |
| **Arquitectura** | 7 | Uso correcto de Dexie y servicios, pero lógica de reportes acoplada a la vista y dependiente de estados previos. |
| **Lógica de negocio** | 5 | **CRÍTICO.** Dualidad en cálculo de stock (`StockService` vs `createReportForDate`). Riesgo de divergencia alto. |
| **Acoplamiento** | 6 | El reporte diario depende del reporte del día anterior (`lastReport`), creando una cadena de fallo frágil. |
| **Escalabilidad** | 6 | Generación masiva en hilo de UI. La cadena de dependencia dificulta regeneraciones parciales consistentes. |
| **Performance** | 7 | Eficiente por ser local, pero realiza cálculos redundantes que deberían estar centralizados. |
| **Mantenibilidad** | 6 | Lógica de agregación dispersa. Difícil de evolucionar sin romper la consistencia entre reportes. |
| **Robustez** | 5 | La integridad del reporte depende de que el reporte previo sea "perfecto". No hay auto-curación basada en la verdad del log. |
| **Modelo de datos** | 8 | Estructura sólida, uso de hashes de integridad y versionado de base de datos robusto. |

**SCORE GLOBAL: 6.25/10**

---

## FASE 2 — DIAGNÓSTICO CRÍTICO PROFUNDO

### 1. [CRITICAL] Divergencia de Verdad (Stock Calculation)
- **Tipo:** CRITICAL / Error de negocio
- **Impacto:** Alto
- **Área afectada:** `IPVReportView.tsx`, `StockService.ts`
- **Descripción:** `IPVReportView` calcula el stock final de forma manual (`initial + entries - exits - venta`) basándose en el reporte anterior. `StockService` lo calcula agregando todos los movimientos históricos. Si un reporte se genera con datos parciales, el error se propaga perpetuamente en los reportes de IPV, mientras que el Dashboard (que usa el Service) mostrará datos diferentes.
- **Consecuencia:** Pérdida de confianza del usuario. El inventario "contable" no cuadra con el "real/teórico".

### 2. [BLOCKER] Cadena de Dependencia Frágil (`lastReport`)
- **Tipo:** BLOCKER / Anti-pattern
- **Impacto:** Alto
- **Área afectada:** `createReportForDate`
- **Descripción:** La función `createReportForDate` busca el `lastReport` para obtener el `existencia_final_qty`. Si el usuario borra un reporte intermedio o cambia la fecha de una transacción antigua, los reportes futuros NO se actualizan automáticamente.
- **Consecuencia:** Integridad referencial temporal rota. Obliga a regeneraciones manuales masivas y ciegas.

### 3. [IMPROVEMENT] Agregación Redundante en UI
- **Tipo:** IMPROVEMENT / Deuda técnica
- **Impacto:** Medio
- **Área afectada:** `IPVReportView.tsx`
- **Descripción:** El mapeo de productos y agregación de líneas de conciliación se hace dentro del componente React. Esto dificulta las pruebas unitarias de la lógica contable.
- **Consecuencia:** Dificultad para implementar tests de regresión contable automáticos.

---

## FASE 3 — PLAN DE MEJORA ESTRATÉGICO

### Quick Wins (Prioridad 1)
- **Objetivo:** Unificar el cálculo de stock inicial/final.
- **Acción:** Refactorizar `createReportForDate` para que use `StockService.getProductDetailedStats` para una fecha específica (snapshot temporal) en lugar de leer del `lastReport`.
- **Riesgo:** Bajo.

### Refactor Estructural (Prioridad 2)
- **Objetivo:** Desvincular reportes de la UI.
- **Acción:** Crear un `ReportService.ts` que encapsule la lógica de generación. Implementar un sistema de "Dirty Flag" o regeneración en cascada si se detectan cambios en fechas pasadas.

### Cambios Críticos (Prioridad 1)
- **Objetivo:** Garantizar fuente única de verdad.
- **Acción:** Asegurar que `TransactionBreakdown` y `IPVReportView` consuman el mismo selector/hook de datos agregados.

---

## FASE 4 — SIMULACIÓN POST-MEJORA

- **Nueva arquitectura:** Basada en Snapshots de `StockService`. Los reportes son vistas materializadas de la verdad atómica (movimientos + líneas).
- **Flujo de datos:** Flujo unidireccional: `db -> StockService -> (Report/Dashboard/Breakdown)`.
- **Riesgos potenciales:** Mayor carga computacional al generar reportes (se compensa con cache de snapshots).

---

## FASE 5 — REEVALUACIÓN FINAL (PROYECTADA)

| Dimensión | Score | Delta |
| :--- | :---: | :---: |
| Arquitectura | 9 | +2 |
| Lógica de negocio | 10 | +5 |
| Robustez | 9 | +4 |

**SCORE GLOBAL PROYECTADO: 9.1/10**

---

## FASE 6 — FEEDBACK ESTRATÉGICO GUIADO

**Pregunta 1: Estrategia de cálculo de saldo inicial**
A) Mantener dependencia del reporte anterior (Cierre de ayer = Apertura de hoy). *Conservador.*
B) Calcular apertura dinámicamente desde el inicio de los tiempos/snapshot de inventario. *Recomendado.*
C) Forzar un "Cierre de Inventario" mensual inmutable. *Agresivo.*

**Recomendación: B**
**Justificación:** Elimina el error en cadena y permite que correcciones en el pasado se reflejen automáticamente en el presente sin intervención manual.

**Pregunta 2: Manejo de discrepancias retrospectivas**
A) Bloquear edición de transacciones una vez generado el reporte IPV.
B) Permitir edición y marcar reportes afectados como "Desincronizados".
C) Permitir edición y regenerar automáticamente reportes posteriores en segundo plano.

**Recomendación: C**
**Justificación:** En un entorno monousuario local, el costo de regeneración es bajo y garantiza que la "única fuente de verdad" se mantenga siempre.

**Pregunta 3: Velocidad vs Consistencia en Reportes Mensuales**
A) Generación "Lazy": solo se calcula cuando el usuario abre el reporte.
B) Generación en lote (Batch): como está ahora, pero optimizado.
C) Pre-cálculo mediante triggers en DB (Dexie Hooks).

**Recomendación: B**
**Justificación:** Mantiene el control del usuario sobre cuándo se "oficializan" los datos, pero con lógica unificada.

---

## FASE 7 — EVALUACIÓN DE RIESGO GLOBAL

- **Technical Risk Score:** 4/10 (Riesgo bajo por ser entorno local Dexie).
- **Probabilidad de regresión:** 15% (Principalmente en el cálculo de saldos iniciales de productos sin movimientos).
- **Complejidad de implementación:** Media.
