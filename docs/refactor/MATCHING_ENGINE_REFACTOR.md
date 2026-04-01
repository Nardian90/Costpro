# Refactor del Motor de Matching (engine.ts) - CostPro v8.1

Este documento describe el refactor aplicado al `MatchingEngine` para eliminar la rigidez del pipeline de ejecución y permitir una extensibilidad real basada en prioridades de reglas.

## Problema Identificado

Anteriormente, el método `matchTransaction` ejecutaba las reglas de matching de forma secuencial y hardcodeada (PASS 0 a 6). Aunque el constructor ordenaba las reglas por prioridad, el código no utilizaba este orden, lo que hacía que la configuración de prioridades en la interfaz de usuario fuera ilusoria.

## Cambios Realizados

1.  **Extracción de Lógica de Reglas**: Se han extraído los bloques de lógica de cada regla (`HARD_REF`, `EXACT_SUM`, `PRICE_FLEX`, `WILDCARDS`, `TOLERANCE`, `CASH_FILL`) a métodos privados dedicados:
    *   `handleHardRef`
    *   `handleExactSum`
    *   `handlePriceFlex`
    *   `handleWildcards`
    *   `handleTolerance`
    *   `handleCashFill`
2.  **Pipeline Dinámico**: Se ha implementado un método `executeRule` que actúa como despachador (dispatcher) y un bucle en `matchTransaction` que recorre `this.rules` (ordenadas por prioridad).
3.  **Preservación de Estado**: El pipeline dinámico mantiene el estado de `remaining_cents`, `lines`, `logs` y `trace` a lo largo de la ejecución de las reglas.
4.  **Optimización y Caché**: La lógica de pre-chequeo (`AUTO_COMPLETE`) y el hit de caché se mantienen al inicio para asegurar el máximo rendimiento.

## Arquitectura Resultante

El flujo de matching ahora sigue este patrón:

1.  **Filtros Iniciales**: Débitos, exclusiones y caché.
2.  **Ejecución de Reglas (Loop)**:
    ```typescript
    for (const rule of this.rules) {
      if (remaining_cents <= 0) break;
      remaining_cents = await this.executeRule(rule, ...);
    }
    ```
3.  **Finalización**: Verificación de completitud, generación de movimientos pendientes y persistencia de logs.

## Beneficios

*   **Flexibilidad**: El orden de ejecución ahora respeta estrictamente la prioridad configurada en la base de datos/UI.
*   **Mantenibilidad**: Es mucho más sencillo añadir nuevas reglas (solo se requiere un nuevo método y un caso en el switch de `executeRule`).
*   **Aislamiento**: Los fallos en una regla están mejor encapsulados dentro de su respectivo manejador.
*   **Trazabilidad**: Se mantiene la generación detallada de trazas y logs para el usuario.

## Verificación

Se han ejecutado las pruebas unitarias existentes (`engine.test.ts`) y todas han pasado exitosamente, confirmando que la funcionalidad core se mantiene intacta y estable.
