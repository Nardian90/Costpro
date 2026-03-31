# Evaluación de Mejoras en el Motor de Matching IPV

## Estado Anterior (Antes de los Fixes)
**Puntaje: 3/10**

### Deficiencias Identificadas:
1.  **Fallo en Lógica de Negocio (STOCK_LIMIT):** La propiedad `allowNegativeStock` se inicializaba como `true` por defecto incluso cuando la regla de límite de stock estaba activa. Esto invalidaba el propósito principal de la regla.
2.  **Inseguridad en Descomposición:** El proceso de descomposición automática de productos (ej. de caja a unidades) no verificaba si el producto "ancestro" tenía stock suficiente, lo que podía resultar en inventarios negativos ocultos.
3.  **Inconsistencia en Lotes (CASH_FILL):** Durante el procesamiento por lotes (`reconcileAll`), la regla `CASH_FILL` consultaba la base de datos para verificar el límite diario. Dado que las transacciones del lote aún no se habían persistido, el límite se ignoraba para múltiples transacciones del mismo día dentro del mismo lote.
4.  **Rendimiento:** Múltiples consultas a IndexedDB dentro de un bucle sincrónico de matching degradaban el rendimiento en lotes grandes.

---

## Estado Actual (Después de los Fixes)
**Puntaje: 9/10**

### Mejoras Implementadas:
1.  **Corrección de Inversión Lógica:** Ahora `allowNegativeStock` es `false` por defecto si `STOCK_LIMIT` está activo. Solo permite negativos si se configura explícitamente en la metadata de la regla.
2.  **Guardrail de Descomposición:** Se añadió una validación crítica en `attemptDecomposition` que aborta la operación si el stock del ancestro resultaría negativo, protegiendo la integridad del inventario.
3.  **Rastreador de CASH_FILL en Memoria:** `reconcileAll` ahora mantiene un mapa en memoria del uso de `CASH_FILL` por fecha durante la ejecución del lote. Esto garantiza que el límite diario se respete estrictamente incluso antes de persistir los cambios.
4.  **Optimización de Consultas:** Se redujeron las llamadas redundantes a la base de datos al pasar el estado acumulado (CASH_FILL) y el mapa de stock completo al motor.

## Resumen de Cambios Técnicos
-   **src/lib/ipv/engine.ts**: Modificado constructor, `reconcileAll`, `matchTransaction`, `attemptDecomposition`.
-   **src/lib/ipv/matching.worker.ts**: (Verificado) Soporta el paso de `stockMap` completo.
-   **src/components/views/terminal/views/ipv/IPVView.tsx**: (Verificado) Calcula y provee el `stockMap` íntegro desde el estado de la UI.
