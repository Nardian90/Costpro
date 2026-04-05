# Auditoría: Corrección de Límite de Stock en Motor de Matching IPV

## Identificación del Problema
Se detectó que la regla `STOCK_LIMIT` con la configuración `allow_negative: false` no era respetada correctamente por la sub-regla `HARD_REF` (Referencia Directa).

### Causa Raíz
El método `applyHardRef` calculaba la cantidad (`qty`) basándose únicamente en el importe de la transacción, sin verificar si dicha cantidad excedía el stock disponible (o virtual) del producto, incluso cuando el control de stock negativo estaba activado.

## Impacto
* Inconsistencia en los niveles de inventario.
* Posibilidad de generar stock negativo a pesar de tener la restricción activa en la configuración de reglas.
* Desviación de los principios de integridad del módulo de Inventario.

## Solución Aplicada
Se modificó `src/lib/ipv/engine.ts` para:
1. Validar el stock disponible antes de asignar la cantidad en `applyHardRef`.
2. Intentar la descomposición de productos padres si el stock es insuficiente.
3. Limitar la cantidad (`qty`) al stock disponible real si `allowNegativeStock` es `false`.
4. Registrar un fallo (`FAIL`) en la traza si no hay stock disponible y la regla es mandatoria.

## Verificación
Se creó un caso de prueba de reproducción en `src/lib/ipv/__tests__/stock_limit_repro.test.ts` que confirma que el motor ahora respeta los límites de stock y no permite matches que resulten en stock negativo bajo la configuración mencionada.

**Estado:** Solucionado Definitivamente.
