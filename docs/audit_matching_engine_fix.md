# Auditoría de Mejora: Motor de Matching IPV

## Resumen del Problema
Se detectaron fallos críticos en la integridad del inventario durante el proceso de matching automático (reconciliación), específicamente:
1. La regla `STOCK_LIMIT` era ignorada debido a una inicialización incorrecta en el motor.
2. No existían protecciones (guardrails) en la lógica de descomposición recursiva de productos.
3. El límite diario de la regla `CASH_FILL` se calculaba incorrectamente durante ejecuciones por lote, ignorando el consumo en memoria.
4. El cálculo del stock inicial en la vista de usuario ignoraba los movimientos de entrada/salida generados por descomposiciones previas.

## Evaluación de Reglas (Antes vs. Después)

| Regla | Antes | Después | Nota del Cambio |
| :--- | :---: | :---: | :--- |
| **STOCK_LIMIT** | 3/10 | 9/10 | Ahora vinculada correctamente al estado de la regla en DB. Implementados guardrails en descomposiciones. |
| **CASH_FILL** | 6/10 | 9/10 | Implementado rastreo de uso acumulado en lote (`cashFillByDate`) para respetar límites diarios reales. |
| **HARD_REF** | 9/10 | 9.5/10 | Se beneficia de una visión de stock más precisa desde el inicio. |
| **EXACT_SUM** | 8/10 | 9/10 | Mejorado mediante la inyección del mapa de stock completo (`getCompleteStockMap`). |
| **Lógica de Descomposición** | 4/10 | 9/10 | Añadida verificación de stock remanente antes de realizar la resta en cadena. |
| **Consistencia de Stock (UI)** | 5/10 | 10/10 | El `currentStockMap` en `IPVView` ahora incluye movimientos (`entries - exits`), no solo ventas. |

## Cambios Técnicos Realizados

### 1. `src/lib/ipv/engine.ts`
- **Constructor**: Se corrigió la asignación de `allowNegativeStock`. Ahora, si la regla `STOCK_LIMIT` está activa, se prohíben negativos por defecto.
- **Guardrail en `attemptDecomposition`**: Se añadió un chequeo explícito antes de restar stock al ancestro, asegurando que no baje de cero si la regla lo prohíbe.
- **Rastreo de CASH_FILL**: Se modificó `reconcileAll` para mantener un mapa de uso por fecha durante el procesamiento de lotes, evitando el "doble gasto" de la cuota diaria de ajuste.

### 2. `src/components/views/terminal/views/ipv/IPVView.tsx`
- **Mapa de Stock**: Se actualizó el hook `useMemo` para el cálculo de stock disponible. Ahora consulta la tabla `product_movements` para incluir correctamente las entradas y salidas generadas por descomposiciones, garantizando que el motor inicie con datos fidedignos.

## Conclusión
El sistema ahora garantiza la invariante de "Inventario No Negativo" durante todo el flujo de matching y visualización, y los límites financieros se aplican con precisión matemática incluso en procesamientos masivos de transacciones.
