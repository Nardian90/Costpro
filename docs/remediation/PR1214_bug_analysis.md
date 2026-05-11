# Análisis y Solución de Bug de Estado - PR #1214 (Revisado)

## Problema
Se detectó un bug en el módulo de costos introducido en el PR #1214 que causa que los valores manuales (fijos) ingresados en la columna "Total" de una fila con hijos sean sobrescritos automáticamente por la suma de sus hijos (`sum(children)`).

### Causa Raíz
El problema era doble:

1.  **Falta de Pinning en la UI**: Al guardar un valor manual en la columna Total (`handleTotalSave`), no se establecía el atributo `calculationMethod` como `ValorFijo`. Esto impedía que el sistema supiera que el usuario deseaba "anclar" ese valor.
2.  **Lógica del Mapeador Agresiva**: En `shared-mapping.ts`, el mapeador `buildEngineRows` asignaba automáticamente la fórmula `sum(children)` a cualquier fila con hijos que no tuviera una fórmula explícita, sin verificar si la fila estaba marcada como fija (`isFixedValue`).

## Solución Aplicada

Se han implementado los siguientes cambios para restaurar el comportamiento esperado:

### 1. Componente UI (`CostSheetInteractiveTable.tsx`)
-   Se actualizó `handleTotalSave` para que, al ingresar un valor manual, se asigne `calculationMethod: 'ValorFijo'`.
-   Se añadió lógica para limpiar `calculationMethod` (set to `null`) cuando se ingresa una fórmula (empezando con `=`), permitiendo que el motor determine el método correcto.
-   Se corrigió `handleVHSave` para evitar cambios accidentales en el método de cálculo de la fila al editar solo el Valor Histórico.

### 2. Mapeador del Motor (`shared-mapping.ts`)
-   Se modificó la función `buildEngineRows` para que la asignación automática de `sum(children)` solo ocurra si la fila **no** está marcada como fija (`!isFixedValue`). Esto garantiza que si un usuario ancla un Total manual, el motor respete ese valor en lugar de recalcularlo desde los hijos.

## Verificación
-   Se verificó que el mapeador `MassiveGenerator.utils.ts` utiliza `ValorFijo` como valor canónico para identificar filas ancladas.
-   Se ejecutaron los tests de regresión del `cost-engine` y `shared-mapping` para asegurar que el flujo de cálculo general no se vea afectado.
