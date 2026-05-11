# Análisis y Solución de Bug de Estado - PR #1214

## Problema
Se detectó un bug en el módulo de costos introducido en el PR #1214 que afecta la carga y persistencia de valores manuales (fijos) y fórmulas en las columnas de "Valor Histórico" y "Total".

### Causa Raíz
El problema reside en los manejadores de guardado (`handleVHSave` y `handleTotalSave`) dentro del componente `CostSheetInteractiveTable.tsx`. Cuando un usuario ingresa un valor numérico manual (no una fórmula que empiece con `=`), el estado de la fila no se actualiza para marcar el método de cálculo como fijo (`calculationMethod: 'FIJO'`).

Debido a esto, el motor de cálculo (`cost-engine`), al procesar la ficha:
1. Detecta que la fila (especialmente si es una fila padre con hijos) no tiene una fórmula explícita.
2. Al no estar marcada como `FIJO`, aplica la lógica por defecto de `sum(children)`.
3. Sobrescribe el valor manual ingresado por el usuario con el resultado del cálculo automático.

## Solución
Se modificaron los manejadores `handleVHSave` y `handleTotalSave` para asegurar que:
- Si el valor comienza con `=`, se trate como una fórmula y se limpie cualquier valor fijo previo.
- Si el valor es numérico, se establezca explícitamente el `calculationMethod` como `FIJO` y se actualicen los campos correspondientes (`valorHistorico` o `value`/`total`), asegurando que el motor de cálculo respete la entrada manual.

## Cambios realizados
En `src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx`:
- Actualización de `handleVHSave` para incluir `updateValue([...path, 'calculationMethod'], 'FIJO')` en el flujo de valor manual.
- Actualización de `handleTotalSave` para incluir `updateValue([...path, 'calculationMethod'], 'FIJO')` en el flujo de valor manual.
