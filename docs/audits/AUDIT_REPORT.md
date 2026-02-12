# Informe de Auditoría de Ficha de Costo

## Resumen de Hallazgos

A continuación se presenta un resumen de los hallazgos de la auditoría, comparando la vista de la ficha de costo en la aplicación con el archivo de FC adjunto.

### Coincidencias

Los siguientes campos y secciones de la aplicación coinciden con el archivo de FC adjunto:

*   **Anexo I - Materias Primas y Materiales:** Todos los datos y cálculos son correctos.
*   **Anexo II - Mano de Obra Directa:** Todos los datos y cálculos son correctos.
*   **Anexo IV - Otros Gastos Directos:** Todos los datos y cálculos son correctos.
*   **Anexo V - Dietas de Trabajadores:** Todos los datos y cálculos son correctos.

### Discrepancias

Se han identificado las siguientes discrepancias críticas que afectan el cálculo del costo final:

*   **Cálculo de Prorrateo:** El método de cálculo `Prorrateo` es incorrecto. Actualmente, el "Total" de las filas que utilizan este método se establece incorrectamente en el "Valor Histórico", en lugar de ser prorrateado en función de la base de cálculo especificada. Esto afecta a las siguientes secciones:
    *   **Gastos Asociados Prod.**
    *   **Gtos. Grales y Admón.**

*   **Cálculo de Impuestos:** Las fórmulas para los "Gastos Tributarios" son incorrectas. Solo tienen en cuenta los salarios directos (`2.1`) y excluyen otros tipos de salarios (`4.1`, `6.1`, `7.1`), lo que da lugar a una evaluación de impuestos incorrecta.

*   **Cálculo de Depreciación:** El "Total de Depreciación" no se está calculando correctamente a partir de su anexo correspondiente. El componente parece estar ignorando el `baseDeCalculoRef` cuando hay elementos secundarios presentes, lo que da lugar a un error de cálculo significativo.

*   **Anexo III - Depreciación de Activos Fijos:** La columna `Deprec.` (Depreciación) no se está calculando correctamente. La fórmula `(purchase_value * (depreciation_percent / 100)) / usage_time` no se está aplicando. En su lugar, el `depreciation_cost` se establece incorrectamente en un valor diferente, lo que lleva a un total significativamente inflado para este anexo.

*   **Resultados Finales:** Debido a los problemas anteriores, todos los campos de resumen, incluidos **TOTAL COSTOS Y GASTOS**, **Utilidad**, **Precio o Tarifa Final** y los costos unitarios, son incorrectos.

### Recomendaciones

Para alinear la aplicación con el archivo de FC adjunto, se recomienda lo siguiente:

*   **Corregir el Cálculo de Prorrateo:** Implementar la lógica de prorrateo correcta en el hook `useCostSheetCalculator` para garantizar que los totales se calculen con precisión.
*   **Corregir el Cálculo de Impuestos:** Actualizar las fórmulas de impuestos para incluir todos los tipos de salarios relevantes.
*   **Corregir el Cálculo de Depreciación:** Asegurarse de que el `baseDeCalculoRef` se utilice correctamente para calcular el total de depreciación a partir del Anexo III.
*   **Corregir la Fórmula del Anexo III:** Implementar la fórmula de depreciación correcta en el Anexo III para garantizar que los costos de depreciación se calculen con precisión.
*   **Verificación y Pruebas:** Después de implementar estas correcciones, realizar una verificación completa y pruebas para garantizar que todos los cálculos en toda la aplicación sean precisos y coincidan con el archivo de FC adjunto.
