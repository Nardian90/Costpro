# Informe de Auditoría Contable y Técnica - CostPro v5.7.25

## 1. Hallazgos Críticos Identificados

### A. Duplicidad de Saldos en Sección 1 (Gasto Material)
- **Problema:** Las filas 1.1.2, 1.1.3 y 1.1.4 muestran un saldo de **1,648.00 CUP**, idéntico al de la fila 1.1.1.
- **Causa Técnica:** El "Smart Fallback" implementado anteriormente asignaba el total del anexo si no encontraba una coincidencia exacta de clasificación. Como el Anexo I solo tiene datos para "1.1.1", el resto de las filas del grupo heredaban el total de forma errónea.
- **Impacto:** Inflado artificial del Costo Total (6,592.00 en lugar de 1,648.00).

### B. Propagación de Valores no Numéricos (NaN)
- **Problema:** Múltiples secciones (4.1, 6.1, 7.1, 8.1, 9.1) reportan **NaN** en la trazabilidad de cálculo.
- **Causa Técnica:** Fórmulas de prorrateo histórico (e.g., `vh(associated)/vh(base)*ref(base)`) están ejecutando divisiones por cero cuando el valor histórico de la base es 0.
- **Impacto:** Ruptura total de la cadena de suma hacia el Costo Total (Fila 5) y Gastos (Fila 11).

### C. Inestabilidad por Ciclos y Amortiguación
- **Problema:** El log de auditoría muestra `CYCLE_DETECTED` para filas que no tienen dependencias circulares obvias (e.g., Sección 10).
- **Causa Técnica:** La inestabilidad de los valores `NaN` está impidiendo la convergencia del motor iterativo, activando falsas alarmas de ciclos.

### D. Discrepancia en Base Tributaria (Sección 10)
- **Problema:** Gastos Tributarios reportan **42,231.13 CUP** para un salario base de 45.00 CUP.
- **Causa:** Dependencia de filas con error (`NaN`) y suma incorrecta de componentes.

## 2. Plan de Optimización Logística (Estrategia de Especialista)

1.  **Agregación por Prefijo:** Las filas solo sumarán partidas del anexo que **comiencen** con su clasificación (e.g., 2.1 sumará 2.1.1, 2.1.2). Si no hay coincidencia de prefijo, el valor será 0.
2.  **Blindaje Matemático:** Interceptar cualquier resultado `NaN` o `Infinity` en el evaluador de expresiones y forzarlo a 0, registrando un aviso en la auditoría.
3.  **Normalización de Contexto:** Asegurar que las variables de anexo sean insensibles a mayúsculas de forma nativa en el motor, no solo por traducción.
