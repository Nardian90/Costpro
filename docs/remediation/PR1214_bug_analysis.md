# Análisis de Regresión - PR #1214

## Problema 1: Corrupción de datos entre secciones en Modo Experto

### Causa Raíz
En `CostSheetView.tsx`, al renderizar secciones individuales dentro de accordions en el Modo Experto, se pasaba un array singleton `sections={[section]}` a los componentes `CostSheetInteractiveTable` y `CostSheetCardView`.

Debido a que estos componentes utilizan el índice de la sección dentro del array propocionado para construir las rutas de actualización del store de Zustand (ej. `['sections', sectionIndex, 'rows', ...]`), el índice siempre resultaba ser `0`. Esto causaba que cualquier edición realizada en cualquier sección (que no fuera la primera) sobrescribiera los datos de la primera sección en el store global.

### Solución
Pasar el array completo de secciones (`data.sections`) a los componentes hijos y utilizar el prop `activeSubSectionId` (o filtrar externamente manteniendo la referencia de índice correcta) para asegurar que el `sectionIndex` mapee correctamente al store de Zustand.

---

## Problema 2: Pérdida de valores manuales y fórmulas abreviadas en la columna Total

### Causa Raíz
La lógica de `handleTotalSave` introducida en el PR #1214 trataba cualquier entrada que no comenzara con `=` como un valor numérico puro. Esto tenía dos efectos negativos:
1. **Pérdida de persistencia del Motor**: Al guardar solo en `row.total` y limpiar las fórmulas sin establecer el `calculationMethod` a `FIJO`, el motor de cálculo sobrescribía el valor manual en el siguiente ciclo de cálculo (generalmente a 0 si `valorHistorico` estaba vacío).
2. **Rotura de fórmulas abreviadas**: Entradas como `AnexoI` o `ref('1')` (sin el `=` inicial), que son válidas en el sistema de sugerencias, eran procesadas por `parseFloat`, resultando en `NaN` o `0`, y borrando la intención original del usuario.

### Solución
1. Detectar si la entrada es una fórmula abreviada (compara con sugerencias o patrones conocidos) o si comienza con `=`.
2. Si es un valor numérico manual, establecer explícitamente `calculationMethod: 'FIJO'` y actualizar `valorHistorico` para que el motor de cálculo respete y persista el valor.
3. Asegurar que las actualizaciones utilicen `updateValues` para mantener la atomicidad del estado cuando se cambian múltiples campos de una fila.
